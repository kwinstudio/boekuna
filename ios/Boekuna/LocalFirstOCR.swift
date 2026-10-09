import CoreGraphics
import Foundation
import ImageIO
import PDFKit
import Vision

// On-device text recognition with Apple's Vision and PDFKit.
// Output follows the existing document processor's OCR row contract
// (text, confidence 0...1, four-point pixel box with a top-left origin), so the
// existing Document Intelligence stays the only place that interprets the text.
// OCR confidence says how sure Vision is about the characters, never whether an
// amount, supplier or VAT figure is financially correct.
// UIKit-free on purpose: the same file compiles for macOS CI benchmarks.

struct LocalOCRRow: Codable, Equatable {
    let text: String
    let confidence: Double
    /// [[x, y]] top-left, top-right, bottom-right, bottom-left in pixels; empty for embedded PDF text.
    let box: [[Double]]
}

struct LocalOCRPage: Codable, Equatable {
    let page: Int
    let width: Int
    let height: Int
    /// "pdf-text" when the PDF already had readable text, otherwise "vision".
    let source: String
    let rows: [LocalOCRRow]
    let text: String
    let meanConfidence: Double?
    let durationMs: Int
}

struct LocalOCRDocument: Codable, Equatable {
    var engine = "apple-vision"
    let pageCount: Int
    let pages: [LocalOCRPage]
    var text: String { pages.map(\.text).filter { !$0.isEmpty }.joined(separator: "\n\n") }
}

enum LocalOCRError: Error, Equatable {
    case unreadableImage
    case unreadablePDF
    case encryptedPDF
    case tooManyPages(Int)
    case tooLarge
    case cancelled

    var code: String {
        switch self {
        case .unreadableImage: return "DOCUMENT_IMAGE_UNREADABLE"
        case .unreadablePDF: return "DOCUMENT_PDF_UNREADABLE"
        case .encryptedPDF: return "DOCUMENT_PDF_ENCRYPTED"
        case .tooManyPages: return "DOCUMENT_TOO_MANY_PAGES"
        case .tooLarge: return "DOCUMENT_TOO_LARGE"
        case .cancelled: return "CANCELLED"
        }
    }
}

/// Shared between a running job and whoever may stop it (user, memory warning).
final class LocalOCRCancellation {
    private let lock = NSLock()
    private var flag = false
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return flag }
    func cancel() { lock.lock(); flag = true; lock.unlock() }
    func check() throws { if isCancelled { throw LocalOCRError.cancelled } }
}

struct LocalOCRLimits {
    /// Matches DOCUMENT_MAX_SIZE_MB in the web app.
    var maxBytes = 15 * 1024 * 1024
    /// Larger PDFs are refused explicitly; pages are never skipped silently.
    var maxPages = 50
    /// Above this the image is scaled down once before OCR (memory bound).
    var maxPixels = 36_000_000
    /// Longest side when rendering a scanned PDF page (about 300 dpi for A4).
    var maxRenderSide: CGFloat = 3_500
    /// A PDF page with at least this many non-space characters is treated as readable text.
    var minEmbeddedTextCharacters = 40
}

enum LocalOCRLayout {
    /// Vision's normalized, bottom-left-origin corners to pixel corners with a top-left origin.
    static func pixelBox(topLeft: CGPoint, topRight: CGPoint, bottomRight: CGPoint, bottomLeft: CGPoint,
                         width: Int, height: Int, offsetY: Double = 0) -> [[Double]] {
        [topLeft, topRight, bottomRight, bottomLeft].map { point in
            [round2(Double(point.x) * Double(width)),
             round2((1 - Double(point.y)) * Double(height) + offsetY)]
        }
    }

    /// Same order as the processor's ocr_rows: top to bottom, then left to right.
    static func sorted(_ rows: [LocalOCRRow]) -> [LocalOCRRow] {
        rows.sorted { a, b in
            let pa = position(a), pb = position(b)
            return pa.y == pb.y ? pa.x < pb.x : pa.y < pb.y
        }
    }

    /// Reading-order text: rows whose vertical centres overlap become one line.
    static func text(_ rows: [LocalOCRRow]) -> String {
        var lines: [(center: Double, height: Double, items: [LocalOCRRow])] = []
        for row in sorted(rows) {
            guard let bounds = bounds(row) else {
                lines.append((Double(lines.count) * 1_000_000, 1, [row]))
                continue
            }
            let center = (bounds.minY + bounds.maxY) / 2, height = max(1, bounds.maxY - bounds.minY)
            if let index = lines.lastIndex(where: { abs($0.center - center) <= min($0.height, height) * 0.5 }) {
                lines[index].items.append(row)
            } else {
                lines.append((center, height, [row]))
            }
        }
        return lines
            .map { line in
                line.items
                    .sorted { (bounds($0)?.minX ?? 0) < (bounds($1)?.minX ?? 0) }
                    .map(\.text)
                    .joined(separator: " ")
            }
            .map(normalize)
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    /// Mirrors normalizeInvoiceText() in the web app.
    static func normalize(_ value: String) -> String {
        var text = value.replacingOccurrences(of: "\u{00A0}", with: " ")
        for dash in ["\u{2010}", "\u{2011}", "\u{2012}", "\u{2013}", "\u{2014}"] {
            text = text.replacingOccurrences(of: dash, with: "-")
        }
        text = text.replacingOccurrences(of: "\u{201C}", with: "\"")
            .replacingOccurrences(of: "\u{201D}", with: "\"")
            .replacingOccurrences(of: "\u{2019}", with: "'")
        let lines = text.components(separatedBy: "\n").map { line in
            line.split(whereSeparator: { $0 == " " || $0 == "\t" }).joined(separator: " ")
        }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func meanConfidence(_ rows: [LocalOCRRow]) -> Double? {
        guard !rows.isEmpty else { return nil }
        return round2(rows.map(\.confidence).reduce(0, +) / Double(rows.count) * 100) / 100
    }

    /// Rows from a tall tile keep only what lies outside the overlap owned by a neighbour.
    static func keepInTile(_ row: LocalOCRRow, tileTop: Double, tileBottom: Double,
                           overlap: Double, isFirst: Bool, isLast: Bool) -> Bool {
        guard let bounds = bounds(row) else { return true }
        let center = (bounds.minY + bounds.maxY) / 2
        let lower = isFirst ? -Double.infinity : tileTop + overlap / 2
        let upper = isLast ? Double.infinity : tileBottom - overlap / 2
        return center >= lower && center < upper
    }

    static func bounds(_ row: LocalOCRRow) -> CGRect? {
        let xs = row.box.compactMap { $0.first }, ys = row.box.compactMap { $0.count > 1 ? $0[1] : nil }
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return nil }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    private static func position(_ row: LocalOCRRow) -> (y: Double, x: Double) {
        guard let rect = bounds(row) else { return (1e9, 1e9) }
        return (Double(rect.minY), Double(rect.minX))
    }

    private static func round2(_ value: Double) -> Double { (value * 100).rounded() / 100 }
}

struct VisionTextRecognizer {
    /// Dutch first; English covers most foreign suppliers.
    var languages = ["nl-NL", "en-US"]
    /// Language correction can turn digits into letters (IBAN, invoice numbers); keep it off.
    var usesLanguageCorrection = false

    func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation = .up,
                   offsetY: Double = 0, cancellation: LocalOCRCancellation? = nil) throws -> [LocalOCRRow] {
        try cancellation?.check()
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = usesLanguageCorrection
        let supported = (try? request.supportedRecognitionLanguages()) ?? []
        let chosen = languages.filter { supported.contains($0) }
        request.recognitionLanguages = chosen.isEmpty ? ["en-US"] : chosen
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        try handler.perform([request])
        try cancellation?.check()
        let swapped = [.left, .leftMirrored, .right, .rightMirrored].contains(orientation)
        let width = swapped ? image.height : image.width, height = swapped ? image.width : image.height
        return (request.results ?? []).compactMap { observation -> LocalOCRRow? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let text = LocalOCRLayout.normalize(candidate.string)
            guard !text.isEmpty else { return nil }
            return LocalOCRRow(
                text: text,
                confidence: Double(candidate.confidence),
                box: LocalOCRLayout.pixelBox(topLeft: observation.topLeft, topRight: observation.topRight,
                                             bottomRight: observation.bottomRight, bottomLeft: observation.bottomLeft,
                                             width: width, height: height, offsetY: offsetY)
            )
        }
    }

    /// Upright pass first; sideways or upside-down photos only cost extra passes when the first one reads little.
    func recognizeAnyOrientation(_ image: CGImage, cancellation: LocalOCRCancellation? = nil)
        throws -> (rows: [LocalOCRRow], orientation: CGImagePropertyOrientation) {
        func score(_ rows: [LocalOCRRow]) -> Double { rows.reduce(0) { $0 + $1.confidence * Double($1.text.count) } }
        var best = (rows: try recognize(image, cancellation: cancellation), orientation: CGImagePropertyOrientation.up)
        let confident = best.rows.filter { $0.confidence >= 0.5 }.count
        guard confident < 4 else { return best }
        for orientation in [CGImagePropertyOrientation.right, .left, .down] {
            let rows = try recognize(image, orientation: orientation, cancellation: cancellation)
            if score(rows) > score(best.rows) * 1.25 { best = (rows, orientation) }
        }
        return best
    }

    /// Tall receipts are read in overlapping tiles so small text keeps enough pixels.
    func recognizeTall(_ image: CGImage, cancellation: LocalOCRCancellation? = nil) throws -> [LocalOCRRow] {
        let width = Double(image.width), height = Double(image.height)
        guard height > width * 2.6 else { return try recognizeAnyOrientation(image, cancellation: cancellation).rows }
        let tileHeight = (width * 1.6).rounded(), overlap = (tileHeight * 0.15).rounded()
        var rows: [LocalOCRRow] = [], top = 0.0
        while top < height {
            try cancellation?.check()
            let bottom = min(height, top + tileHeight)
            let isFirst = top == 0, isLast = bottom >= height
            try autoreleasepool {
                guard let tile = image.cropping(to: CGRect(x: 0, y: top, width: width, height: bottom - top)) else { return }
                rows += try recognize(tile, offsetY: top, cancellation: cancellation).filter {
                    LocalOCRLayout.keepInTile($0, tileTop: top, tileBottom: bottom, overlap: overlap, isFirst: isFirst, isLast: isLast)
                }
            }
            if isLast { break }
            top = bottom - overlap
        }
        return rows
    }
}

enum LocalImageLoader {
    /// Decodes JPEG/PNG/HEIC/TIFF, applies the EXIF orientation and bounds memory.
    /// The original bytes are never modified.
    static func load(_ data: Data, limits: LocalOCRLimits = LocalOCRLimits()) throws -> CGImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let pixelWidth = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let pixelHeight = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              pixelWidth > 0, pixelHeight > 0 else { throw LocalOCRError.unreadableImage }
        let scale = min(1, (Double(limits.maxPixels) / (pixelWidth * pixelHeight)).squareRoot())
        let maxSide = Int((max(pixelWidth, pixelHeight) * scale).rounded(.down))
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw LocalOCRError.unreadableImage
        }
        return image
    }
}

struct LocalDocumentReader {
    var recognizer = VisionTextRecognizer()
    var limits = LocalOCRLimits()

    func read(data: Data, mimeType: String, name: String, cancellation: LocalOCRCancellation? = nil) throws -> LocalOCRDocument {
        guard data.count <= limits.maxBytes else { throw LocalOCRError.tooLarge }
        let isPDF = mimeType.lowercased() == "application/pdf" || name.lowercased().hasSuffix(".pdf") || data.starts(with: Array("%PDF".utf8))
        return isPDF ? try readPDF(data, cancellation: cancellation) : try readImage(data, cancellation: cancellation)
    }

    func readImage(_ data: Data, cancellation: LocalOCRCancellation? = nil) throws -> LocalOCRDocument {
        let started = Date()
        let image = try LocalImageLoader.load(data, limits: limits)
        let rows = LocalOCRLayout.sorted(try recognizer.recognizeTall(image, cancellation: cancellation))
        let page = LocalOCRPage(page: 1, width: image.width, height: image.height, source: "vision", rows: rows,
                                text: LocalOCRLayout.text(rows), meanConfidence: LocalOCRLayout.meanConfidence(rows),
                                durationMs: milliseconds(since: started))
        return LocalOCRDocument(pageCount: 1, pages: [page])
    }

    /// Embedded text is used as is; only pages without readable text are rendered and recognized,
    /// one page at a time so a long PDF never sits in memory as bitmaps.
    func readPDF(_ data: Data, cancellation: LocalOCRCancellation? = nil) throws -> LocalOCRDocument {
        guard let document = PDFDocument(data: data) else { throw LocalOCRError.unreadablePDF }
        if document.isLocked && !document.unlock(withPassword: "") { throw LocalOCRError.encryptedPDF }
        let count = document.pageCount
        guard count > 0 else { throw LocalOCRError.unreadablePDF }
        guard count <= limits.maxPages else { throw LocalOCRError.tooManyPages(count) }
        var pages: [LocalOCRPage] = []
        for index in 0..<count {
            try cancellation?.check()
            let page: LocalOCRPage = try autoreleasepool {
                let started = Date()
                guard let pdfPage = document.page(at: index), let reference = pdfPage.pageRef else {
                    throw LocalOCRError.unreadablePDF
                }
                let box = reference.getBoxRect(.mediaBox)
                let embedded = LocalOCRLayout.normalize(pdfPage.string ?? "")
                if embedded.filter({ !$0.isWhitespace }).count >= limits.minEmbeddedTextCharacters {
                    let rows = embedded.components(separatedBy: "\n").map { LocalOCRRow(text: $0, confidence: 1, box: []) }
                    return LocalOCRPage(page: index + 1, width: Int(box.width), height: Int(box.height), source: "pdf-text",
                                        rows: rows, text: embedded, meanConfidence: nil, durationMs: milliseconds(since: started))
                }
                let image = try render(reference)
                let rows = LocalOCRLayout.sorted(try recognizer.recognizeAnyOrientation(image, cancellation: cancellation).rows)
                return LocalOCRPage(page: index + 1, width: image.width, height: image.height, source: "vision", rows: rows,
                                    text: LocalOCRLayout.text(rows), meanConfidence: LocalOCRLayout.meanConfidence(rows),
                                    durationMs: milliseconds(since: started))
            }
            pages.append(page)
        }
        return LocalOCRDocument(pageCount: count, pages: pages)
    }

    /// White background, page rotation applied, about 300 dpi capped at maxRenderSide.
    func render(_ page: CGPDFPage) throws -> CGImage {
        let box = page.getBoxRect(.mediaBox)
        let quarterTurns = ((page.rotationAngle % 360) + 360) % 360 / 90
        let pageWidth = quarterTurns % 2 == 1 ? box.height : box.width
        let pageHeight = quarterTurns % 2 == 1 ? box.width : box.height
        guard pageWidth > 0, pageHeight > 0 else { throw LocalOCRError.unreadablePDF }
        let scale = min(300.0 / 72.0, limits.maxRenderSide / max(pageWidth, pageHeight))
        let width = Int((pageWidth * scale).rounded()), height = Int((pageHeight * scale).rounded())
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { throw LocalOCRError.unreadablePDF }
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.interpolationQuality = .high
        // getDrawingTransform never scales up, so scale first and let it handle rotation and origin.
        context.scaleBy(x: scale, y: scale)
        context.concatenate(page.getDrawingTransform(.mediaBox, rect: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight),
                                                     rotate: 0, preserveAspectRatio: true))
        context.drawPDFPage(page)
        guard let image = context.makeImage() else { throw LocalOCRError.unreadablePDF }
        return image
    }

    private func milliseconds(since start: Date) -> Int { Int((Date().timeIntervalSince(start) * 1000).rounded()) }
}
