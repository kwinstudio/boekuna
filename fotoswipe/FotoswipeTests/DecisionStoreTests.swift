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


final class CategoryDecisionTests: XCTestCase {
    func testReviewingFavoritesAgainPreservesKeptPhotosOutsideThatCategoryAndTrash() {
        var state = DecisionStore()
        state.decide("favorite", .keep)
        state.decide("other-album", .keep)
        state.decide("pending", .trash)
        state.resetKept(in: ["favorite", "pending"])
        XCTAssertNil(state.decisions["favorite"])
        XCTAssertEqual(state.decisions["other-album"], .keep)
        XCTAssertEqual(state.decisions["pending"], .trash)
        XCTAssertEqual(state.history.map(\.id), ["other-album", "pending"])
    }
    func testUndoInAnAlbumSkipsNewerDecisionsInOtherAlbums() {
        var state = DecisionStore()
        state.decide("album-photo", .keep)
        state.decide("other-photo", .trash)
        XCTAssertEqual(state.undo(in: ["album-photo"]), "album-photo")
        XCTAssertNil(state.decisions["album-photo"])
        XCTAssertEqual(state.decisions["other-photo"], .trash)
        XCTAssertEqual(state.undo(), "other-photo")
    }
    func testEmptyCategoryCannotChangeDecisionsFromOtherCategories() {
        var state = DecisionStore()
        state.decide("outside", .keep)
        XCTAssertNil(state.undo(in: []))
        state.resetKept(in: [])
        XCTAssertEqual(state.decisions["outside"], .keep)
        XCTAssertEqual(state.history.count, 1)
    }
    func testOverlappingAlbumsShareOneDecisionAcrossRelaunch() throws {
        var state = DecisionStore()
        state.decide("shared-photo", .keep)
        state.decide("shared-photo", .trash)
        let data = try JSONEncoder().encode(state)
        var restored = try JSONDecoder().decode(DecisionStore.self, from: data)
        XCTAssertEqual(restored.undo(in: ["shared-photo"]), "shared-photo")
        XCTAssertEqual(restored.decisions["shared-photo"], .keep)
        XCTAssertEqual(restored.decisions.count, 1)
    }
}

final class PhotoDateFilterTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(secondsFromGMT: 0)!
        return value
    }
    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }
    func testMonthIncludesLeapDayButExcludesNextMonthAndUnknownDates() {
        let filter = PhotoDateFilter.month(date(2024, 2, 1))
        XCTAssertTrue(filter.includes(date(2024, 2, 29), calendar: calendar))
        XCTAssertFalse(filter.includes(date(2024, 3, 1), calendar: calendar))
        XCTAssertFalse(filter.includes(nil, calendar: calendar))
        XCTAssertTrue(PhotoDateFilter.all.includes(nil, calendar: calendar))
    }
    func testOnThisDayOnlyIncludesSameDayInEarlierYears() {
        let today = date(2026, 10, 28)
        XCTAssertTrue(PhotoDateFilter.onThisDay.includes(date(2024, 10, 28), now: today, calendar: calendar))
        XCTAssertFalse(PhotoDateFilter.onThisDay.includes(today, now: today, calendar: calendar))
        XCTAssertFalse(PhotoDateFilter.onThisDay.includes(date(2024, 10, 27), now: today, calendar: calendar))
        XCTAssertFalse(PhotoDateFilter.onThisDay.includes(nil, now: today, calendar: calendar))
    }
    func testMonthCatalogDeduplicatesAndSortsNewestFirst() {
        let dates = [date(2024, 2, 1), date(2024, 2, 29), date(2025, 1, 2), nil]
        XCTAssertEqual(PhotoDateFilter.monthStarts(in: dates, calendar: calendar), [date(2025, 1, 1), date(2024, 2, 1)])
    }
}

final class LaterDecisionTests: XCTestCase {
    func testLaterChoiceSurvivesRelaunchAndUndoAfterTrashRestoresLater() throws {
        var state = DecisionStore()
        state.decide("unsure", .later)
        let encoded = try JSONEncoder().encode(state)
        var restored = try JSONDecoder().decode(DecisionStore.self, from: encoded)
        XCTAssertEqual(restored.decisions["unsure"], .later)
        restored.decide("unsure", .trash)
        XCTAssertEqual(restored.undo(), "unsure")
        XCTAssertEqual(restored.decisions["unsure"], .later)
    }
    func testLegacyBuildThreeJSONStillDecodesWithoutLosingChoices() throws {
        let data = Data(#"{"decisions":{"a":"keep","b":"trash"},"history":[{"id":"a"}]}"#.utf8)
        var state = try JSONDecoder().decode(DecisionStore.self, from: data)
        XCTAssertEqual(state.decisions["a"], .keep)
        XCTAssertEqual(state.decisions["b"], .trash)
        state.decide("c", .later)
        state.resetKept()
        XCTAssertNil(state.decisions["a"])
        XCTAssertEqual(state.decisions["b"], .trash)
        XCTAssertEqual(state.decisions["c"], .later)
    }
    func testRestoringLaterDoesNotChangeOtherSelections() {
        var state = DecisionStore()
        state.decide("later", .later)
        state.decide("keep", .keep)
        state.decide("trash", .trash)
        state.restore("later")
        XCTAssertNil(state.decisions["later"])
        XCTAssertEqual(state.decisions["keep"], .keep)
        XCTAssertEqual(state.decisions["trash"], .trash)
    }
}

final class CleanupSessionRegressionTests: XCTestCase {
    func testRandomSessionRetainsMembershipAfterChoicesAndRefresh() {
        var session = RandomReviewSession(limit: 30)
        let all = (0..<100).map(String.init)
        let first = session.select(candidates: all, available: Set(all))
        XCTAssertEqual(first.count, 30)
        let stillUndecided = all.filter { !Set(first.prefix(5)).contains($0) }
        XCTAssertEqual(session.select(candidates: stillUndecided, available: Set(all)), first)
        let deleted = first[0]
        XCTAssertEqual(session.select(candidates: all, available: Set(all).subtracting([deleted])), Array(first.dropFirst()))
    }
    func testScheduledRefreshCannotRunAfterOwnMutationStarts() {
        var gate = LibraryRefreshGate()
        XCTAssertTrue(gate.didChange())
        gate.beginMutation()
        XCTAssertFalse(gate.canRunScheduledRefresh)
        XCTAssertFalse(gate.didChange())
        gate.endMutation()
        XCTAssertFalse(gate.canRunScheduledRefresh)
        XCTAssertTrue(gate.needsRefresh)
        gate.refreshStarted()
        XCTAssertTrue(gate.canRunScheduledRefresh)
        XCTAssertFalse(gate.needsRefresh)
    }
    func testAlreadyVisibleSwipeCanFinishDuringMetadataMutation() {
        XCTAssertTrue(SwipeCommitPolicy.canFinish(deleting: false, loading: false, mutating: true))
        XCTAssertFalse(SwipeCommitPolicy.canFinish(deleting: true, loading: false, mutating: false))
        XCTAssertFalse(SwipeCommitPolicy.canFinish(deleting: false, loading: true, mutating: false))
    }
}
