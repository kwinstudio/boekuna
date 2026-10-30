import Foundation

/// Pure, testable lootjes-trekking.
///
/// Hard rules: nobody draws themselves, nobody draws someone they are excluded from
/// (e.g. their partner). Soft rule: avoid last year's pairs; dropped only when the
/// hard rules leave no other option.
///
/// Method: rejection sampling over random permutations (uniform over all valid draws),
/// with a randomized backtracking fallback for tightly constrained groups.
/// Before drawing, a bipartite matching check proves whether a valid draw exists,
/// so the app can explain *why* it is impossible instead of hanging.
enum DrawEngine {
    struct Result: Equatable {
        /// giver id -> receiver id
        let pairs: [UUID: UUID]
        /// true when last year's pairs could not all be avoided
        let repeatedLastYear: Bool
    }

    enum Failure: Error, Equatable {
        case tooFewPeople
        /// This person has nobody left they are allowed to draw.
        case nobodyLeft(for: UUID)
        /// No valid draw exists for the group as a whole.
        case impossible
    }

    static func draw(
        people: [UUID],
        exclusions: Set<Pair>,
        lastYear: [UUID: UUID] = [:],
        rng: inout some RandomNumberGenerator
    ) -> Swift.Result<Result, Failure> {
        let ids = Array(Set(people)).sorted { $0.uuidString < $1.uuidString }
        guard ids.count >= 3 else { return .failure(.tooFewPeople) }

        func allowed(_ giver: UUID, _ receiver: UUID, avoidLastYear: Bool) -> Bool {
            if giver == receiver { return false }
            if exclusions.contains(Pair(giver, receiver)) { return false }
            if avoidLastYear, lastYear[giver] == receiver { return false }
            return true
        }

        for person in ids where !ids.contains(where: { allowed(person, $0, avoidLastYear: false) }) {
            return .failure(.nobodyLeft(for: person))
        }

        for avoid in [true, false] where !lastYear.isEmpty || !avoid {
            let ok = { (g: UUID, r: UUID) in allowed(g, r, avoidLastYear: avoid) }
            guard isFeasible(ids, ok) else { continue }
            if let pairs = sample(ids, ok, rng: &rng) {
                let repeated = pairs.contains { lastYear[$0.key] == $0.value }
                return .success(Result(pairs: pairs, repeatedLastYear: repeated))
            }
        }
        return .failure(.impossible)
    }

    /// Checks that a draw exists, without drawing (Kuhn's augmenting paths; groups are small).
    static func isFeasible(_ ids: [UUID], _ ok: (UUID, UUID) -> Bool) -> Bool {
        var owner: [UUID: UUID] = [:] // receiver -> giver
        func augment(_ giver: UUID, _ seen: inout Set<UUID>) -> Bool {
            for r in ids where ok(giver, r) && !seen.contains(r) {
                seen.insert(r)
                if let other = owner[r] {
                    if augment(other, &seen) { owner[r] = giver; return true }
                } else {
                    owner[r] = giver
                    return true
                }
            }
            return false
        }
        for g in ids {
            var seen = Set<UUID>()
            if !augment(g, &seen) { return false }
        }
        return true
    }

    private static func sample(
        _ ids: [UUID], _ ok: (UUID, UUID) -> Bool, rng: inout some RandomNumberGenerator
    ) -> [UUID: UUID]? {
        // 1. Rejection sampling: every valid draw is equally likely.
        for _ in 0..<5_000 {
            let receivers = ids.shuffled(using: &rng)
            if zip(ids, receivers).allSatisfy({ ok($0, $1) }) {
                return Dictionary(uniqueKeysWithValues: zip(ids, receivers))
            }
        }
        // 2. Randomized backtracking for tight constraint sets.
        let givers = ids.shuffled(using: &rng)
        var taken = Set<UUID>()
        var result: [UUID: UUID] = [:]
        func place(_ index: Int, rng: inout some RandomNumberGenerator) -> Bool {
            if index == givers.count { return true }
            let giver = givers[index]
            for r in ids.shuffled(using: &rng) where !taken.contains(r) && ok(giver, r) {
                taken.insert(r); result[giver] = r
                if place(index + 1, rng: &rng) { return true }
                taken.remove(r); result[giver] = nil
            }
            return false
        }
        return place(0, rng: &rng) ? result : nil
    }
}

/// Unordered pair: an exclusion between partners works both ways.
struct Pair: Hashable, Codable {
    let a: UUID
    let b: UUID
    init(_ x: UUID, _ y: UUID) {
        if x.uuidString < y.uuidString { a = x; b = y } else { a = y; b = x }
    }
    func contains(_ id: UUID) -> Bool { a == id || b == id }
}
