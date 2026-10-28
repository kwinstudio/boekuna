import SwiftUI
import Photos

/// PhotoKit image requests only: videos get a poster, never a downloaded movie resource.
enum SwipeImageStage: Equatable {
    case local, network, sharp

    var targetSize: CGSize {
        self == .sharp ? CGSize(width: 1000, height: 1400) : CGSize(width: 480, height: 672)
    }
    var allowsNetwork: Bool { self != .local }
}

@MainActor
protocol SwipeImageProviding: AnyObject {
    func register(_ assets: [PHAsset])
    func requestImage(identifier: String, stage: SwipeImageStage,
                      completion: @escaping @MainActor (UIImage?) -> Void) -> PHImageRequestID
    func cancel(_ request: PHImageRequestID)
}

extension SwipeImageProviding {
    func register(_ assets: [PHAsset]) {}
}

@MainActor
private final class PhotoKitSwipeImages: SwipeImageProviding {
    private let manager: PHCachingImageManager
    private var assets: [String: PHAsset] = [:]
    private let decoding = DispatchQueue(label: "Fotoswipe.preview-decoding", qos: .userInitiated)

    init(manager: PHCachingImageManager) { self.manager = manager }

    func register(_ supplied: [PHAsset]) {
        assets = Dictionary(supplied.prefix(20).map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
    }

    func requestImage(identifier: String, stage: SwipeImageStage,
                      completion: @escaping @MainActor (UIImage?) -> Void) -> PHImageRequestID {
        guard let asset = assets[identifier] else {
            completion(nil)
            return PHInvalidImageRequestID
        }
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = stage.allowsNetwork
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isSynchronous = false
        let target = stage.targetSize
        let queue = decoding
        return manager.requestImage(for: asset, targetSize: target, contentMode: .aspectFit, options: options) { image, info in
            guard (info?[PHImageResultIsDegradedKey] as? Bool) != true else { return }
            guard let image, (info?[PHImageCancelledKey] as? Bool) != true else {
                Task { @MainActor in completion(nil) }
                return
            }
            queue.async {
                // Bound decoded dimensions even if PhotoKit supplies a larger image.
                // Drawing/preparing occurs here, not during the swipe's main-thread render.
                let decoded: UIImage = autoreleasepool {
                    let width = image.size.width * image.scale
                    let height = image.size.height * image.scale
                    let factor = min(1, min(target.width / max(1, width), target.height / max(1, height)))
                    if factor < 1 {
                        let size = CGSize(width: max(1, (width * factor).rounded(.down)),
                                          height: max(1, (height * factor).rounded(.down)))
                        let format = UIGraphicsImageRendererFormat()
                        format.scale = 1
                        format.opaque = true
                        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
                            image.draw(in: CGRect(origin: .zero, size: size))
                        }
                    }
                    return image.preparingForDisplay() ?? image
                }
                Task { @MainActor in completion(decoded) }
            }
        }
    }
    func cancel(_ request: PHImageRequestID) { manager.cancelImageRequest(request) }
}

/// A retained rolling deck of *completed* images, independent from a card view's lifetime.
/// Budgets count decoded pixels; PhotoKit's private caches and in-flight work are separate.
@MainActor
final class SwipeImagePipeline: ObservableObject {
    @Published private(set) var revision = 0
    private let provider: SwipeImageProviding
    private let previewBudget: Int
    private let sharpBudget: Int
    private var identifiers: [String] = []
    private var previews: [String: UIImage] = [:]
    private var sharp: [String: UIImage] = [:]
    private var attemptedLocal = Set<String>()
    private var attemptedNetwork = Set<String>()
    private var attemptedSharp = Set<String>()
    private var failures = Set<String>()
    private var pumping = false

    private struct Running {
        let token: UUID
        let stage: SwipeImageStage
        var request: PHImageRequestID?
    }
    private var running: [String: Running] = [:]

    var activeRequestCount: Int { running.count }
    var retainedCount: Int { Set(previews.keys).union(sharp.keys).count }
    var previewBytes: Int { previews.values.reduce(0) { $0 + Self.cost($1) } }
    var sharpBytes: Int { sharp.values.reduce(0) { $0 + Self.cost($1) } }

    convenience init(manager: PHCachingImageManager = PHCachingImageManager()) {
        self.init(provider: PhotoKitSwipeImages(manager: manager))
    }

    init(provider: SwipeImageProviding, previewBudget: Int = 64 * 1024 * 1024,
         sharpBudget: Int = 24 * 1024 * 1024) {
        self.provider = provider
        self.previewBudget = max(0, previewBudget)
        self.sharpBudget = max(0, sharpBudget)
    }

    func prepare(_ assets: [PHAsset]) {
        let window = Array(assets.prefix(20))
        provider.register(window)
        prepare(identifiers: window.map(\.localIdentifier))
    }

    /// Identifier-based scheduling also allows the PhotoKit boundary to be substituted in tests.
    func prepare(identifiers supplied: [String]) {
        var seen = Set<String>()
        let next = Array(supplied.lazy.filter { seen.insert($0).inserted }.prefix(20))
        guard next != identifiers else { pump(); return }
        identifiers = next
        let scope = Set(next)
        let sharpScope = Set(next.prefix(3))
        for id in Array(running.keys) {
            guard let job = running[id] else { continue }
            if !scope.contains(id) || (job.stage == .sharp && !sharpScope.contains(id)) { cancel(id) }
        }
        previews = previews.filter { scope.contains($0.key) }
        sharp = sharp.filter { sharpScope.contains($0.key) }
        attemptedLocal.formIntersection(scope)
        attemptedNetwork.formIntersection(scope)
        attemptedSharp.formIntersection(sharpScope)
        failures.formIntersection(scope)
        revision &+= 1
        pump()
    }

    func image(for id: String) -> UIImage? { sharp[id] ?? previews[id] }
    func isReady(_ id: String) -> Bool { image(for: id) != nil }
    func hasFailed(_ id: String) -> Bool { failures.contains(id) && !isReady(id) }

    func retry(_ asset: PHAsset) { retry(identifier: asset.localIdentifier) }

    func retry(identifier: String) {
        guard identifiers.contains(identifier) else { return }
        cancel(identifier)
        attemptedLocal.remove(identifier)
        attemptedNetwork.remove(identifier)
        attemptedSharp.remove(identifier)
        failures.remove(identifier)
        revision &+= 1
        pump()
    }

    func clear() {
        // Invalidate tokens before cancellation; cancelled requests can still call back.
        for id in Array(running.keys) { cancel(id) }
        identifiers.removeAll()
        previews.removeAll()
        sharp.removeAll()
        attemptedLocal.removeAll()
        attemptedNetwork.removeAll()
        attemptedSharp.removeAll()
        failures.removeAll()
        provider.register([])
        revision &+= 1
    }

    private func cancel(_ id: String) {
        if let job = running.removeValue(forKey: id), let request = job.request {
            provider.cancel(request)
        }
    }

    private func candidate() -> (String, SwipeImageStage)? {
        let networkCount = running.values.filter { $0.stage.allowsNetwork }.count
        for (index, id) in identifiers.enumerated() where running[id] == nil {
            let stage: SwipeImageStage?
            if !isReady(id) && !attemptedLocal.contains(id) { stage = .local }
            else if !isReady(id) && !attemptedNetwork.contains(id) { stage = .network }
            else if isReady(id) && index < 3 && !attemptedSharp.contains(id) { stage = .sharp }
            else { stage = nil }
            if let stage, !stage.allowsNetwork || networkCount < 2 { return (id, stage) }
        }
        return nil
    }

    private func pump() {
        guard !pumping else { return }
        pumping = true
        defer { pumping = false }
        while running.count < 3, let (id, stage) = candidate() {
            switch stage {
            case .local: attemptedLocal.insert(id)
            case .network: attemptedNetwork.insert(id)
            case .sharp: attemptedSharp.insert(id)
            }
            let token = UUID()
            running[id] = Running(token: token, stage: stage)
            let request = provider.requestImage(identifier: id, stage: stage) { [weak self] image in
                self?.finished(id: id, token: token, stage: stage, image: image)
            }
            // A provider may complete synchronously (for example, a deleted asset).
            if running[id]?.token == token { running[id]?.request = request }
        }
    }

    private func finished(id: String, token: UUID, stage: SwipeImageStage, image: UIImage?) {
        guard running[id]?.token == token, identifiers.contains(id) else { return }
        running.removeValue(forKey: id)
        if let image {
            retain(image, id: id, stage: stage)
        }
        if isReady(id) { failures.remove(id) }
        else if stage == .network { failures.insert(id) }
        revision &+= 1
        pump()
    }

    private func retain(_ image: UIImage, id: String, stage: SwipeImageStage) {
        let budget = stage == .sharp ? sharpBudget : previewBudget
        guard Self.cost(image) <= budget else { return }
        if stage == .sharp { sharp[id] = image }
        else { previews[id] = image }
        // Farthest cards lose memory first. Normal-sized twenty-card previews fit the budget.
        for victim in identifiers.reversed() {
            if stage == .sharp {
                guard sharpBytes > budget else { break }
                sharp.removeValue(forKey: victim)
            } else {
                guard previewBytes > budget else { break }
                previews.removeValue(forKey: victim)
            }
        }
    }

    private static func cost(_ image: UIImage) -> Int {
        if let pixels = image.cgImage { return pixels.bytesPerRow * pixels.height }
        return Int(image.size.width * image.scale * image.size.height * image.scale * 4)
    }
}

@MainActor
struct BufferedAssetImage: View {
    let asset: PHAsset
    @ObservedObject var pipeline: SwipeImagePipeline

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(red: 0.16, green: 0.19, blue: 0.14)
                if let image = pipeline.image(for: asset.localIdentifier) {
                    Image(uiImage: image).resizable().aspectRatio(contentMode: .fit)
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                } else if pipeline.hasFailed(asset.localIdentifier) {
                    VStack(spacing: 14) {
                        Image(systemName: "icloud.slash").font(.largeTitle)
                        Text("Item niet beschikbaar").font(.headline)
                        Text("Controleer je internet voor items in iCloud.")
                            .font(.caption).multilineTextAlignment(.center)
                        Button("Opnieuw proberen") { pipeline.retry(asset) }.buttonStyle(.bordered)
                    }.foregroundStyle(.white).padding()
                } else {
                    ProgressView().tint(.white).accessibilityLabel("Voorbeeld laden")
                }
            }.clipped()
        }
        .accessibilityLabel(asset.creationDate.map { "Item van \($0.formatted(date: .long, time: .omitted))" } ?? "Item")
    }
}
