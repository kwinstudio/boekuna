import XCTest
@testable import Fotoswipe

final class DecisionStoreTests: XCTestCase {
    func testUndoRestoresPreviousChoiceRatherThanLosingIt() {
        var state = DecisionStore()
        state.decide("a", .keep)
        state.decide("a", .trash)
        XCTAssertEqual(state.undo(), "a")
        XCTAssertEqual(state.decisions["a"], .keep)
        state.undo()
        XCTAssertNil(state.decisions["a"])
    }
    func testRelaunchPreservesPendingDeletionAndUndo() throws {
        var state = DecisionStore()
        state.decide("photo-in-icloud", .trash)
        state.decide("family-photo", .keep)
        let data = try JSONEncoder().encode(state)
        var restored = try JSONDecoder().decode(DecisionStore.self, from: data)
        XCTAssertEqual(restored.decisions["photo-in-icloud"], .trash)
        XCTAssertEqual(restored.undo(), "family-photo")
        XCTAssertNil(restored.decisions["family-photo"])
        XCTAssertEqual(restored.decisions["photo-in-icloud"], .trash)
    }
    func testCompletedDeletionOnlyClearsConfirmedBatch() {
        var state = DecisionStore()
        state.decide("deleted", .trash)
        state.decide("still-pending", .trash)
        state.decide("kept", .keep)
        state.finishDeletion(["deleted"])
        XCTAssertNil(state.decisions["deleted"])
        XCTAssertEqual(state.decisions["still-pending"], .trash)
        XCTAssertEqual(state.decisions["kept"], .keep)
        XCTAssertFalse(state.history.contains { $0.id == "deleted" })
    }
    func testRestoreRemovesOldUndoThatCouldRequeuePhoto() {
        var state = DecisionStore()
        state.decide("a", .trash)
        state.decide("b", .keep)
        state.restore("a")
        XCTAssertNil(state.decisions["a"])
        XCTAssertEqual(state.undo(), "b")
        XCTAssertNil(state.undo())
    }
    func testReviewKeptAgainDoesNotDiscardPendingTrash() {
        var state = DecisionStore()
        state.decide("a", .keep)
        state.decide("b", .trash)
        state.resetKept()
        XCTAssertNil(state.decisions["a"])
        XCTAssertEqual(state.decisions["b"], .trash)
        XCTAssertEqual(state.history.map(\.id), ["b"])
    }
    func testLongSessionBoundsUndoWithoutLosingChoices() {
        var state = DecisionStore()
        for i in 0..<500 { state.decide(String(i), .keep) }
        XCTAssertEqual(state.history.count, 200)
        XCTAssertEqual(state.decisions.count, 500)
    }
}

final class SwipePipelineTests: XCTestCase {
    func testLargeLibraryAdvancesWithoutRebuildingOrDroppingTheNextCards() {
        var queue = ReviewQueue(Array(0..<100_000))
        for expected in 0..<10_000 {
            XCTAssertEqual(queue.current, expected)
            XCTAssertEqual(Array(queue.preview(limit: 3)), [expected, expected + 1, expected + 2])
            queue.advance()
        }
        XCTAssertEqual(queue.remainingCount, 90_000)
        XCTAssertEqual(queue.current, 10_000)
    }
    func testQueueHandlesLastPhotoAndEmptyLibrary() {
        var queue = ReviewQueue(["last"])
        XCTAssertEqual(Array(queue.preview(limit: 3)), ["last"])
        queue.advance()
        queue.advance()
        XCTAssertNil(queue.current)
        XCTAssertEqual(queue.remainingCount, 0)
        XCTAssertTrue(queue.preview(limit: 8).isEmpty)
        queue.replace(["restored", "next"])
        XCTAssertEqual(queue.current, "restored")
        XCTAssertEqual(queue.remainingCount, 2)
    }
    func testBackgroundPersistenceKeepsNewestSnapshotInOrder() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("decisions.json")
        let writer = DecisionPersistence(url: url)
        let completed = expectation(description: "Serial writes completed off the main thread")
        completed.expectedFulfillmentCount = 3
        var state = DecisionStore()
        for i in 0..<3 {
            state.decide("photo-\(i)", i == 1 ? .trash : .keep)
            writer.save(state) { error in
                XCTAssertFalse(Thread.isMainThread)
                XCTAssertNil(error)
                completed.fulfill()
            }
        }
        wait(for: [completed], timeout: 5)
        let restored = try JSONDecoder().decode(DecisionStore.self, from: Data(contentsOf: url))
        XCTAssertEqual(restored.decisions.count, 3)
        XCTAssertEqual(restored.decisions["photo-1"], .trash)
        XCTAssertEqual(restored.history.map(\.id), ["photo-0", "photo-1", "photo-2"])
    }
}
