import ExpoModulesCore
import UIKit
import Vision

public class QuitteOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("QuitteOcr")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      let url: URL? = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
      guard let fileUrl = url,
            let data = try? Data(contentsOf: fileUrl),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "De foto kon niet gelezen worden.")
        return
      }

      let request = VNRecognizeTextRequest { req, error in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
        var out: [[String: Any]] = []
        for o in observations {
          guard let candidate = o.topCandidates(1).first else { continue }
          let b = o.boundingBox
          out.append([
            "text": candidate.string,
            "x": Double(b.origin.x),
            "y": Double(1 - b.origin.y - b.size.height),
            "w": Double(b.size.width),
            "h": Double(b.size.height),
          ])
        }
        promise.resolve(out)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = false
      if #available(iOS 16.0, *) {
        request.automaticallyDetectsLanguage = true
      }

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }
}
