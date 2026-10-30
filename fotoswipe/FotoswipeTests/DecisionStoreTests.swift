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

final class EngagementTests: XCTestCase {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        return c
    }
    private func day(_ offset: Int, from base: Date) -> Date { calendar.date(byAdding: .day, value: offset, to: base)! }
    private var base: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 12))! }

    func testSessionCompletesAtGoalAndUndoRemovesFromTally() {
        let size = ReviewSession.size
        XCTAssertEqual(size, 100, "Default session is 100 items")
        var session = ReviewSession()
        for i in 0..<(size - 1) { session.record("p\(i)", i % 3 == 0 ? .trash : .keep) }
        XCTAssertFalse(session.isComplete)
        session.remove("p0")
        XCTAssertEqual(session.count, size - 2)
        session.record("p0", .later)
        session.record("p\(size - 1)", .keep)
        XCTAssertTrue(session.isComplete)
        XCTAssertEqual(session.progress, 1)
        XCTAssertEqual(session.later, ["p0"])
    }
    func testChangingAChoiceDoesNotCountTwice() {
        var session = ReviewSession()
        session.record("a", .keep)
        session.record("a", .trash)
        XCTAssertEqual(session.count, 1)
        XCTAssertEqual(session.trashed, ["a"])
        XCTAssertTrue(session.kept.isEmpty)
    }
    func testDayBecomesActiveAtDailyGoal() {
        var streak = StreakStore()
        for _ in 0..<(StreakStore.dailyGoal - 1) { streak.recordChoice(now: base, calendar: calendar) }
        XCTAssertFalse(streak.isActive(base, calendar: calendar))
        streak.recordChoice(now: base, calendar: calendar)
        XCTAssertTrue(streak.isActive(base, calendar: calendar))
        XCTAssertEqual(streak.current(now: base, calendar: calendar), 1)
    }
    func testStreakForgivesOneMissedDayButNotTwo() {
        var streak = StreakStore()
        streak.markActive(day(-4, from: base), calendar: calendar)
        streak.markActive(day(-3, from: base), calendar: calendar)
        // -2 missed: forgiven
        streak.markActive(day(-1, from: base), calendar: calendar)
        streak.markActive(base, calendar: calendar)
        XCTAssertEqual(streak.current(now: base, calendar: calendar), 4)
        var broken = StreakStore()
        broken.markActive(day(-5, from: base), calendar: calendar)
        broken.markActive(day(-2, from: base), calendar: calendar)
        XCTAssertEqual(broken.current(now: base, calendar: calendar), 1)
    }
    func testTodayInProgressDoesNotBreakStreak() {
        var streak = StreakStore()
        streak.markActive(day(-2, from: base), calendar: calendar)
        streak.markActive(day(-1, from: base), calendar: calendar)
        XCTAssertEqual(streak.current(now: base, calendar: calendar), 2)
        XCTAssertEqual(StreakStore().current(now: base, calendar: calendar), 0)
    }
    func testStreakSurvivesRelaunch() throws {
        var streak = StreakStore()
        streak.markActive(base, calendar: calendar)
        streak.freedBytes = 1_234
        let restored = try JSONDecoder().decode(StreakStore.self, from: JSONEncoder().encode(streak))
        XCTAssertEqual(restored, streak)
    }
    func testLargestFirstEstimateRanksVideosByLengthAndResolution() {
        let photo = SizeEstimate.bytes(isVideo: false, pixelWidth: 4032, pixelHeight: 3024, duration: 0)
        let shortClip = SizeEstimate.bytes(isVideo: true, pixelWidth: 1920, pixelHeight: 1080, duration: 10)
        let longClip = SizeEstimate.bytes(isVideo: true, pixelWidth: 1920, pixelHeight: 1080, duration: 120)
        XCTAssertGreaterThan(longClip, shortClip)
        XCTAssertGreaterThan(shortClip, photo)
        XCTAssertTrue(PhotoOrder.allCases.contains(.largest))
    }
}

final class FocusGestureTests: XCTestCase {
    private let w: CGFloat = 393, h: CGFloat = 852
    private func classify(_ dx: CGFloat, _ dy: CGFloat, _ pdx: CGFloat? = nil, _ pdy: CGFloat? = nil) -> FocusGesture {
        FocusGesture.classify(dx: dx, dy: dy, predictedDX: pdx ?? dx, predictedDY: pdy ?? dy, width: w, height: h)
    }
    func testHorizontalSwipesKeepOrSetAside() {
        XCTAssertEqual(classify(120, 10), .keep)
        XCTAssertEqual(classify(-120, -30), .trash)
        XCTAssertEqual(classify(40, 0), .none)
    }
    func testFastFlickCountsEvenWhenShort() {
        XCTAssertEqual(classify(30, 0, 400, 0), .keep)
        XCTAssertEqual(classify(-30, 0, -400, 0), .trash)
        XCTAssertEqual(classify(10, 0, 400, 0), .none)
    }
    func testVerticalSwipesLaterAndUndo() {
        XCTAssertEqual(classify(10, -160), .later)
        XCTAssertEqual(classify(-5, 160), .undo)
        XCTAssertEqual(classify(0, -40, 0, -500), .later)
        XCTAssertEqual(classify(0, 60), .none)
    }
    func testDiagonalUsesDominantAxis() {
        XCTAssertEqual(classify(140, -100), .keep)
        XCTAssertEqual(classify(80, -170), .later)
    }
}

final class SmartCleanupTests: XCTestCase {
    func testFavouriteWinsThenScore() {
        let q: [String: PhotoQuality] = [
            "a": PhotoQuality(sharpness: 0.001, aesthetic: 0.1, utility: false),
            "b": PhotoQuality(sharpness: 0.006, aesthetic: 0.4, utility: false),
            "c": PhotoQuality(sharpness: 0.0005, aesthetic: -0.5, utility: false)
        ]
        XCTAssertEqual(SmartPick.best(["a", "b", "c"], quality: q, favorites: []), "b")
        XCTAssertEqual(SmartPick.best(["a", "b", "c"], quality: q, favorites: ["c"]), "c")
        XCTAssertEqual(SmartPick.best(["x", "y"], quality: [:], favorites: []), "x")
    }
    func testStackNeverRemovesEverything() {
        XCTAssertTrue(SmartPick.decisions(group: ["a", "b"], keep: []).isEmpty)
        XCTAssertTrue(SmartPick.decisions(group: ["a", "b"], keep: ["z"]).isEmpty)
        let result = SmartPick.decisions(group: ["a", "b", "c"], keep: ["b"])
        XCTAssertEqual(result.map(\.0), ["a", "b", "c"])
        XCTAssertEqual(result.map(\.1), [.trash, .keep, .trash])
    }
    func testClutterIsConservative() {
        let sharp = PhotoQuality(sharpness: 0.01, aesthetic: 0.3, utility: false)
        let soft = PhotoQuality(sharpness: 0.0003, aesthetic: -0.6, utility: false)
        let softButNice = PhotoQuality(sharpness: 0.0003, aesthetic: 0.4, utility: false)
        let receipt = PhotoQuality(sharpness: 0.02, aesthetic: -0.1, utility: true)
        XCTAssertNil(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: sharp))
        XCTAssertEqual(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: soft), .blurry)
        XCTAssertNil(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: softButNice))
        XCTAssertEqual(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: receipt), .document)
        XCTAssertEqual(ClutterReason.classify(isScreenshot: true, isFavorite: false, quality: nil), .screenshot)
        XCTAssertNil(ClutterReason.classify(isScreenshot: true, isFavorite: true, quality: soft))
        let olderOS = PhotoQuality(sharpness: 0.0004, aesthetic: nil, utility: false)
        XCTAssertEqual(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: olderOS), .blurry)
    }
    func testReminderSkipsTodayWhenDoneOrPast() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        let morning = calendar.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 9))!
        XCTAssertEqual(ReminderPlan.dates(now: morning, hour: 20, minute: 0, doneToday: false, calendar: calendar).count, 7)
        XCTAssertEqual(ReminderPlan.dates(now: morning, hour: 20, minute: 0, doneToday: true, calendar: calendar).count, 6)
        let night = calendar.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 21))!
        let dates = ReminderPlan.dates(now: night, hour: 20, minute: 0, doneToday: false, calendar: calendar)
        XCTAssertEqual(dates.count, 6)
        XCTAssertEqual(calendar.component(.day, from: dates[0]), 29)
        XCTAssertEqual(calendar.component(.hour, from: dates[0]), 20)
    }
}

final class CompleteAppTests: XCTestCase {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        return c
    }
    func testLongestStreakForgivesOneMissedDay() {
        var streak = StreakStore()
        XCTAssertEqual(streak.longest(calendar: calendar), 0)
        let base = calendar.date(from: DateComponents(year: 2026, month: 10, day: 1, hour: 12))!
        for offset in [0, 1, 3, 4, 10, 11] {
            streak.markActive(calendar.date(byAdding: .day, value: offset, to: base)!, calendar: calendar)
        }
        XCTAssertEqual(streak.longest(calendar: calendar), 4)
    }
    func testReviewPromptOnlyAfterWinsAndRarely() {
        let now = Date()
        XCTAssertFalse(ReviewPrompt.shouldAsk(completedSessions: 1, setAsideThisSession: 20, lastAsked: nil, lastAskedVersion: nil, version: "9", now: now))
        XCTAssertFalse(ReviewPrompt.shouldAsk(completedSessions: 3, setAsideThisSession: 2, lastAsked: nil, lastAskedVersion: nil, version: "9", now: now))
        XCTAssertTrue(ReviewPrompt.shouldAsk(completedSessions: 3, setAsideThisSession: 8, lastAsked: nil, lastAskedVersion: nil, version: "9", now: now))
        XCTAssertFalse(ReviewPrompt.shouldAsk(completedSessions: 3, setAsideThisSession: 8, lastAsked: nil, lastAskedVersion: "9", version: "9", now: now))
        let recent = now.addingTimeInterval(-30 * 24 * 3600)
        XCTAssertFalse(ReviewPrompt.shouldAsk(completedSessions: 3, setAsideThisSession: 8, lastAsked: recent, lastAskedVersion: "8", version: "9", now: now))
        let old = now.addingTimeInterval(-200 * 24 * 3600)
        XCTAssertTrue(ReviewPrompt.shouldAsk(completedSessions: 3, setAsideThisSession: 8, lastAsked: old, lastAskedVersion: "8", version: "9", now: now))
    }
}

final class SmartGroupTests: XCTestCase {
    func testOldScreenshotsAndSmallImages() {
        let now = Date()
        let old = AssetFacts(id: "a", isScreenshot: true, created: now.addingTimeInterval(-40 * 24 * 3600))
        let fresh = AssetFacts(id: "b", isScreenshot: true, created: now.addingTimeInterval(-3 * 24 * 3600))
        XCTAssertTrue(SmartRules.isOldScreenshot(old, now: now))
        XCTAssertFalse(SmartRules.isOldScreenshot(fresh, now: now))
        XCTAssertTrue(SmartRules.isSmall(AssetFacts(id: "c", pixelWidth: 500, pixelHeight: 500)))
        XCTAssertTrue(SmartRules.isSmall(AssetFacts(id: "d", isAnimated: true, pixelWidth: 2000, pixelHeight: 2000)))
        XCTAssertFalse(SmartRules.isSmall(AssetFacts(id: "e", pixelWidth: 4032, pixelHeight: 3024)))
        XCTAssertFalse(SmartRules.isSmall(AssetFacts(id: "f", isScreenshot: true, pixelWidth: 500, pixelHeight: 500)))
        XCTAssertFalse(SmartRules.isSmall(AssetFacts(id: "g", isVideo: true, pixelWidth: 320, pixelHeight: 240)))
    }
    func testShortVideosAndAccidentalLooks() {
        XCTAssertTrue(SmartRules.isShortVideo(AssetFacts(id: "v", isVideo: true, duration: 1.4)))
        XCTAssertFalse(SmartRules.isShortVideo(AssetFacts(id: "w", isVideo: true, duration: 12)))
        XCTAssertTrue(SmartRules.looksAccidental(PhotoQuality(sharpness: 0.001, aesthetic: nil, utility: false, brightness: 0.02, contrast: 0.01)))
        XCTAssertTrue(SmartRules.looksAccidental(PhotoQuality(sharpness: 0.0005, aesthetic: nil, utility: false, brightness: 0.5, contrast: 0.01)))
        XCTAssertFalse(SmartRules.looksAccidental(PhotoQuality(sharpness: 0.01, aesthetic: nil, utility: false, brightness: 0.4, contrast: 0.2)))
        // A dark but detailed night photo is not accidental.
        XCTAssertFalse(SmartRules.looksAccidental(PhotoQuality(sharpness: 0.006, aesthetic: nil, utility: false, brightness: 0.12, contrast: 0.15)))
    }
    func testAppAlbumsAndBurstKeep() {
        XCTAssertTrue(SmartRules.isAppAlbum("WhatsApp"))
        XCTAssertTrue(SmartRules.isAppAlbum("Telegram "))
        XCTAssertTrue(SmartRules.isAppAlbum("WhatsApp Business"))
        XCTAssertFalse(SmartRules.isAppAlbum("Vakantie Italië"))
        XCTAssertFalse(SmartRules.isAppAlbum("Xmas 2024"))
        XCTAssertEqual(SmartRules.burstKeep(["a", "b", "c"], picked: ["b"], representative: "a"), ["b"])
        XCTAssertEqual(SmartRules.burstKeep(["a", "b", "c"], picked: [], representative: "c"), ["c"])
        XCTAssertEqual(SmartRules.burstKeep(["a", "b"], picked: ["z"], representative: nil), ["a"])
    }
    func testExactCopiesIgnoreTimeButNeedSameImage() {
        let colors = Array(repeating: 0.4, count: 48)
        let a = SimilarPhotoDescriptor(id: "a", date: Date(timeIntervalSince1970: 0), hash: 0xABCD, colors: colors, contrast: 0.2, aspect: 0.75)
        let b = SimilarPhotoDescriptor(id: "b", date: Date(timeIntervalSince1970: 86_400 * 90), hash: 0xABCD, colors: colors, contrast: 0.2, aspect: 0.75)
        let c = SimilarPhotoDescriptor(id: "c", date: Date(timeIntervalSince1970: 50), hash: 0xABCD, colors: colors.map { $0 + 0.2 }, contrast: 0.2, aspect: 0.75)
        let d = SimilarPhotoDescriptor(id: "d", date: Date(timeIntervalSince1970: 60), hash: 0x1234, colors: colors, contrast: 0.2, aspect: 0.75)
        XCTAssertEqual(SimilarPhotoGrouping.exactCopies([a, b, c, d]), [["a", "b"]])
    }
    func testBigVideosAndQualityPresets() {
        // 4K for one minute is far over 50 MB; a 5-second 720p clip is not.
        XCTAssertTrue(SmartRules.isBigVideo(AssetFacts(id: "4k", isVideo: true, pixelWidth: 3840, pixelHeight: 2160, duration: 60)))
        XCTAssertFalse(SmartRules.isBigVideo(AssetFacts(id: "clip", isVideo: true, pixelWidth: 1280, pixelHeight: 720, duration: 5)))
        XCTAssertFalse(SmartRules.isBigVideo(AssetFacts(id: "photo", pixelWidth: 8000, pixelHeight: 6000)))
        XCTAssertEqual(VideoQuality.allCases.map(\.preset), ["AVAssetExportPresetHEVC1920x1080", "AVAssetExportPreset1280x720", "AVAssetExportPreset960x540"])
        XCTAssertGreaterThan(VideoQuality.high.expectedShare, VideoQuality.low.expectedShare)
    }
    func testQuickAlbumsKeepOrderAndLimit() {
        var ids: [String] = []
        for id in ["a", "b", "c", "d"] { ids = QuickAlbumRules.toggled(ids, id) }
        XCTAssertEqual(ids, ["a", "b", "c"])
        ids = QuickAlbumRules.toggled(ids, "b")
        XCTAssertEqual(ids, ["a", "c"])
        ids = QuickAlbumRules.toggled(ids, "d")
        XCTAssertEqual(ids, ["a", "c", "d"])
    }
    func testPlacesSplitTripsAndKeepHomeTogether() {
        let day = 86_400.0
        var points: [PlacePoint] = []
        // Home (Amsterdam): many photos spread over months.
        for i in 0..<40 { points.append(PlacePoint(id: "h\(i)", latitude: 52.37, longitude: 4.89, date: Date(timeIntervalSince1970: Double(i) * 10 * day))) }
        // Barcelona: two separate trips a year apart.
        for i in 0..<5 { points.append(PlacePoint(id: "b\(i)", latitude: 41.39, longitude: 2.17, date: Date(timeIntervalSince1970: 100 * day + Double(i) * 3600))) }
        for i in 0..<4 { points.append(PlacePoint(id: "c\(i)", latitude: 41.40, longitude: 2.16, date: Date(timeIntervalSince1970: 465 * day + Double(i) * 3600))) }
        // A single photo somewhere is not a trip; no location (0,0) is ignored.
        points.append(PlacePoint(id: "x", latitude: 48.85, longitude: 2.35, date: Date(timeIntervalSince1970: 200 * day)))
        points.append(PlacePoint(id: "z", latitude: 0, longitude: 0, date: Date(timeIntervalSince1970: 300 * day)))
        let clusters = PlaceClustering.clusters(points)
        XCTAssertEqual(clusters.count, 3)
        XCTAssertEqual(clusters.last?.isHome, true)
        XCTAssertEqual(clusters.last?.ids.count, 40)
        XCTAssertEqual(clusters.first?.ids.count, 4, "Newest trip first")
        XCTAssertEqual(clusters[1].ids.count, 5)
    }
    func testDuplicateContactsAreFoundConservatively() {
        let contacts = [
            ContactInfo(id: "1", name: "Anna de Vries", phones: ["+31 6 1234 5678", "010 1234567"], richness: 3),
            ContactInfo(id: "2", name: "anna  de vries", emails: ["anna@example.com"], richness: 1),
            ContactInfo(id: "3", name: "", phones: ["06-12345678"]),
            ContactInfo(id: "4", name: "Bram de Vries", phones: ["0101234567"]),   // shared landline, another name
            ContactInfo(id: "5", name: "Céline", emails: ["c@x.nl"]),
            ContactInfo(id: "6", name: "Celine", emails: ["C@X.nl "], richness: 4)
        ]
        let groups = ContactDuplicates.groups(contacts)
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(Set(groups[0]), ["1", "2", "3"])
        XCTAssertEqual(groups[0].first, "1", "The fullest card stays")
        XCTAssertEqual(groups[1], ["6", "5"])
        XCTAssertEqual(ContactDuplicates.normalizedPhone("+31 6 1234 5678"), ContactDuplicates.normalizedPhone("06-12345678"))
    }
    func testAccidentalWinsOverOtherClutterReasons() {
        let pocket = PhotoQuality(sharpness: 0.0004, aesthetic: -0.8, utility: false, brightness: 0.02, contrast: 0.01)
        XCTAssertEqual(ClutterReason.classify(isScreenshot: false, isFavorite: false, quality: pocket), .accidental)
    }
}

