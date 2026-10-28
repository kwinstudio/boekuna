import Foundation
import Photos
import UIKit
import Combine
import Vision

/// Transient descriptors only; never persisted or uploaded.
struct SimilarPhotoDescriptor: Sendable, Codable {
    let id: String
    let date: Date
    let hash: UInt64
    let colors: [Double]
    let contrast: Double
    let aspect: Double
}

enum SimilarPhotoGrouping {
    static func matches(_ a: SimilarPhotoDescriptor, _ b: SimilarPhotoDescriptor) -> Bool {
        guard abs(a.date.timeIntervalSince(b.date)) <= 120,
              abs(a.aspect - b.aspect) <= 0.08,
              a.contrast >= 0.035, b.contrast >= 0.035,
              (a.hash ^ b.hash).nonzeroBitCount <= 6,
              a.colors.count == 48, b.colors.count == 48 else { return false }
        let differences = zip(a.colors, b.colors).map { abs($0 - $1) }
        return differences.reduce(0, +) / 48 <= 0.055 && (differences.max() ?? 1) <= 0.18
    }

    /// Bounded comparisons: at most 48 recent groups, 12 members per group.
    /// Complete-link matching prevents unrelated endpoints joining through a chain.
    static func groups(_ descriptors: [SimilarPhotoDescriptor], isCancelled: () -> Bool = { false }) -> [[String]] {
        let sorted = descriptors.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        var buckets: [[SimilarPhotoDescriptor]] = []
        var seen: Set<String> = []
        for item in sorted {
            if isCancelled() { return [] }
            guard seen.insert(item.id).inserted else { continue }
            var match: Int?
            for index in buckets.indices.reversed().prefix(48) {
                guard let first = buckets[index].first else { continue }
                if item.date.timeIntervalSince(first.date) > 120 { break }
                if buckets[index].count < 12 && buckets[index].allSatisfy({ matches($0, item) }) {
                    match = index
                    break
                }
            }
            if let match { buckets[match].append(item) } else { buckets.append([item]) }
        }
        return buckets.filter { $0.count > 1 }.map { $0.map(\.id) }
    }
}

struct SimilarPhotoSelection {
    private(set) var rejected: Set<String> = []
    @discardableResult mutating func toggle(_ id: String, in group: [String], ready: Set<String>? = nil) -> Bool {
        guard group.contains(id) else { return false }
        if rejected.contains(id) { rejected.remove(id); return true }
        guard ready?.contains(id) ?? true,
              group.filter({ !rejected.contains($0) }).count > 1 else { return false }
        rejected.insert(id)
        return true
    }
}

struct SimilarPhotoGroup: Identifiable {
    let assets: [PHAsset]
    var id: String { assets.first?.localIdentifier ?? "" }
}

@MainActor final class SimilarPhotoService: ObservableObject {
    @Published private(set) var groups: [SimilarPhotoGroup] = []
    @Published private(set) var progress: Double = 0
    @Published private(set) var scanning = false
    @Published private(set) var skippedCount = 0
    @Published private(set) var processedCount = 0
    private let manager: PHImageManager
    private var generation = UUID()
    private var work: Task<Void, Never>?
    private var imageRequest: PHImageRequestID = PHInvalidImageRequestID
    private var pending: (UUID, CheckedContinuation<UIImage?, Never>)?

    init(manager: PHImageManager = PHImageManager()) { self.manager = manager }

    func start(_ assets: [PHAsset]) {
        cancel()
        let token = generation
        groups = []; progress = 0; skippedCount = 0; processedCount = 0; scanning = true
        let photos = assets.filter { $0.mediaType == .image && $0.creationDate != nil }
        work = Task { [weak self] in
            guard let self else { return }
            var descriptors: [SimilarPhotoDescriptor] = []
            for asset in photos {
                guard !Task.isCancelled, self.generation == token else { return }
                let image = await self.thumbnail(asset, token: token)
                guard !Task.isCancelled, self.generation == token else { return }
                let descriptor: SimilarPhotoDescriptor?
                if let cgImage = image?.cgImage, let date = asset.creationDate {
                    descriptor = await Self.describe(cgImage, id: asset.localIdentifier, date: date,
                        aspect: Double(asset.pixelWidth) / Double(max(1, asset.pixelHeight)))
                } else { descriptor = nil }
                guard !Task.isCancelled, self.generation == token else { return }
                if let descriptor { descriptors.append(descriptor) } else { self.skippedCount += 1 }
                self.processedCount += 1
                self.progress = Double(self.processedCount) / Double(max(photos.count, 1))
            }
            let values = descriptors
            let groupTask = Task.detached(priority: .userInitiated) {
                SimilarPhotoGrouping.groups(values, isCancelled: { Task.isCancelled })
            }
            let ids = await withTaskCancellationHandler(operation: { await groupTask.value }, onCancel: { groupTask.cancel() })
            guard !Task.isCancelled, self.generation == token else { return }
            let lookup = Dictionary(photos.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
            self.groups = ids.map { SimilarPhotoGroup(assets: $0.compactMap { lookup[$0] }) }
            self.progress = 1; self.scanning = false; self.work = nil
        }
    }

    func cancel() {
        generation = UUID()
        work?.cancel(); work = nil
        let request = imageRequest
        imageRequest = PHInvalidImageRequestID
        let completion = pending
        pending = nil
        completion?.1.resume(returning: nil)
        if request != PHInvalidImageRequestID { manager.cancelImageRequest(request) }
        scanning = false
    }

    private func thumbnail(_ asset: PHAsset, token: UUID) async -> UIImage? {
        await withCheckedContinuation { continuation in
            let requestToken = UUID()
            pending = (requestToken, continuation)
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = false
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .fast
            imageRequest = manager.requestImage(for: asset, targetSize: CGSize(width: 96, height: 96),
                contentMode: .aspectFit, options: options) { [weak self] image, info in
                    let degraded = (info?[PHImageResultIsDegradedKey] as? Bool) == true
                    guard !degraded else { return }
                    Task { @MainActor in
                        guard let self, self.generation == token, self.pending?.0 == requestToken else { return }
                        let completion = self.pending?.1
                        self.pending = nil; self.imageRequest = PHInvalidImageRequestID
                        completion?.resume(returning: image)
                    }
                }
        }
    }

    /// Raster work runs off the UI thread; only a single small thumbnail is held per request.
    nonisolated static func describe(_ image: CGImage, id: String, date: Date, aspect: Double) async -> SimilarPhotoDescriptor? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let descriptor: SimilarPhotoDescriptor? = autoreleasepool {
                    let width = 9, height = 8
                    var pixels = [UInt8](repeating: 0, count: width * height * 4)
                    let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
                        guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                            bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
                        context.interpolationQuality = .medium
                        context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
                        return true
                    }
                    guard drawn else { return nil }
                    let luma = (0..<(width * height)).map { index -> Double in
                        let p = index * 4
                        return (0.299 * Double(pixels[p]) + 0.587 * Double(pixels[p + 1]) + 0.114 * Double(pixels[p + 2])) / 255
                    }
                    var hash: UInt64 = 0
                    for y in 0..<8 { for x in 0..<8 {
                        if luma[y * width + x] > luma[y * width + x + 1] { hash |= UInt64(1) << (y * 8 + x) }
                    } }
                    // Spatial color cells guard against identical edge hashes in different scenes.
                    var colors: [Double] = []
                    for y in 0..<4 { for x in 0..<4 { for channel in 0..<3 {
                        var sum: Double = 0
                        for dy in 0..<2 { for dx in 0..<2 {
                            sum += Double(pixels[((y * 2 + dy) * width + x * 2 + dx) * 4 + channel]) / 255
                        } }
                        colors.append(sum / 4)
                    } } }
                    let mean = luma.reduce(0, +) / Double(luma.count)
                    let variance = luma.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(luma.count)
                    return SimilarPhotoDescriptor(id: id, date: date, hash: hash, colors: colors, contrast: sqrt(variance), aspect: aspect)
                }
                continuation.resume(returning: descriptor)
            }
        }
    }
}


/// One on-device pass over recent, undecided photos: finds near-duplicate stacks and likely clutter.
/// Uses small local thumbnails only (no iCloud download, nothing stored or uploaded).
@MainActor final class SmartScanner: ObservableObject {
    static let limit = 1200
    @Published private(set) var scanning = false
    @Published private(set) var finished = false
    @Published private(set) var processed = 0
    @Published private(set) var total = 0
    @Published private(set) var stacks: [[String]] = []
    @Published private(set) var clutter: [String] = []
    private(set) var reasons: [String: ClutterReason] = [:]
    private(set) var quality: [String: PhotoQuality] = [:]
    var onFinish: (() -> Void)?
    private var task: Task<Void, Never>?

    private struct Input {
        let id: String
        let asset: PHAsset
        let date: Date
        let aspect: Double
        let screenshot: Bool
        let favorite: Bool
    }
    private final class ImageBox { var image: CGImage? }

    /// Remembered results (numbers only) so a scan never starts over: only new photos are analysed.
    private struct Cache: Codable {
        var quality: [String: PhotoQuality] = [:]
        var descriptors: [String: SimilarPhotoDescriptor] = [:]
    }
    private var cache = Cache()
    private static var cacheURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fotoswipe", isDirectory: true).appendingPathComponent("smart-scan.json")
    }

    init() {
        if let data = try? Data(contentsOf: Self.cacheURL), let saved = try? JSONDecoder().decode(Cache.self, from: data) {
            cache = saved
        }
    }

    /// `assets` should be ordered newest first; only the first `limit` photos are considered.
    func start(_ assets: [PHAsset], favorites: Set<String>) {
        guard !scanning else { return }
        task?.cancel()
        let inputs = assets.lazy.filter { $0.mediaType == .image }.prefix(Self.limit).map { asset in
            Input(id: asset.localIdentifier, asset: asset, date: asset.creationDate ?? .distantPast,
                  aspect: Double(asset.pixelWidth) / Double(max(1, asset.pixelHeight)),
                  screenshot: asset.mediaSubtypes.contains(.photoScreenshot),
                  favorite: favorites.contains(asset.localIdentifier))
        }
        let list = Array(inputs)
        let known = cache
        let toScan = list.filter { known.quality[$0.id] == nil }
        scanning = true; finished = false; processed = 0; total = toScan.count
        let url = Self.cacheURL
        task = Task.detached(priority: .utility) { [weak self] in
            let manager = PHImageManager.default()
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.isNetworkAccessAllowed = false
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .fast
            var quality = known.quality
            var descriptorByID = known.descriptors
            for (index, input) in toScan.enumerated() {
                if Task.isCancelled { return }
                let box = ImageBox()
                autoreleasepool {
                    manager.requestImage(for: input.asset, targetSize: CGSize(width: 256, height: 256),
                                         contentMode: .aspectFit, options: options) { result, _ in box.image = result?.cgImage }
                }
                if let image = box.image {
                    if let descriptor = await SimilarPhotoService.describe(image, id: input.id, date: input.date, aspect: input.aspect) {
                        descriptorByID[input.id] = descriptor
                    }
                    quality[input.id] = await SmartScanner.measure(image)
                }
                if index % 20 == 19 || index == toScan.count - 1 {
                    let done = index + 1
                    await MainActor.run { self?.processed = done }
                }
            }
            var reasons: [String: ClutterReason] = [:]
            for input in list {
                if let reason = ClutterReason.classify(isScreenshot: input.screenshot, isFavorite: input.favorite, quality: quality[input.id]) {
                    reasons[input.id] = reason
                }
            }
            let ids = Set(list.map(\.id))
            let descriptors = list.compactMap { descriptorByID[$0.id] }
            let groups = SimilarPhotoGrouping.groups(descriptors, isCancelled: { Task.isCancelled })
            let order = list.map(\.id)
            let rank = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
            // Newest stacks first; clutter grouped by reason, newest first within a reason.
            let sortedStacks = groups.sorted { (rank[$0.first ?? ""] ?? 0) < (rank[$1.first ?? ""] ?? 0) }
            let clutterIDs = order.filter { reasons[$0] != nil }
                .enumerated()
                .sorted { lhs, rhs in
                    let l = reasons[lhs.element]!, r = reasons[rhs.element]!
                    return l == r ? lhs.offset < rhs.offset : l < r
                }
                .map(\.element)
            // Keep the cache small: only photos that are still candidates.
            let saved = Cache(quality: quality.filter { ids.contains($0.key) }, descriptors: descriptorByID.filter { ids.contains($0.key) })
            if let data = try? JSONEncoder().encode(saved) {
                try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: url, options: .atomic)
            }
            await MainActor.run {
                guard let self else { return }
                self.cache = saved
                self.quality = saved.quality
                self.reasons = reasons
                self.stacks = sortedStacks
                self.clutter = clutterIDs
                self.processed = toScan.count
                self.scanning = false
                self.finished = true
                self.task = nil
                self.onFinish?()
            }
        }
    }

    func cancel() {
        task?.cancel(); task = nil
        scanning = false
    }

    /// Sharpness on a 96x96 grayscale copy plus, from iOS 18, Apple's on-device aesthetics score.
    nonisolated static func measure(_ image: CGImage) async -> PhotoQuality {
        let sharp = sharpness(image)
        var aesthetic: Double?
        var utility = false
        if #available(iOS 18.0, *) {
            if let observation = try? await CalculateImageAestheticsScoresRequest().perform(on: image) {
                aesthetic = Double(observation.overallScore)
                utility = observation.isUtility
            }
        }
        return PhotoQuality(sharpness: sharp, aesthetic: aesthetic, utility: utility)
    }

    nonisolated static func sharpness(_ image: CGImage) -> Double {
        let width = 96, height = 96
        var pixels = [UInt8](repeating: 0, count: width * height)
        let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                                          bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.interpolationQuality = .medium
            context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
            return true
        }
        guard drawn else { return 1 }
        var sum = 0.0, squares = 0.0, count = 0.0
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let i = y * width + x
                let laplacian = (Double(pixels[i - 1]) + Double(pixels[i + 1]) + Double(pixels[i - width])
                                 + Double(pixels[i + width]) - 4 * Double(pixels[i])) / 255
                sum += laplacian; squares += laplacian * laplacian; count += 1
            }
        }
        let mean = sum / count
        return squares / count - mean * mean
    }
}
