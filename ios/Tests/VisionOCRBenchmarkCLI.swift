import Foundation

// Benchmark helper, compiled with LocalFirstOCR.swift on macOS CI.
//   rows        reads image paths from stdin, prints one JSON line of OCR rows per image
//               (the processor's ocr_rows contract, so the existing parser can consume it)
//   doc <file>  runs the full on-device reader on a document and prints pages, timing and text

@main
struct VisionOCRBenchmarkCLI {
    static func main() throws {
        let arguments = CommandLine.arguments.dropFirst()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        switch arguments.first {
        case "rows":
            while let path = readLine() {
                let started = Date()
                var payload: [String: Any] = [:]
                do {
                    let image = try LocalImageLoader.load(try Data(contentsOf: URL(fileURLWithPath: path)))
                    let rows = try VisionTextRecognizer().recognize(image)
                    payload["rows"] = try JSONSerialization.jsonObject(with: encoder.encode(LocalOCRLayout.sorted(rows)))
                } catch {
                    payload["error"] = String(describing: error)
                    payload["rows"] = []
                }
                payload["ms"] = Int(Date().timeIntervalSince(started) * 1000)
                let line = try JSONSerialization.data(withJSONObject: payload)
                FileHandle.standardOutput.write(line + Data("\n".utf8))
            }
        case "doc":
            for path in arguments.dropFirst() {
                let url = URL(fileURLWithPath: path)
                let data = try Data(contentsOf: url)
                let mime = url.pathExtension.lowercased() == "pdf" ? "application/pdf" : "image/jpeg"
                let started = Date()
                let document = try LocalDocumentReader().read(data: data, mimeType: mime, name: url.lastPathComponent)
                let payload: [String: Any] = [
                    "file": url.lastPathComponent,
                    "ms": Int(Date().timeIntervalSince(started) * 1000),
                    "pageCount": document.pageCount,
                    "sources": document.pages.map(\.source),
                    "pageMs": document.pages.map(\.durationMs),
                    "meanConfidence": document.pages.compactMap(\.meanConfidence),
                    "text": document.text
                ]
                FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: payload) + Data("\n".utf8))
            }
        default:
            FileHandle.standardError.write(Data("usage: rows | doc <file>...\n".utf8))
            exit(2)
        }
    }
}
