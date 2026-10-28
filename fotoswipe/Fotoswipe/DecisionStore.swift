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
    case newest, oldest, random
    var id: String { rawValue }
    var title: String {
        switch self { case .newest: return "Nieuwste eerst"; case .oldest: return "Oudste eerst"; case .random: return "Willekeurige volgorde" }
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
