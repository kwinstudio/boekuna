import CoreGraphics
import CoreText
import Foundation
import ImageIO

// Compiled with swiftc on macOS CI together with LocalFirstOCR.swift and
// LocalFirstDraftStore.swift. Vision and PDFKit are the same frameworks as on
// iOS; this proves the code paths, not iPhone speed or camera behaviour.

@main
struct LocalFirstTests {
    static var passed = 0

    static func check(_ condition: Bool, _ message: String) {
        precondition(condition, message)
        passed += 1
    }

    static func main() throws {
        layout()
        try draftStore()
        try visionImage()
        try pdf()
        print("PASS local-first: \(passed) checks")
    }

    // MARK: Layout and normalisation

    static func layout() {
        let box = LocalOCRLayout.pixelBox(topLeft: CGPoint(x: 0.1, y: 0.9), topRight: CGPoint(x: 0.5, y: 0.9),
                                          bottomRight: CGPoint(x: 0.5, y: 0.8), bottomLeft: CGPoint(x: 0.1, y: 0.8),
                                          width: 1000, height: 2000)
        check(box == [[100, 200], [500, 200], [500, 400], [100, 400]], "Vision corners become top-left pixel corners: \(box)")
        let row = { (text: String, x: Double, y: Double) in
            LocalOCRRow(text: text, confidence: 0.9, box: [[x, y], [x + 80, y], [x + 80, y + 20], [x, y + 20]])
        }
        let rows = [row("121,00", 400, 101), row("Totaal", 10, 100), row("Leverancier BV", 10, 10)]
        check(LocalOCRLayout.sorted(rows).map(\.text) == ["Leverancier BV", "Totaal", "121,00"], "Reading order top-down, left-right")
        check(LocalOCRLayout.text(rows) == "Leverancier BV\nTotaal 121,00", "Rows on one line are joined: \(LocalOCRLayout.text(rows))")
        check(LocalOCRLayout.normalize("A\u{00A0}\u{2013}  B\t \u{201C}x\u{201D}\n  C ") == "A - B \"x\"\nC", "Normalisation matches the web app")
        check(LocalOCRLayout.meanConfidence([]) == nil, "No confidence without rows")
        let tileRow = row("x", 0, 880)
        check(!LocalOCRLayout.keepInTile(tileRow, tileTop: 0, tileBottom: 900, overlap: 135, isFirst: true, isLast: false),
              "Overlap at the bottom of a tile belongs to the next tile")
        check(LocalOCRLayout.keepInTile(tileRow, tileTop: 765, tileBottom: 1665, overlap: 135, isFirst: false, isLast: true),
              "The next tile keeps that row")
    }

    // MARK: Offline drafts

    static func draftStore() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("boekuna-drafts-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        var clock = Date(timeIntervalSince1970: 1_800_000_000)
        var limits = OfflineDraftLimits()
        limits.maxDraftsPerAccount = 3
        limits.maxBytesPerDraft = 64
        let store = OfflineDraftStore(root: root, limits: limits, now: { clock })
        let alice = "6b1d2c9e-0000-4000-8000-000000000001", bob = "6b1d2c9e-0000-4000-8000-000000000002"
        let ocr = LocalOCRDocument(pageCount: 1, pages: [LocalOCRPage(page: 1, width: 10, height: 10, source: "vision",
                                                                      rows: [], text: "Totaal 121,00", meanConfidence: 0.9, durationMs: 5)])

        let first = try store.save(userId: alice, name: "../../bon.pdf", mimeType: "application/pdf", kind: "purchase",
                                   data: Data("%PDF-a".utf8), ocr: ocr)
        check(first.name == "bon.pdf", "File names cannot escape the draft folder")
        check(first.clientRef == "ios-draft-" + first.id && first.clientRef.count <= 120, "Stable client reference for the upload flow")
        check(first.ocrCharacters == 13 && first.pageCount == 1, "OCR summary is stored with the draft")
        let again = try store.save(userId: alice, name: "bon.pdf", mimeType: "application/pdf", kind: "purchase",
                                   data: Data("%PDF-a".utf8), ocr: nil)
        check(again.id == first.id, "The same file twice stays one draft")
        check(try store.list(userId: alice).count == 1, "One draft listed")
        check(try store.list(userId: bob).isEmpty, "Another account never sees the draft")
        check((try? store.read(userId: bob, id: first.id)) == nil, "Another account cannot read the draft")
        check(try store.read(userId: alice, id: first.id).data == Data("%PDF-a".utf8), "Original bytes are kept unchanged")
        check(try store.readOCR(userId: alice, id: first.id)?.text == "Totaal 121,00", "OCR text is kept")
        check((try? store.read(userId: alice, id: "../" + first.id)) == nil, "Path traversal in ids is rejected")
        check((try? store.list(userId: "../etc")) == nil, "Invalid account ids are rejected")
        check(try store.save(userId: alice, name: "x", mimeType: "text/html", kind: "evil", data: Data("b".utf8), ocr: nil).mimeType
              == "application/octet-stream", "Unknown MIME types are neutralised")
        _ = try store.save(userId: alice, name: "c.jpg", mimeType: "image/jpeg", kind: "auto", data: Data("c".utf8), ocr: nil)
        do {
            _ = try store.save(userId: alice, name: "d.jpg", mimeType: "image/jpeg", kind: "auto", data: Data("d".utf8), ocr: nil)
            check(false, "Draft limit must hold")
        } catch OfflineDraftError.tooManyDrafts { check(true, "Draft limit") }
        do {
            _ = try store.save(userId: bob, name: "big.pdf", mimeType: "application/pdf", kind: "auto", data: Data(count: 65), ocr: nil)
            check(false, "Size limit must hold")
        } catch OfflineDraftError.tooLarge { check(true, "Size limit") }

        let resumed = try store.save(userId: bob, name: "half.pdf", mimeType: "application/pdf", kind: "auto",
                                     data: Data("%PDF-half".utf8), ocr: nil, clientRef: "file-abc123")
        check(resumed.clientRef == "file-abc123", "An interrupted upload keeps its own client reference")
        let unsafe = try store.save(userId: bob, name: "u.pdf", mimeType: "application/pdf", kind: "auto",
                                    data: Data("%PDF-u".utf8), ocr: nil, clientRef: "../x")
        check(unsafe.clientRef == "ios-draft-" + unsafe.id, "Unsafe client references are replaced")
        let attempted = try store.markAttempt(userId: alice, id: first.id, error: "NETWORK_ERROR<script>")
        check(attempted.attempts == 1 && attempted.lastError == "NETWORK_ERRORscript", "Attempts recorded, error text sanitised")
        try store.delete(userId: alice, id: first.id)
        check(try store.list(userId: alice).count == 2, "Delete removes one draft")

        clock = clock.addingTimeInterval(31 * 86_400)
        check(try store.list(userId: alice).isEmpty, "Drafts older than the retention period are removed")
        _ = try store.save(userId: bob, name: "e.pdf", mimeType: "application/pdf", kind: "auto", data: Data("e".utf8), ocr: nil)
        try store.deleteAll(userId: bob)
        check(try store.list(userId: bob).isEmpty, "Account deletion removes every draft")
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: root.path)
        check(leftovers.allSatisfy { !$0.contains(alice) && !$0.contains(bob) }, "Folder names never contain the account id")
    }

    // MARK: Vision OCR on generated images

    static func visionImage() throws {
        let lines = ["Kantoorartikelen BV", "Factuurnummer INV-2026-17", "Totaal EUR 121,00"]
        let image = render(lines, width: 1400, height: 900)
        let rows = try VisionTextRecognizer().recognize(image)
        let text = LocalOCRLayout.text(rows)
        check(text.contains("INV-2026-17") && text.contains("121,00"), "Vision reads invoice text: \(text)")
        check(rows.allSatisfy { $0.box.count == 4 && $0.confidence > 0 && $0.confidence <= 1 }, "Rows follow the processor contract")
        check(rows.allSatisfy { row in row.box.allSatisfy { $0[0] >= -2 && $0[0] <= 1402 && $0[1] >= -2 && $0[1] <= 902 } },
              "Boxes are inside the image")

        let rotated = rotate90(image)
        let result = try VisionTextRecognizer().recognizeAnyOrientation(rotated)
        check(LocalOCRLayout.text(result.rows).contains("121,00"), "A sideways photo is still read: \(LocalOCRLayout.text(result.rows))")

        let cancelled = LocalOCRCancellation()
        cancelled.cancel()
        check((try? VisionTextRecognizer().recognize(image, cancellation: cancelled)) == nil, "Cancellation stops OCR")

        let png = pngData(image)
        let document = try LocalDocumentReader().read(data: png, mimeType: "image/png", name: "bon.png")
        check(document.pageCount == 1 && document.pages[0].source == "vision" && document.text.contains("121,00"),
              "PNG goes through the full reader")
        check((try? LocalDocumentReader().read(data: Data("not an image".utf8), mimeType: "image/jpeg", name: "x.jpg")) == nil,
              "Unreadable images fail clearly")
    }

    // MARK: PDF

    static func pdf() throws {
        let digital = makePDF(pages: [.text(["Digitale factuur BV", "Factuurnummer DIG-2026-1", "Subtotaal 100,00", "Btw 21% 21,00", "Totaal 121,00"])])
        let doc = try LocalDocumentReader().read(data: digital, mimeType: "application/pdf", name: "digitaal.pdf")
        check(doc.pages.map(\.source) == ["pdf-text"], "Readable PDF text is used without OCR")
        check(doc.text.contains("DIG-2026-1"), "Embedded text is kept: \(doc.text)")

        let scan = render(["Gescande bon BV", "Totaal 109,00"], width: 1240, height: 1754)
        let mixed = makePDF(pages: [.text(["Pagina een met genoeg tekst om als digitaal te gelden", "Factuurnummer MIX-1"]), .image(scan)])
        let mixedDoc = try LocalDocumentReader().read(data: mixed, mimeType: "application/pdf", name: "mix.pdf")
        check(mixedDoc.pageCount == 2 && mixedDoc.pages.map(\.source) == ["pdf-text", "vision"], "Only the scanned page gets OCR")
        check(mixedDoc.pages[1].text.contains("109,00"), "Scanned PDF page is read: \(mixedDoc.pages[1].text)")
        check(mixedDoc.pages.map(\.page) == [1, 2], "Page order is preserved")

        var limits = LocalOCRLimits()
        limits.maxPages = 1
        do {
            _ = try LocalDocumentReader(limits: limits).read(data: mixed, mimeType: "application/pdf", name: "mix.pdf")
            check(false, "Too many pages must be refused")
        } catch LocalOCRError.tooManyPages(let count) { check(count == 2, "Page limit is explicit, never truncated") }
        check((try? LocalDocumentReader().read(data: Data("%PDF-broken".utf8), mimeType: "application/pdf", name: "b.pdf")) == nil,
              "Broken PDFs fail clearly")
    }

    // MARK: Helpers

    enum Page { case text([String]), image(CGImage) }

    static func render(_ lines: [String], width: Int, height: Int) -> CGImage {
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        draw(lines, in: context, height: CGFloat(height), size: 46)
        return context.makeImage()!
    }

    static func draw(_ lines: [String], in context: CGContext, height: CGFloat, size: CGFloat) {
        let font = CTFontCreateWithName("Helvetica" as CFString, size, nil)
        for (index, line) in lines.enumerated() {
            let attributed = NSAttributedString(string: line, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 0, green: 0, blue: 0, alpha: 1)
            ])
            context.textPosition = CGPoint(x: size * 1.5, y: height - size * 2.2 * CGFloat(index + 1))
            CTLineDraw(CTLineCreateWithAttributedString(attributed), context)
        }
    }

    static func rotate90(_ image: CGImage) -> CGImage {
        let context = CGContext(data: nil, width: image.height, height: image.width, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.translateBy(x: CGFloat(image.height), y: 0)
        context.rotate(by: .pi / 2)
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return context.makeImage()!
    }

    static func pngData(_ image: CGImage) -> Data {
        let data = NSMutableData()
        let destination = CGImageDestinationCreateWithData(data as CFMutableData, "public.png" as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
        return data as Data
    }

    static func makePDF(pages: [Page]) -> Data {
        let data = NSMutableData()
        var media = CGRect(x: 0, y: 0, width: 595, height: 842)
        let consumer = CGDataConsumer(data: data as CFMutableData)!
        let context = CGContext(consumer: consumer, mediaBox: &media, nil)!
        for page in pages {
            context.beginPDFPage(nil)
            switch page {
            case .text(let lines): draw(lines, in: context, height: 842, size: 14)
            case .image(let image): context.draw(image, in: media)
            }
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }
}
