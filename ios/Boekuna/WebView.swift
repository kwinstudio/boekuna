import SwiftUI
import UIKit
import WebKit

final class BrowserModel: ObservableObject {
    @Published var isLoading = true
    @Published var failureMessage: String?
    /// Fills the strip behind the status bar; follows the page's theme-color.
    @Published var statusBarColor = Color.white

    fileprivate weak var webView: WKWebView?
    fileprivate let startURL = URL(string: "https://app.boekuna.nl/?login=1&app=1")!
    private var themeColorObservation: NSKeyValueObservation?
    private var triedOfflineCopy = false

    fileprivate func attach(_ webView: WKWebView) {
        self.webView = webView
        themeColorObservation = webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                self?.statusBarColor = webView.themeColor.map { Color(uiColor: $0) } ?? .white
            }
        }
        guard webView.url == nil else { return }
        loadStartPage(in: webView)
    }

    fileprivate func loadStartPage(in webView: WKWebView) {
        failureMessage = nil
        isLoading = true
        triedOfflineCopy = false
        webView.load(URLRequest(url: startURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    /// Local-first only: without a connection, open the last copy of the app that WebKit cached.
    /// Returns false when there is nothing to try, so the normal error screen shows.
    fileprivate func loadOfflineCopy(after error: NSError) -> Bool {
        let offline = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
                       NSURLErrorCannotFindHost, NSURLErrorTimedOut, NSURLErrorDataNotAllowed]
        guard LocalFirstFlags.enabled, !triedOfflineCopy, error.domain == NSURLErrorDomain,
              offline.contains(error.code), let webView else { return false }
        triedOfflineCopy = true
        webView.load(URLRequest(url: startURL, cachePolicy: .returnCacheDataDontLoad))
        return true
    }

    func retry() {
        guard let webView else { return }
        failureMessage = nil
        isLoading = true
        if webView.url == nil {
            loadStartPage(in: webView)
        } else {
            webView.reloadFromOrigin()
        }
    }
}

struct BoekunaWebView: UIViewRepresentable {
    @ObservedObject var model: BrowserModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController.add(context.coordinator, name: "boekunaPrint")
        configuration.userContentController.add(context.coordinator, name: "boekunaShare")
        configuration.userContentController.addUserScript(WKUserScript(
            source: NativeShareBridge.script, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        if LocalFirstFlags.enabled {
            LocalFirstBridge.install(in: configuration, bridge: LocalFirstBridge())
        }

        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        configuration.applicationNameForUserAgent = "BoekunaNative/\(version) Boekuna-iOS/\(version)"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 246 / 255, green: 247 / 255, blue: 248 / 255, alpha: 1)

#if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
#endif

        model.attach(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
        private let model: BrowserModel
        private var downloadURLs: [ObjectIdentifier: URL] = [:]

        init(model: BrowserModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.failureMessage = nil
            model.isLoading = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.failureMessage = nil
            model.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        private func report(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            if model.loadOfflineCopy(after: nsError) { return }
            model.isLoading = false
            model.failureMessage = "Controleer je internetverbinding en probeer het opnieuw."
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let decision = NativeNavigationPolicy.decide(
                url, download: navigationAction.shouldPerformDownload,
                isMainFrame: navigationAction.targetFrame?.isMainFrame != false
            )
            // Reject purchases/prohibited schemes in every frame before permitting
            // HTTPS document previews (for example an authenticated storage URL).
            if decision == .blocked {
                decisionHandler(.cancel)
                return
            }
            if navigationAction.targetFrame?.isMainFrame == false,
               url.scheme?.lowercased() == "https", !navigationAction.shouldPerformDownload {
                decisionHandler(.allow)
                return
            }
            switch decision {
            case .blocked:
                decisionHandler(.cancel)
            case .externalPage:
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            case .download:
                decisionHandler(.download)
            case .internalPage:
                decisionHandler(.allow)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            model.isLoading = false
            model.failureMessage = "Boekuna is onderbroken. Probeer opnieuw te laden."
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            switch NativeNavigationPolicy.decide(url, download: navigationAction.shouldPerformDownload) {
            case .externalPage:
                UIApplication.shared.open(url)
            case .internalPage, .download:
                if url.absoluteString != "about:blank" {
                    webView.load(navigationAction.request)
                }
            case .blocked:
                break
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            presentAlert(title: "Boekuna", message: message, actions: [
                UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }
            ], fallback: completionHandler)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            guard let presenter = topViewController() else {
                completionHandler(false)
                return
            }
            let alert = UIAlertController(title: "Boekuna", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Annuleren", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            guard let presenter = topViewController() else {
                completionHandler(nil)
                return
            }
            let alert = UIAlertController(title: "Boekuna", message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Annuleren", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
            presenter.present(alert, animated: true)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == "app.boekuna.nl",
                  message.frameInfo.securityOrigin.protocol == "https" else { return }
            if message.name == "boekunaShare" {
                share(message.body, from: message.webView)
                return
            }
            // Render the existing report locally; no document content leaves this bridge.
            guard message.name == "boekunaPrint",
                  let body = message.body as? [String: Any],
                  let html = body["html"] as? String, !html.isEmpty,
                  topViewController() != nil else { return }
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = "Boekuna rapport"
            info.outputType = .general
            controller.printInfo = info
            controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
            controller.present(animated: true) { _, _, _ in }
        }

        /// navigator.share replacement: same share sheet, but mail text that survives Gmail.
        private func share(_ body: Any, from webView: WKWebView?) {
            guard let body = body as? [String: Any], let id = body["id"] as? String,
                  id.allSatisfy(\.isNumber) else { return }
            func finish(_ ok: Bool, _ error: String = "AbortError") {
                webView?.evaluateJavaScript("window.__boekunaShareDone && window.__boekunaShareDone('\(id)', \(ok), '\(error)')")
            }

            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            var items: [Any] = []
            let title = body["title"] as? String ?? ""
            let text = body["text"] as? String ?? ""
            if !text.isEmpty || !title.isEmpty {
                items.append(ShareTextItem(title: title, text: text))
            }
            if let link = body["url"] as? String, let url = URL(string: link), url.scheme == "https" {
                items.append(url)
            }
            for file in body["files"] as? [[String: Any]] ?? [] {
                guard let base64 = file["data"] as? String, let data = Data(base64Encoded: base64) else { continue }
                let name = ((file["name"] as? String ?? "") as NSString).lastPathComponent
                let safeName = name.isEmpty || name.hasPrefix(".") ? "Boekuna-bestand" : name
                let url = folder.appendingPathComponent(safeName)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try data.write(to: url, options: .completeFileProtection)
                    items.append(url)
                } catch {
                    continue
                }
            }

            guard !items.isEmpty, let presenter = topViewController() else {
                try? FileManager.default.removeItem(at: folder)
                finish(false, items.isEmpty ? "DataError" : "AbortError")
                return
            }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                try? FileManager.default.removeItem(at: folder)
                finish(completed)
            }
            if let popover = sheet.popoverPresentationController, let webView {
                popover.sourceView = webView
                popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            presenter.present(sheet, animated: true)
        }

        private func presentAlert(title: String, message: String, actions: [UIAlertAction], fallback: @escaping () -> Void) {
            guard let presenter = topViewController() else {
                fallback()
                return
            }
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            actions.forEach(alert.addAction)
            presenter.present(alert, animated: true)
        }

        private func topViewController() -> UIViewController? {
            let root = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: { $0.isKeyWindow })?
                .rootViewController

            var current = root
            while let presented = current?.presentedViewController {
                current = presented
            }
            if let navigation = current as? UINavigationController { return navigation.visibleViewController ?? navigation }
            if let tabs = current as? UITabBarController { return tabs.selectedViewController ?? tabs }
            return current
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            model.isLoading = false
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            model.isLoading = false
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let filename = (suggestedFilename as NSString).lastPathComponent
            let safeName = filename.isEmpty || filename == "." || filename == ".." ? "Boekuna-bestand" : filename
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
                .appendingPathComponent(safeName)
            do {
                try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                downloadURLs[ObjectIdentifier(download)] = destination
                completionHandler(destination)
            } catch {
                downloadURLs.removeValue(forKey: ObjectIdentifier(download))
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) else { return }
            guard let presenter = topViewController() else {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
                return
            }
            let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            share.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            }
            presenter.present(share, animated: true)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            if let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            }
            model.isLoading = false
            model.failureMessage = "Het bestand kon niet worden gedownload. Probeer het opnieuw."
        }
    }
}

/// Mail text for the share sheet. Mail apps show the subject separately, so the
/// first line goes when it repeats it. Both Gmail and Outlook ignore HTML here,
/// so every app gets plain text, shaped per app:
/// - Gmail turns every enter into a space, so lines also carry U+2028 (line
///   separator), which a web view still breaks on.
/// - Outlook turns every enter into a new paragraph, so single enters only.
/// - Other apps: lines together, one blank line between paragraphs.
private final class ShareTextItem: NSObject, UIActivityItemSource {
    let title: String
    let text: String

    init(title: String, text: String) {
        self.title = title
        self.text = text
    }

    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any {
        text
    }

    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
        let blocks = Self.mailBlocks(title: title, text: text)
        let type = activityType?.rawValue.lowercased() ?? ""
        if type.contains("gmail") {
            return blocks.map { $0.joined(separator: "\n\u{2028}") }.joined(separator: "\n\u{2028}\u{2028}")
        }
        if type.contains("outlook") {
            return blocks.flatMap { $0 }.joined(separator: "\n")
        }
        return blocks.map { $0.joined(separator: "\n") }.joined(separator: "\n\n")
    }

    func activityViewController(_ activityViewController: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
        title
    }

    /// Paragraphs of the mail. "Label: value" lines stay together, as do the
    /// closing and the signature under it.
    static func mailBlocks(title: String, text: String) -> [[String]] {
        var lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if let first = lines.first, first == title.trimmingCharacters(in: .whitespaces) {
            lines.removeFirst()
        }
        func isDetail(_ line: String) -> Bool {
            guard let colon = line.firstIndex(of: ":") else { return false }
            let label = line[..<colon]
            return !label.isEmpty && label.count <= 30 && line.index(after: colon) < line.endIndex
        }
        var blocks: [[String]] = []
        var inClosing = false
        for line in lines {
            if let previous = blocks.last?.last, inClosing || (isDetail(previous) && isDetail(line)) {
                blocks[blocks.count - 1].append(line)
            } else {
                blocks.append([line])
            }
            if line.lowercased().hasPrefix("met vriendelijke groet") { inClosing = true }
        }
        return blocks
    }
}

/// Replaces navigator.share/canShare in the app so sharing goes through the
/// native share sheet above. Files travel as base64 to the app only.
enum NativeShareBridge {
    static let script = """
    (function () {
      var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.boekunaShare;
      if (!handler) return;
      var pending = {}, seq = 0;
      window.__boekunaShareDone = function (id, ok, errorName) {
        var entry = pending[id];
        if (!entry) return;
        delete pending[id];
        if (ok) entry.resolve();
        else entry.reject(new DOMException(errorName === 'AbortError' ? 'Share canceled' : 'Share failed', errorName || 'AbortError'));
      };
      function readFile(file) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            var value = String(reader.result || '');
            resolve({ name: file.name || 'Boekuna-bestand', type: file.type || 'application/octet-stream', data: value.slice(value.indexOf(',') + 1) });
          };
          reader.onerror = function () { reject(reader.error); };
          reader.readAsDataURL(file);
        });
      }
      function canShare(data) {
        if (!data) return false;
        if (data.files && data.files.length) return true;
        return !!(data.text || data.url || data.title);
      }
      function share(data) {
        data = data || {};
        if (!canShare(data)) return Promise.reject(new TypeError('Nothing to share'));
        return Promise.all(Array.prototype.map.call(data.files || [], readFile)).then(function (files) {
          return new Promise(function (resolve, reject) {
            var id = String(++seq);
            pending[id] = { resolve: resolve, reject: reject };
            handler.postMessage({ id: id, title: String(data.title || ''), text: String(data.text || ''), url: String(data.url || ''), files: files });
          });
        });
      }
      Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
      Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true, writable: true });
    })();
    """
}
