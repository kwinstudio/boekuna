import XCTest
import UIKit
import Photos
@testable import Fotoswipe

@MainActor
final class SwipeImagePipelineTests: XCTestCase {
    func testReadinessRequiresImageAndSurvivesRollingAdvance() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["a", "b", "c"])
        XCTAssertFalse(pipeline.isReady("b"))
        let preview = makeImage()
        provider.finish("b", stage: .local, image: preview)
        XCTAssertTrue(pipeline.isReady("b"))
        pipeline.prepare(identifiers: ["b", "c", "d"])
        XCTAssertTrue(pipeline.image(for: "b") === preview)
        XCTAssertFalse(pipeline.isReady("a"))
    }

    func testScopeChangeRejectsLateCallbacksEvenWhenIdentifierReturns() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["a"])
        let old = provider.requests[0]
        pipeline.clear()
        pipeline.prepare(identifiers: ["a"])
        old.completion(makeImage())
        XCTAssertFalse(pipeline.isReady("a"))
        XCTAssertTrue(provider.cancelled.contains(old.token))
        provider.finish("a", stage: .local, image: makeImage())
        XCTAssertTrue(pipeline.isReady("a"))
    }

    func testCloudFallbackAndFailedUpgradeRetainRealPreview() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["cloud"])
        XCTAssertEqual(provider.requests.map(\.stage), [.local])
        provider.finish("cloud", stage: .local, image: nil)
        XCTAssertFalse(pipeline.isReady("cloud"))
        XCTAssertEqual(provider.requests.last?.stage, .network)
        let preview = makeImage()
        provider.finish("cloud", stage: .network, image: preview)
        XCTAssertTrue(pipeline.isReady("cloud"))
        provider.finish("cloud", stage: .sharp, image: nil)
        XCTAssertTrue(pipeline.image(for: "cloud") === preview)
        XCTAssertFalse(pipeline.hasFailed("cloud"))
    }

    func testOnlyTwentyItemsAreScheduledAndConcurrencyIsBounded() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: (0..<100).map(String.init))
        XCTAssertEqual(provider.requests.map(\.identifier), ["0", "1", "2"])
        for _ in 0..<100 {
            guard let next = provider.pending.first else { break }
            provider.complete(next, image: makeImage())
            XCTAssertLessThanOrEqual(pipeline.activeRequestCount, 3)
        }
        XCTAssertTrue(pipeline.isReady("19"))
        XCTAssertFalse(pipeline.isReady("20"))
        XCTAssertEqual(pipeline.retainedCount, 20)
    }

    func testOversizedImageCannotExceedDecodedBudget() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider, previewBudget: 1024, sharpBudget: 1024)
        pipeline.prepare(identifiers: ["large"])
        provider.finish("large", stage: .local, image: makeImage(size: CGSize(width: 40, height: 40)))
        XCTAssertFalse(pipeline.isReady("large"))
        XCTAssertLessThanOrEqual(pipeline.previewBytes, 1024)
        XCTAssertLessThanOrEqual(pipeline.sharpBytes, 1024)
    }

    func testClearReleasesImagesAndCancelsEveryActiveRequest() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["a", "b", "c"])
        provider.finish("a", stage: .local, image: makeImage())
        XCTAssertTrue(pipeline.isReady("a"))
        pipeline.clear()
        XCTAssertEqual(pipeline.activeRequestCount, 0)
        XCTAssertEqual(pipeline.retainedCount, 0)
        XCTAssertEqual(pipeline.previewBytes + pipeline.sharpBytes, 0)
        XCTAssertFalse(pipeline.isReady("a"))
    }

    func testDecodedBudgetEvictsDistantCardsBeforeCurrentCard() {
        let provider = ControlledImages()
        let fixture = makeImage()
        let budget = fixture.cgImage!.bytesPerRow * fixture.cgImage!.height * 2
        let pipeline = SwipeImagePipeline(provider: provider, previewBudget: budget, sharpBudget: 0)
        pipeline.prepare(identifiers: ["current", "next", "distant"])
        provider.finish("current", stage: .local, image: fixture)
        provider.finish("next", stage: .local, image: fixture)
        provider.finish("distant", stage: .local, image: fixture)
        XCTAssertTrue(pipeline.isReady("current"))
        XCTAssertFalse(pipeline.isReady("distant"))
        XCTAssertLessThanOrEqual(pipeline.previewBytes, budget)
    }

    func testRetryRestartsFailedImageWithoutClearingNeighbor() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["failed", "neighbor"])
        provider.finish("neighbor", stage: .local, image: makeImage())
        provider.finish("failed", stage: .local, image: nil)
        provider.finish("failed", stage: .network, image: nil)
        XCTAssertTrue(pipeline.hasFailed("failed"))
        pipeline.retry(identifier: "failed")
        XCTAssertFalse(pipeline.hasFailed("failed"))
        XCTAssertTrue(pipeline.isReady("neighbor"))
        provider.finish("failed", stage: .local, image: makeImage())
        XCTAssertTrue(pipeline.isReady("failed"))
    }

    func testUndoReusesARecentlyDisplayedPreview() {
        let provider = ControlledImages()
        let pipeline = SwipeImagePipeline(provider: provider)
        pipeline.prepare(identifiers: ["a", "b"])
        let preview = makeImage()
        provider.finish("a", stage: .local, image: preview)
        pipeline.prepare(identifiers: ["b", "c"])
        pipeline.prepare(identifiers: ["a", "b", "c"])
        XCTAssertTrue(pipeline.image(for: "a") === preview)
    }

    func testEvictedPreviewRetriesAutomaticallyWhenItBecomesCurrent() {
        let provider = ControlledImages()
        let fixture = makeImage()
        let budget = fixture.cgImage!.bytesPerRow * fixture.cgImage!.height * 2
        let pipeline = SwipeImagePipeline(provider: provider, previewBudget: budget, sharpBudget: 0)
        pipeline.prepare(identifiers: ["a", "b", "c"])
        provider.finish("a", stage: .local, image: fixture)
        provider.finish("b", stage: .local, image: fixture)
        provider.finish("c", stage: .local, image: fixture)
        provider.finish("a", stage: .sharp, image: nil)
        provider.finish("c", stage: .network, image: fixture)
        provider.finish("b", stage: .sharp, image: nil)
        XCTAssertFalse(pipeline.isReady("c"))
        pipeline.prepare(identifiers: ["c"])
        XCTAssertEqual(provider.pending.last?.identifier, "c")
        XCTAssertEqual(provider.pending.last?.stage, .local)
        provider.finish("c", stage: .local, image: fixture)
        XCTAssertTrue(pipeline.isReady("c"))
    }

    private func makeImage(size: CGSize = CGSize(width: 10, height: 10)) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }
}

@MainActor
private final class ControlledImages: SwipeImageProviding {
    struct Request {
        let token: PHImageRequestID
        let identifier: String
        let stage: SwipeImageStage
        let completion: @MainActor (UIImage?) -> Void
    }
    var requests: [Request] = []
    var pending: [Request] = []
    var cancelled: [PHImageRequestID] = []

    func requestImage(identifier: String, stage: SwipeImageStage,
                      completion: @escaping @MainActor (UIImage?) -> Void) -> PHImageRequestID {
        let request = Request(token: PHImageRequestID(requests.count + 1), identifier: identifier,
                              stage: stage, completion: completion)
        requests.append(request)
        pending.append(request)
        return request.token
    }
    func cancel(_ request: PHImageRequestID) {
        cancelled.append(request)
        pending.removeAll { $0.token == request }
    }
    func finish(_ identifier: String, stage: SwipeImageStage, image: UIImage?) {
        guard let request = pending.first(where: { $0.identifier == identifier && $0.stage == stage }) else {
            XCTFail("No pending \(stage) request for \(identifier)")
            return
        }
        complete(request, image: image)
    }
    func complete(_ request: Request, image: UIImage?) {
        pending.removeAll { $0.token == request.token }
        request.completion(image)
    }
}
