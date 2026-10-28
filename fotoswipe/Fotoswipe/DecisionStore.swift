import Foundation

enum PhotoDecision: String, Codable { case keep, trash }
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
    @discardableResult mutating func undo() -> String? {
        guard let last = history.popLast() else { return nil }
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
    mutating func resetKept() {
        let kept = Set(decisions.filter { $0.value == .keep }.map(\.key))
        decisions = decisions.filter { $0.value != .keep }
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
