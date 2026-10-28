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
