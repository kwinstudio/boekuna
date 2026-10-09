import AVFoundation
import UIKit
import VisionKit
import WebKit

// Local-first features for the existing web app, behind one build flag
// (BOEKUNA_LOCAL_FIRST, default NO). With the flag off nothing below is
// registered and the app behaves exactly as before.
//
// The web app stays in charge: it decides when to scan, when a document is
// kept as an offline draft and when a draft is handed to the existing upload
// and server processing. Native code only scans, reads text and stores files.
// Only the main frame of https://app.boekuna.nl can call this bridge.

enum LocalFirstFlags {
    static var enabled: Bool {
        let value = (Bundle.main.object(forInfoDictionaryKey: "BoekunaLocalFirst") as? String) ?? ""
        return ["YES", "TRUE", "1"].contains(value.uppercased())
    }
}

enum LocalFirstBridgeRequest {
    static let maxBase64Characters = 21 * 1024 * 1024

    /// Same origin rule as the print bridge: production web app, main frame, HTTPS.
    static func isTrusted(host: String, scheme: String, isMainFrame: Bool) -> Bool {
        isMainFrame && scheme == "https" && host == "app.boekuna.nl"
    }

    static func decode(_ base64: Any?) -> Data? {
        guard let text = base64 as? String, !text.isEmpty, text.count <= maxBase64Characters else { return nil }
        return Data(base64Encoded: text)
    }
}

final class LocalFirstBridge: NSObject, WKScriptMessageHandlerWithReply, VNDocumentCameraViewControllerDelegate {
    static let handlerName = "boekunaNative"

    /// Declares the bridge to the web app; never injected into other origins or frames.
    static let userScript = WKUserScript(source: """
        (function(){try{if(location.protocol!=='https:'||location.host!=='app.boekuna.nl')return;
        Object.defineProperty(window,'BoekunaNativeLocalFirst',{value:Object.freeze({version:1}),configurable:false,writable:false});}catch(e){}})();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)

    private let queue = DispatchQueue(label: "nl.boekuna.local-first", qos: .userInitiated)
    private let reader = LocalDocumentReader()
    private var store: OfflineDraftStore?
    private var running: LocalOCRCancellation?
    private var scanReply: ((Any?, String?) -> Void)?
    private var memoryObserver: NSObjectProtocol?

    override init() {
        super.init()
        store = (try? OfflineDraftStore.defaultRoot()).map { OfflineDraftStore(root: $0) }
        memoryObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.running?.cancel() }
    }

    deinit {
        if let memoryObserver { NotificationCenter.default.removeObserver(memoryObserver) }
    }

    static func install(in configuration: WKWebViewConfiguration, bridge: LocalFirstBridge) {
        configuration.userContentController.addUserScript(userScript)
        configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: handlerName)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard LocalFirstBridgeRequest.isTrusted(host: message.frameInfo.securityOrigin.host,
                                                scheme: message.frameInfo.securityOrigin.protocol,
                                                isMainFrame: message.frameInfo.isMainFrame),
              let body = message.body as? [String: Any], let action = body["action"] as? String else {
            replyHandler(nil, "FORBIDDEN")
            return
        }
        let reply: (Any?, String?) -> Void = { value, error in DispatchQueue.main.async { replyHandler(value, error) } }
        switch action {
        case "capabilities":
            reply(["version": 1, "scanner": VNDocumentCameraViewController.isSupported, "ocr": true,
                   "pdf": true, "drafts": store != nil], nil)
        case "scan":
            startScan(reply)
        case "ocr":
            guard let data = LocalFirstBridgeRequest.decode(body["base64"]) else { return reply(nil, "INVALID_REQUEST") }
            let mime = body["mimeType"] as? String ?? "", name = body["name"] as? String ?? "document"
            runOCR(data: data, mime: mime, name: name) { result in
                switch result {
                case .success(let document): reply(Self.json(document), nil)
                case .failure(let error): reply(nil, (error as? LocalOCRError)?.code ?? "OCR_FAILED")
                }
            }
        case "draftSave":
            saveDraft(body, reply)
        default:
            handleDraft(action, body, reply)
        }
    }

    // MARK: - Scanner (VisionKit: edge detection, perspective correction, retake, multiple pages)

    private func startScan(_ reply: @escaping (Any?, String?) -> Void) {
        guard VNDocumentCameraViewController.isSupported else { return reply(nil, "SCANNER_UNAVAILABLE") }
        guard scanReply == nil else { return reply(nil, "SCANNER_BUSY") }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .denied, .restricted: return reply(nil, "CAMERA_PERMISSION_DENIED")
        default: break
        }
        guard let presenter = Self.topViewController() else { return reply(nil, "SCANNER_UNAVAILABLE") }
        scanReply = reply
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = self
        presenter.present(scanner, animated: true)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        // One page at a time: full-resolution scans are large, only the compressed JPEG is kept.
        var jpegs: [Data] = []
        for index in 0..<scan.pageCount {
            autoreleasepool {
                if let jpeg = Self.scanPageJPEG(scan.imageOfPage(at: index)) { jpegs.append(jpeg) }
            }
        }
        controller.dismiss(animated: true)
        let reply = scanReply, complete = jpegs.count == scan.pageCount
        scanReply = nil
        queue.async {
            guard complete, let pdf = Self.scanPDF(jpegs) else {
                reply?(nil, "SCAN_FAILED")
                return
            }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "nl_NL")
            formatter.dateFormat = "yyyy-MM-dd HH.mm"
            reply?(["name": "Scan \(formatter.string(from: Date())).pdf", "mimeType": "application/pdf",
                    "pages": jpegs.count, "base64": pdf.base64EncodedString()], nil)
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        scanReply?(["cancelled": true], nil)
        scanReply = nil
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        scanReply?(nil, "SCAN_FAILED")
        scanReply = nil
    }

    /// A scanned page as JPEG, capped at 2400 px so a multi-page receipt stays well under the 15 MB upload limit.
    static func scanPageJPEG(_ image: UIImage) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, 2400 / max(longest, 1))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.8)
    }

    /// One PDF page per scanned page at about 200 dpi, so the page keeps its real-world size.
    static func scanPDF(_ jpegs: [Data]) -> Data? {
        let pages: [(UIImage, CGSize)] = jpegs.compactMap { jpeg in
            guard let image = UIImage(data: jpeg) else { return nil }
            return (image, CGSize(width: image.size.width * 72 / 200, height: image.size.height * 72 / 200))
        }
        guard !pages.isEmpty, pages.count == jpegs.count else { return nil }
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: pages[0].1))
        return renderer.pdfData { context in
            for (image, size) in pages {
                let rect = CGRect(origin: .zero, size: size)
                context.beginPage(withBounds: rect, pageInfo: [:])
                image.draw(in: rect)
            }
        }
    }

    // MARK: - OCR and drafts

    private func runOCR(data: Data, mime: String, name: String, completion: @escaping (Result<LocalOCRDocument, Error>) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            let cancellation = LocalOCRCancellation()
            DispatchQueue.main.sync { self.running = cancellation }
            let result = Result { try self.reader.read(data: data, mimeType: mime, name: name, cancellation: cancellation) }
            DispatchQueue.main.sync { if self.running === cancellation { self.running = nil } }
            completion(result)
        }
    }

    private func saveDraft(_ body: [String: Any], _ reply: @escaping (Any?, String?) -> Void) {
        guard let store, let userId = body["userId"] as? String,
              let data = LocalFirstBridgeRequest.decode(body["base64"]) else { return reply(nil, "INVALID_REQUEST") }
        let mime = body["mimeType"] as? String ?? "", name = body["name"] as? String ?? "document"
        let kind = body["kind"] as? String ?? "auto"
        // The file is stored even when OCR fails or runs out of memory; OCR is only a convenience.
        runOCR(data: data, mime: mime, name: name) { result in
            do {
                let meta = try store.save(userId: userId, name: name, mimeType: mime, kind: kind, data: data,
                                          ocr: try? result.get(), clientRef: body["clientRef"] as? String)
                reply(Self.json(meta), nil)
            } catch {
                reply(nil, (error as? OfflineDraftError)?.code ?? "DRAFT_SAVE_FAILED")
            }
        }
    }

    private func handleDraft(_ action: String, _ body: [String: Any], _ reply: @escaping (Any?, String?) -> Void) {
        guard let store, let userId = body["userId"] as? String else { return reply(nil, "INVALID_REQUEST") }
        let id = body["id"] as? String ?? ""
        queue.async {
            do {
                switch action {
                case "draftList":
                    reply(Self.json(try store.list(userId: userId)), nil)
                case "draftRead":
                    let draft = try store.read(userId: userId, id: id)
                    reply(["meta": Self.json(draft.meta) ?? [:], "base64": draft.data.base64EncodedString()], nil)
                case "draftText":
                    reply(["text": try store.readOCR(userId: userId, id: id)?.text ?? ""], nil)
                case "draftAttempt":
                    reply(Self.json(try store.markAttempt(userId: userId, id: id, error: body["error"] as? String)), nil)
                case "draftDelete":
                    try store.delete(userId: userId, id: id)
                    reply(["deleted": true], nil)
                case "draftClear":
                    try store.deleteAll(userId: userId)
                    reply(["deleted": true], nil)
                default:
                    reply(nil, "UNKNOWN_ACTION")
                }
            } catch {
                reply(nil, (error as? OfflineDraftError)?.code ?? "DRAFT_FAILED")
            }
        }
    }

    private static func json<T: Encodable>(_ value: T) -> Any? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(value) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private static func topViewController() -> UIViewController? {
        var current = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })?
            .rootViewController
        while let presented = current?.presentedViewController { current = presented }
        return current
    }
}
