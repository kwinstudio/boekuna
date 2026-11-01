import Foundation

/// 100 common wishlist gifts (what Dutch people actually ask for), shipped inside the app,
/// so finding something to put on your list works instantly and offline.
struct GiftIdea: Codable, Identifiable, Hashable {
    let n: String
    let c: String
    let p: [Int]
    let k: String?
    let top: Bool?

    var id: String { n }
    var name: String { n }
    var category: String { c }
    var minEuro: Int { p.first ?? 0 }
    var maxEuro: Int { p.last ?? minEuro }
    var isPopular: Bool { top ?? false }
    var priceText: String { minEuro == maxEuro ? "± €\(minEuro)" : "€\(minEuro)–\(maxEuro)" }
}

struct GiftCategory: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
}

struct GiftCatalog: Codable {
    let version: Int
    let categories: [GiftCategory]
    let ideas: [GiftIdea]

    static let shared: GiftCatalog = {
        guard let url = Bundle.main.url(forResource: "GiftIdeas", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let c = try? JSONDecoder().decode(GiftCatalog.self, from: data) else {
            return GiftCatalog(version: 0, categories: [], ideas: [])
        }
        return c
    }()

    func category(_ id: String) -> GiftCategory? { categories.first { $0.id == id } }

    static func fold(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "nl_NL"))
    }

    /// Instant search: name starts with the word > name contains it > keywords contain it.
    func search(_ query: String, budgetCents: Int? = nil, limit: Int = 12) -> [GiftIdea] {
        let words = Self.fold(query).split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init).filter { $0.count >= 2 }
        guard !words.isEmpty else { return [] }
        var scored: [(GiftIdea, Int)] = []
        for idea in ideas {
            let name = Self.fold(idea.name)
            let keys = Self.fold(idea.k ?? "") + " " + Self.fold(category(idea.category)?.name ?? "")
            var score = 0
            var all = true
            for w in words {
                if name.hasPrefix(w) { score += 30 }
                else if name.split(separator: " ").contains(where: { $0.hasPrefix(w) }) { score += 20 }
                else if name.contains(w) { score += 12 }
                else if keys.split(separator: " ").contains(where: { $0.hasPrefix(w) }) { score += 8 }
                else if keys.contains(w) { score += 4 }
                else { all = false }
            }
            guard all, score > 0 else { continue }
            if idea.isPopular { score += 3 }
            if let b = budgetCents, idea.minEuro * 100 <= b { score += 2 }
            scored.append((idea, score))
        }
        return scored.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.name < $1.0.name }.prefix(limit).map(\.0)
    }

    /// Popular ideas that fit the budget (or all popular ones when no budget).
    func popular(budgetCents: Int?) -> [GiftIdea] {
        let pop = ideas.filter(\.isPopular)
        guard let b = budgetCents else { return pop }
        let fit = pop.filter { $0.minEuro * 100 <= b }
        return fit.isEmpty ? pop : fit
    }

    func ideas(in category: String, budgetCents: Int?) -> [GiftIdea] {
        let list = ideas.filter { $0.category == category }
        guard let b = budgetCents else { return list }
        return list.sorted { ($0.minEuro * 100 <= b ? 0 : 1, $0.name) < ($1.minEuro * 100 <= b ? 0 : 1, $1.name) }
    }
}
