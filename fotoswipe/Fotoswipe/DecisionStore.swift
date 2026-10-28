import Foundation

enum PhotoDecision: String, Codable { case keep, trash, later }
struct SwipeRecord: Codable, Equatable {
    let id: String
    let previous: PhotoDecision?
}

/// Persist identifiers and choices only, never photo bytes.
struct DecisionStore: Codable {
    private(set) var decisions: [String: PhotoDecision] = [:]
    private(set) var history: [SwipeRecord] = []

    mutating func decide(_ id: String, _ decision: PhotoDecision) {
        history.append(SwipeRecord(id: id, previous: decisions[id]))
        if history.count > 200 { history.removeFirst(history.count - 200) }
        decisions[id] = decision
    }
    @discardableResult mutating func undo(in ids: Set<String>? = nil) -> String? {
        guard let index = history.lastIndex(where: { ids?.contains($0.id) ?? true }) else { return nil }
        let last = history.remove(at: index)
        decisions[last.id] = last.previous
        return last.id
    }
    mutating func restore(_ id: String) {
        decisions.removeValue(forKey: id)
        history.removeAll { $0.id == id }
    }
    mutating func finishDeletion(_ ids: Set<String>) {
        decisions = decisions.filter { !ids.contains($0.key) }
        history.removeAll { ids.contains($0.id) }
    }
    mutating func resetKept(in ids: Set<String>? = nil) {
        let kept = Set(decisions.filter { $0.value == .keep && (ids?.contains($0.key) ?? true) }.map(\.key))
        decisions = decisions.filter { !kept.contains($0.key) }
        history.removeAll { kept.contains($0.id) }
    }
}

/// Moving through the library changes an index, never shifts/copies the library.
struct ReviewQueue<Element> {
    private var elements: [Element]
    private var position = 0
    init(_ elements: [Element] = []) { self.elements = elements }
    var remainingCount: Int { elements.count - position }
    var current: Element? { position < elements.count ? elements[position] : nil }
    func preview(limit: Int) -> ArraySlice<Element> {
        elements[position..<min(elements.count, position + max(0, limit))]
    }
    mutating func advance() { if position < elements.count { position += 1 } }
    mutating func replace(_ elements: [Element]) { self.elements = elements; position = 0 }
}

/// JSON encoding and atomic disk writes never run on the swipe/UI thread.
/// The serial queue preserves ordering even when the user swipes rapidly.
final class DecisionPersistence {
    private let url: URL
    private let queue = DispatchQueue(label: "nl.zichtwerfstudio.fotoswipe.persistence", qos: .utility)
    init(url: URL) { self.url = url }
    func save(_ snapshot: DecisionStore, completion: @escaping (Error?) -> Void) {
        queue.async { [url] in
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try JSONEncoder().encode(snapshot).write(to: url, options: .atomic)
                completion(nil)
            } catch { completion(error) }
        }
    }
    func flush(completion: @escaping () -> Void) { queue.async(execute: completion) }
}


/// Date filtering uses calendar intervals, including leap days and DST boundaries.
enum PhotoDateFilter: Equatable {
    case all
    case month(Date)
    case onThisDay
    func includes(_ date: Date?, now: Date = Date(), calendar: Calendar = .current) -> Bool {
        if case .all = self { return true }
        guard let date else { return false }
        switch self {
        case .all: return true
        case .month(let start):
            guard let interval = calendar.dateInterval(of: .month, for: start) else { return false }
            return date >= interval.start && date < interval.end
        case .onThisDay:
            let photo = calendar.dateComponents([.year, .month, .day], from: date)
            let today = calendar.dateComponents([.year, .month, .day], from: now)
            return photo.month == today.month && photo.day == today.day && (photo.year ?? Int.max) < (today.year ?? Int.min)
        }
    }
    static func monthStarts(in dates: [Date?], calendar: Calendar = .current) -> [Date] {
        Set(dates.compactMap { date in date.flatMap { calendar.dateInterval(of: .month, for: $0)?.start } }).sorted(by: >)
    }
    static func monthID(for date: Date, calendar: Calendar = .current) -> String {
        let start = calendar.dateInterval(of: .month, for: date)?.start ?? date
        return "month:\(start.timeIntervalSince1970)"
    }
}

enum PhotoOrder: String, CaseIterable, Identifiable {
    case newest, oldest, largest, random
    var id: String { rawValue }
    var title: String {
        switch self {
        case .newest: return "Nieuwste eerst"
        case .oldest: return "Oudste eerst"
        case .largest: return "Grootste eerst"
        case .random: return "Willekeurige volgorde"
        }
    }
}

/// Size estimate from public metadata only (no file reads, no private API).
/// Photos: about 0.3 byte per pixel (HEIC/JPEG), plus the short movie of a Live Photo.
/// Videos: about 0.6 byte per pixel per second (typical iPhone HEVC/H.264 bitrates).
enum SizeEstimate {
    static let livePhotoMovie = 1_500_000.0
    static func bytes(isVideo: Bool, pixelWidth: Int, pixelHeight: Int, duration: Double, isLive: Bool = false) -> Double {
        let pixels = Double(max(0, pixelWidth)) * Double(max(0, pixelHeight))
        if isVideo { return pixels * max(1, duration) * 0.6 }
        return pixels * 0.3 + (isLive ? livePhotoMovie : 0)
    }
}

/// One short, finishable session: progress toward a small goal keeps swiping fast.
struct ReviewSession: Equatable {
    static let sizes = [30, 50, 100]
    /// People asked for their own batch size; 100 is the default.
    static var size: Int {
        let stored = UserDefaults.standard.integer(forKey: "fotoswipe.sessionSize")
        return sizes.contains(stored) ? stored : 100
    }
    private(set) var kept: [String] = []
    private(set) var trashed: [String] = []
    private(set) var later: [String] = []
    private(set) var startedAt: Date?
    var count: Int { kept.count + trashed.count + later.count }
    var isComplete: Bool { count >= Self.size }
    var progress: Double { min(1, Double(count) / Double(Self.size)) }

    mutating func record(_ id: String, _ choice: PhotoDecision, now: Date = Date()) {
        if startedAt == nil { startedAt = now }
        remove(id)
        switch choice {
        case .keep: kept.append(id)
        case .trash: trashed.append(id)
        case .later: later.append(id)
        }
    }
    /// Undo removes the item from this session's tally.
    mutating func remove(_ id: String) {
        kept.removeAll { $0 == id }; trashed.removeAll { $0 == id }; later.removeAll { $0 == id }
    }
    func duration(now: Date = Date()) -> TimeInterval { startedAt.map { now.timeIntervalSince($0) } ?? 0 }
}

/// A forgiving daily streak: one missed day in between does not break it.
struct StreakStore: Codable, Equatable {
    static let dailyGoal = 10
    private(set) var activeDays: [String] = []
    private(set) var countDay = ""
    private(set) var countToday = 0
    var freedBytes: Int64 = 0

    static func key(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    /// Counts choices; a day becomes active at the daily goal or when a session is finished.
    mutating func recordChoice(now: Date = Date(), calendar: Calendar = .current) {
        let today = Self.key(now, calendar: calendar)
        if countDay != today { countDay = today; countToday = 0 }
        countToday += 1
        if countToday >= Self.dailyGoal { markActive(now, calendar: calendar) }
    }
    mutating func markActive(_ now: Date = Date(), calendar: Calendar = .current) {
        let today = Self.key(now, calendar: calendar)
        if activeDays.last != today { activeDays.append(today) }
        if activeDays.count > 400 { activeDays.removeFirst(activeDays.count - 400) }
    }
    func isActive(_ date: Date, calendar: Calendar = .current) -> Bool { activeDays.contains(Self.key(date, calendar: calendar)) }
    func current(now: Date = Date(), calendar: Calendar = .current) -> Int {
        let active = Set(activeDays)
        var day = calendar.startOfDay(for: now)
        // Today may still be in progress: start from yesterday when today is not active yet.
        if !active.contains(Self.key(day, calendar: calendar)) {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day) else { return 0 }
            day = yesterday
        }
        var streak = 0
        var misses = 0
        for _ in 0..<800 {
            if active.contains(Self.key(day, calendar: calendar)) { streak += 1; misses = 0 }
            else { misses += 1; if misses > 1 { break } }
            guard let previous = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = previous
        }
        return streak
    }
}

struct PhotoProgress {
    var total = 0
    var reviewed = 0
}


/// Membership is fixed until the user explicitly starts another random session.
struct RandomReviewSession {
    let limit: Int
    private var identifiers: [String]?
    init(limit: Int) { self.limit = max(0, limit) }
    mutating func restart() { identifiers = nil }
    mutating func select(candidates: [String], available: Set<String>) -> [String] {
        if identifiers == nil {
            var unique: [String] = []
            var seen = Set<String>()
            for id in candidates where seen.insert(id).inserted { unique.append(id) }
            identifiers = Array(unique.shuffled().prefix(max(0, limit)))
        }
        return (identifiers ?? []).filter { available.contains($0) }
    }
}

/// A delayed external refresh must recheck this gate after a Photos mutation starts.
struct LibraryRefreshGate {
    private(set) var needsRefresh = false
    private var mutating = false
    private var suppressOwnObserver = false
    var canRunScheduledRefresh: Bool { !mutating && !suppressOwnObserver }
    mutating func didChange() -> Bool { needsRefresh = true; return canRunScheduledRefresh }
    mutating func beginMutation() { mutating = true; suppressOwnObserver = true }
    mutating func endMutation() { mutating = false; needsRefresh = true }
    mutating func refreshStarted() { needsRefresh = false; suppressOwnObserver = false }
}

enum SwipeCommitPolicy {
    /// A previously issued, visible-card swipe may finish during a metadata-only write.
    static func canFinish(deleting: Bool, loading: Bool, mutating: Bool) -> Bool { !deleting && !loading }
}

/// Focus mode: the whole photo is the target. Direction decides, a fast flick also counts.
enum FocusGesture: Equatable {
    case keep, trash, later, undo, none
    static func classify(dx: CGFloat, dy: CGFloat, predictedDX: CGFloat, predictedDY: CGFloat,
                         width: CGFloat, height: CGFloat) -> FocusGesture {
        if abs(dx) >= abs(dy) {
            let threshold = max(65, width * 0.23)
            if abs(dx) > threshold { return dx > 0 ? .keep : .trash }
            if abs(dx) > 18 && abs(predictedDX) > width * 0.65 { return predictedDX > 0 ? .keep : .trash }
            return .none
        }
        let threshold = max(90, height * 0.14)
        if dy < -threshold || (dy < -18 && predictedDY < -height * 0.45) { return .later }
        if dy > threshold || (dy > 18 && predictedDY > height * 0.45) { return .undo }
        return .none
    }
    /// Live feedback while dragging, before release.
    static func preview(dx: CGFloat, dy: CGFloat, width: CGFloat, height: CGFloat) -> FocusGesture {
        classify(dx: dx, dy: dy, predictedDX: dx, predictedDY: dy, width: width, height: height)
    }
}

/// Per-photo quality from an on-device thumbnail. Only these numbers are cached on the device; never images, never uploaded.
struct PhotoQuality: Sendable, Equatable, Codable {
    /// Variance of the Laplacian on a small grayscale thumbnail (0...1 intensities). Low = soft or blurred.
    let sharpness: Double
    /// Apple's aesthetics score (-1...1), iOS 18 and later; nil on iOS 17.
    let aesthetic: Double?
    /// Apple marks receipts, documents, notes and similar "utility" images (iOS 18 and later).
    let utility: Bool
}

/// Default effect: the best shot is preselected, so one confirmation handles a whole stack.
enum SmartPick {
    static let blurThreshold = 0.0009
    static func score(_ quality: PhotoQuality?) -> Double {
        guard let quality else { return 0 }
        return (quality.aesthetic ?? 0) * 2 + min(quality.sharpness / 0.004, 1.5)
    }
    /// Favourites always win; otherwise the highest score; ties keep the earliest photo.
    static func best(_ ids: [String], quality: [String: PhotoQuality], favorites: Set<String>) -> String? {
        var winner: String?
        var top = -Double.infinity
        for id in ids {
            let value = score(quality[id]) + (favorites.contains(id) ? 100 : 0)
            if value > top { top = value; winner = id }
        }
        return winner
    }
    /// Everything not kept is set aside for review. At least one photo of a stack always stays.
    static func decisions(group: [String], keep: Set<String>) -> [(String, PhotoDecision)] {
        let keepers = keep.intersection(group)
        guard !keepers.isEmpty else { return [] }
        return group.map { ($0, keepers.contains($0) ? .keep : .trash) }
    }
}

enum ClutterReason: Int, Comparable {
    case document, screenshot, blurry
    static func < (lhs: ClutterReason, rhs: ClutterReason) -> Bool { lhs.rawValue < rhs.rawValue }
    var label: String {
        switch self {
        case .document: return "Bonnetje of notitie"
        case .screenshot: return "Screenshot"
        case .blurry: return "Mogelijk wazig"
        }
    }
    /// Conservative on purpose: a wrong guess costs one extra swipe, never a deletion.
    static func classify(isScreenshot: Bool, isFavorite: Bool, quality: PhotoQuality?) -> ClutterReason? {
        if isFavorite { return nil }
        if isScreenshot { return .screenshot }
        guard let quality else { return nil }
        if quality.utility { return .document }
        if let aesthetic = quality.aesthetic {
            return quality.sharpness < SmartPick.blurThreshold * 2 && aesthetic < -0.2 ? .blurry : nil
        }
        return quality.sharpness < SmartPick.blurThreshold ? .blurry : nil
    }
}

/// One reminder per day at a time the user picked; skipped on days already done.
enum ReminderPlan {
    static func dates(now: Date, hour: Int, minute: Int, days: Int = 7, doneToday: Bool,
                      calendar: Calendar = .current) -> [Date] {
        let today = calendar.startOfDay(for: now)
        return (0..<days).compactMap { offset -> Date? in
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  let fire = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) else { return nil }
            if offset == 0 && (doneToday || fire <= now) { return nil }
            return fire
        }
    }
}
