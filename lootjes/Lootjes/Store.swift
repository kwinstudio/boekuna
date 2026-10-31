import Foundation
import Security
import SwiftUI

/// Local memory of this device: groups (with their secret links) and quick offline draws.
/// Group links are kept in the Keychain, synced through iCloud Keychain when available,
/// so a new phone or a reinstall does not lose your groups.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var groups: [SavedGroup] = []
    @Published private(set) var quickDraws: [QuickDraw] = []

    private let keychain: KeychainBox
    private let defaults: UserDefaults

    init(keychain: KeychainBox = KeychainBox(account: "groups.v1"), defaults: UserDefaults = .standard) {
        self.keychain = keychain
        self.defaults = defaults
        groups = (try? JSONDecoder().decode([SavedGroup].self, from: keychain.read() ?? Data())) ?? []
        quickDraws = (try? JSONDecoder().decode([QuickDraw].self, from: defaults.data(forKey: "quickDraws.v1") ?? Data())) ?? []
    }

    var sortedGroups: [SavedGroup] {
        groups.sorted { ($0.date ?? .distantFuture, $0.addedAt) < ($1.date ?? .distantFuture, $1.addedAt) }
    }

    func group(_ id: String) -> SavedGroup? { groups.first { $0.id == id } }

    /// True when this phone created or joined the group itself (so an earlier "opened" was us).
    func groupJoinedHere(_ id: String) -> Bool { joinedHere.contains(id) }
    func markJoinedHere(_ id: String) { joinedHere.insert(id) }
    private var joinedHere = Set<String>()

    /// Merge: never throw away a token we already had.
    func upsert(_ g: SavedGroup) {
        if let i = groups.firstIndex(where: { $0.id == g.id }) {
            var merged = groups[i]
            merged.name = g.name
            merged.occasion = g.occasion
            merged.eventDate = g.eventDate
            merged.adminToken = g.adminToken ?? merged.adminToken
            merged.myToken = g.myToken ?? merged.myToken
            merged.myName = g.myName ?? merged.myName
            merged.memberTokens.merge(g.memberTokens) { _, new in new }
            groups[i] = merged
        } else {
            groups.append(g)
        }
        save()
    }

    func update(_ id: String, _ change: (inout SavedGroup) -> Void) {
        guard let i = groups.firstIndex(where: { $0.id == id }) else { return }
        change(&groups[i])
        save()
    }

    func remove(_ id: String) -> SavedGroup? {
        guard let i = groups.firstIndex(where: { $0.id == id }) else { return nil }
        let g = groups.remove(at: i)
        save()
        return g
    }

    func saveCreated(_ c: CreatedGroup) -> SavedGroup {
        let mine = c.members.first(where: \.isOrganizer)
        let g = SavedGroup(
            id: c.group.id, name: c.group.name, occasion: c.group.occasion, eventDate: c.group.eventDate,
            adminToken: c.adminToken, myToken: mine?.token, myName: mine?.name,
            memberTokens: Dictionary(uniqueKeysWithValues: c.members.map { ($0.id, $0.token) })
        )
        upsert(g)
        return g
    }

    // MARK: Quick draws

    func upsertQuick(_ q: QuickDraw) {
        if let i = quickDraws.firstIndex(where: { $0.id == q.id }) { quickDraws[i] = q } else { quickDraws.insert(q, at: 0) }
        saveQuick()
    }

    func removeQuick(_ id: UUID) -> QuickDraw? {
        guard let i = quickDraws.firstIndex(where: { $0.id == id }) else { return nil }
        let q = quickDraws.remove(at: i)
        saveQuick()
        return q
    }

    private func save() {
        if let data = try? JSONEncoder().encode(groups) { keychain.write(data) }
    }

    private func saveQuick() {
        defaults.set(try? JSONEncoder().encode(quickDraws), forKey: "quickDraws.v1")
    }
}

/// One Keychain item holding a small JSON blob.
struct KeychainBox {
    let account: String
    var service = "nl.zichtwerfstudio.lootjes"
    var synchronizable = true

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: synchronizable ? kCFBooleanTrue! : kCFBooleanFalse!,
        ]
    }

    func read() -> Data? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    func write(_ data: Data) {
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add.merge(attrs) { $1 }
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
