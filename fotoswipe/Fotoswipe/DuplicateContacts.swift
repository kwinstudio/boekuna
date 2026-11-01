import SwiftUI
import UIKit
import Contacts

/// What the duplicate check needs from a contact; plain values so the rules are testable.
struct ContactInfo: Equatable {
    let id: String
    var name: String
    var phones: [String] = []
    var emails: [String] = []
    /// How much is filled in; the fullest card stays and receives the rest.
    var richness: Int = 0
}

enum ContactDuplicates {
    static func normalizedName(_ name: String) -> String {
        name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }
    /// Last 9 digits, so "+31 6 1234 5678" and "06-12345678" match. Too short to compare: empty.
    static func normalizedPhone(_ phone: String) -> String {
        let digits = phone.filter(\.isNumber)
        return digits.count >= 6 ? String(digits.suffix(9)) : ""
    }
    /// For removing doubles while merging: short numbers (like 112 or 1200) compare on all their digits.
    static func phoneMergeKey(_ phone: String) -> String {
        let key = normalizedPhone(phone)
        return key.isEmpty ? "short:" + phone.filter(\.isNumber) : key
    }
    static func keys(_ contact: ContactInfo) -> Set<String> {
        Set(contact.phones.map(normalizedPhone).filter { !$0.isEmpty }.map { "p:" + $0 }
            + contact.emails.map { "e:" + $0.lowercased().trimmingCharacters(in: .whitespaces) }.filter { $0.count > 2 })
    }

    /// Groups of ids that are the same person. Conservative on purpose, because a merge can't be undone here:
    /// - the same full name, unless both cards have numbers (or both e-mails) and none match (two different "Jan de Vries");
    /// - the same number or e-mail, only when no two different names are on it (a family landline);
    /// - a group that ends up with two different names is dropped.
    static func groups(_ contacts: [ContactInfo]) -> [[String]] {
        var parent = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, $0.id) })
        func find(_ id: String) -> String {
            var root = id
            while let next = parent[root], next != root { root = next }
            return root
        }
        func union(_ a: String, _ b: String) { let ra = find(a), rb = find(b); if ra != rb { parent[rb] = ra } }

        var byName: [String: [ContactInfo]] = [:]
        var byKey: [String: [ContactInfo]] = [:]
        for contact in contacts {
            let name = normalizedName(contact.name)
            if !name.isEmpty { byName[name, default: []].append(contact) }
            for key in keys(contact) { byKey[key, default: []].append(contact) }
        }
        for list in byName.values where list.count > 1 {
            for (i, a) in list.enumerated() {
                for b in list[(i + 1)...] {
                    let ka = keys(a), kb = keys(b)
                    let shared = !ka.isDisjoint(with: kb)
                    // Both have numbers (or both e-mails) and none match: probably two people.
                    let phones = ka.contains { $0.hasPrefix("p:") } && kb.contains { $0.hasPrefix("p:") }
                    let mails = ka.contains { $0.hasPrefix("e:") } && kb.contains { $0.hasPrefix("e:") }
                    if shared || !(phones || mails) { union(a.id, b.id) }
                }
            }
        }
        // A shared number or e-mail only joins cards when it points to one person:
        // with two different names on it (a family landline), nothing is joined.
        for list in byKey.values where list.count > 1 {
            let names = Set(list.map { normalizedName($0.name) }.filter { !$0.isEmpty })
            guard names.count <= 1 else { continue }
            for other in list.dropFirst() { union(list[0].id, other.id) }
        }
        var grouped: [String: [String]] = [:]
        for contact in contacts { grouped[find(contact.id), default: []].append(contact.id) }
        let order = Dictionary(uniqueKeysWithValues: contacts.enumerated().map { ($1.id, $0) })
        let richness = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, $0.richness) })
        let names = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, normalizedName($0.name)) })
        return grouped.values.filter { $0.count > 1 }
            .filter { group in Set(group.compactMap { names[$0] }.filter { !$0.isEmpty }).count <= 1 }
            .map { group in group.sorted { (richness[$0] ?? 0, -(order[$0] ?? 0)) > (richness[$1] ?? 0, -(order[$1] ?? 0)) } }
            .sorted { (order[$0[0]] ?? 0) < (order[$1[0]] ?? 0) }
    }
}

@MainActor final class DuplicateContactsModel: ObservableObject {
    enum Phase: Equatable { case idle, asking, denied, loading, ready, merging, done(merged: Int, failed: Int) }
    @Published private(set) var phase = Phase.idle
    @Published private(set) var groups: [[CNContact]] = []
    @Published var selected: Set<Int> = []
    private let store = CNContactStore()
    private static let keys: [CNKeyDescriptor] = [
        CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
        CNContactIdentifierKey as CNKeyDescriptor, CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor, CNContactMiddleNameKey as CNKeyDescriptor,
        CNContactNicknameKey as CNKeyDescriptor, CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactJobTitleKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor, CNContactPostalAddressesKey as CNKeyDescriptor,
        CNContactUrlAddressesKey as CNKeyDescriptor, CNContactBirthdayKey as CNKeyDescriptor,
        CNContactImageDataAvailableKey as CNKeyDescriptor, CNContactNamePrefixKey as CNKeyDescriptor,
        CNContactNameSuffixKey as CNKeyDescriptor, CNContactPreviousFamilyNameKey as CNKeyDescriptor,
        CNContactPhoneticGivenNameKey as CNKeyDescriptor, CNContactPhoneticFamilyNameKey as CNKeyDescriptor,
        CNContactDepartmentNameKey as CNKeyDescriptor, CNContactDatesKey as CNKeyDescriptor,
        CNContactRelationsKey as CNKeyDescriptor, CNContactSocialProfilesKey as CNKeyDescriptor,
        CNContactInstantMessageAddressesKey as CNKeyDescriptor, CNContactNonGregorianBirthdayKey as CNKeyDescriptor
    ]
    /// Photos are only loaded for the cards being merged, not for the whole address book.
    private static let imageKeys: [CNKeyDescriptor] = keys + [CNContactImageDataKey as CNKeyDescriptor]

    func start() {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .notDetermined:
            phase = .asking
            store.requestAccess(for: .contacts) { granted, _ in
                Task { @MainActor in if granted { self.load() } else { self.phase = .denied } }
            }
        case .denied, .restricted: phase = .denied
        default: load()
        }
    }

    func load() {
        phase = .loading
        let store = store
        let keys = Self.keys
        DispatchQueue.global(qos: .userInitiated).async {
            var contacts: [CNContact] = []
            let request = CNContactFetchRequest(keysToFetch: keys)
            try? store.enumerateContacts(with: request) { contact, _ in contacts.append(contact) }
            let infos = contacts.map { contact in
                ContactInfo(id: contact.identifier, name: Self.name(contact),
                            phones: contact.phoneNumbers.map(\.value.stringValue),
                            emails: contact.emailAddresses.map { $0.value as String },
                            richness: Self.richness(contact))
            }
            let lookup = Dictionary(uniqueKeysWithValues: contacts.map { ($0.identifier, $0) })
            let groups = ContactDuplicates.groups(infos).map { $0.compactMap { lookup[$0] } }
            DispatchQueue.main.async {
                self.groups = groups
                self.selected = []   // nothing is merged unless you pick it
                self.phase = .ready
            }
        }
    }

    nonisolated static func name(_ contact: CNContact) -> String {
        let full = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
        return full.isEmpty ? contact.organizationName : full
    }
    nonisolated static func richness(_ contact: CNContact) -> Int {
        contact.phoneNumbers.count + contact.emailAddresses.count + contact.postalAddresses.count
            + contact.urlAddresses.count + (contact.birthday == nil ? 0 : 1) + (contact.imageDataAvailable ? 2 : 0)
            + (contact.organizationName.isEmpty ? 0 : 1) + (contact.givenName.isEmpty ? 0 : 1) + (contact.familyName.isEmpty ? 0 : 1)
    }

    /// Keeps the fullest card, copies over what only the others have, then removes the others.
    func mergeSelected() {
        let chosen = selected.sorted().compactMap { groups.indices.contains($0) ? groups[$0] : nil }
        guard !chosen.isEmpty else { return }
        phase = .merging
        let store = store
        let keys = Self.imageKeys
        DispatchQueue.global(qos: .userInitiated).async {
            var merged = 0, failed = 0
            for group in chosen {
                // Re-read each card with its photo, so nothing changed since the list was made is lost.
                let fresh = group.compactMap { try? store.unifiedContact(withIdentifier: $0.identifier, keysToFetch: keys) }
                guard fresh.count == group.count, let first = fresh.first,
                      let primary = first.mutableCopy() as? CNMutableContact else { failed += 1; continue }
                let request = CNSaveRequest()
                for other in fresh.dropFirst() {
                    Self.copyMissing(from: other, into: primary)
                    if let removable = other.mutableCopy() as? CNMutableContact { request.delete(removable) }
                }
                request.update(primary)
                do { try store.execute(request); merged += 1 } catch { failed += 1 }
            }
            DispatchQueue.main.async { self.phase = .done(merged: merged, failed: failed) }
        }
    }

    nonisolated private static func copyMissing(from other: CNContact, into primary: CNMutableContact) {
        if primary.givenName.isEmpty { primary.givenName = other.givenName }
        if primary.familyName.isEmpty { primary.familyName = other.familyName }
        if primary.middleName.isEmpty { primary.middleName = other.middleName }
        if primary.nickname.isEmpty { primary.nickname = other.nickname }
        if primary.organizationName.isEmpty { primary.organizationName = other.organizationName }
        if primary.jobTitle.isEmpty { primary.jobTitle = other.jobTitle }
        if primary.namePrefix.isEmpty { primary.namePrefix = other.namePrefix }
        if primary.nameSuffix.isEmpty { primary.nameSuffix = other.nameSuffix }
        if primary.previousFamilyName.isEmpty { primary.previousFamilyName = other.previousFamilyName }
        if primary.phoneticGivenName.isEmpty { primary.phoneticGivenName = other.phoneticGivenName }
        if primary.phoneticFamilyName.isEmpty { primary.phoneticFamilyName = other.phoneticFamilyName }
        if primary.departmentName.isEmpty { primary.departmentName = other.departmentName }
        if primary.birthday == nil { primary.birthday = other.birthday }
        if primary.nonGregorianBirthday == nil { primary.nonGregorianBirthday = other.nonGregorianBirthday }
        if primary.imageData == nil, other.imageDataAvailable { primary.imageData = other.imageData }
        let phones = Set(primary.phoneNumbers.map { ContactDuplicates.phoneMergeKey($0.value.stringValue) })
        primary.phoneNumbers += other.phoneNumbers.filter { !phones.contains(ContactDuplicates.phoneMergeKey($0.value.stringValue)) }
        let dates = Set(primary.dates.map { "\($0.label ?? "")|\($0.value.day)-\($0.value.month)-\($0.value.year)" })
        primary.dates += other.dates.filter { !dates.contains("\($0.label ?? "")|\($0.value.day)-\($0.value.month)-\($0.value.year)") }
        let relations = Set(primary.contactRelations.map { $0.value.name.lowercased() })
        primary.contactRelations += other.contactRelations.filter { !relations.contains($0.value.name.lowercased()) }
        let socials = Set(primary.socialProfiles.map { "\($0.value.service)|\($0.value.username)".lowercased() })
        primary.socialProfiles += other.socialProfiles.filter { !socials.contains("\($0.value.service)|\($0.value.username)".lowercased()) }
        let messengers = Set(primary.instantMessageAddresses.map { "\($0.value.service)|\($0.value.username)".lowercased() })
        primary.instantMessageAddresses += other.instantMessageAddresses.filter { !messengers.contains("\($0.value.service)|\($0.value.username)".lowercased()) }
        let emails = Set(primary.emailAddresses.map { ($0.value as String).lowercased() })
        primary.emailAddresses += other.emailAddresses.filter { !emails.contains(($0.value as String).lowercased()) }
        let addresses = Set(primary.postalAddresses.map { CNPostalAddressFormatter.string(from: $0.value, style: .mailingAddress) })
        primary.postalAddresses += other.postalAddresses.filter { !addresses.contains(CNPostalAddressFormatter.string(from: $0.value, style: .mailingAddress)) }
        let urls = Set(primary.urlAddresses.map { ($0.value as String).lowercased() })
        primary.urlAddresses += other.urlAddresses.filter { !urls.contains(($0.value as String).lowercased()) }
    }
}

/// Shows every merge before it happens; nothing changes until you confirm.
struct DuplicateContactsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = DuplicateContactsModel()
    @State private var confirm = false

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .idle, .asking, .loading:
                    VStack { Spacer(); ProgressView("Contacten bekijken…").tint(Palette.brand); Spacer() }.frame(maxWidth: .infinity)
                case .denied:
                    ContentUnavailableView {
                        Label("Geen toegang tot contacten", systemImage: "person.crop.circle.badge.xmark")
                    } description: {
                        Text("Geef Fotoswipe toegang in Instellingen om dubbele contacten te vinden. Je contacten blijven op je iPhone.")
                    } actions: {
                        Button("Open Instellingen") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }.buttonStyle(PrimaryStyle())
                    }
                case .merging:
                    VStack { Spacer(); ProgressView("Samenvoegen…").tint(Palette.brand); Spacer() }.frame(maxWidth: .infinity)
                case .done(let count, let failed):
                    ContentUnavailableView {
                        Label("\(count) groepen samengevoegd", systemImage: failed == 0 ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                    } description: {
                        if failed == 0 { Text("Je contacten zijn bijgewerkt.") }
                        else { Text("\(failed) groepen konden niet worden samengevoegd, bijvoorbeeld omdat ze in een account staan dat je niet kunt wijzigen. Daar is niets aan veranderd.") }
                    } actions: {
                        Button("Klaar") { dismiss() }.buttonStyle(PrimaryStyle())
                    }
                case .ready:
                    if model.groups.isEmpty {
                        ContentUnavailableView("Geen dubbele contacten", systemImage: "person.2.fill",
                                               description: Text("Er staan geen contacten dubbel in je lijst."))
                    } else {
                        list
                    }
                }
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Dubbele contacten").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Sluiten") { dismiss() } }
                if model.phase == .ready && !model.groups.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        if model.selected.count == model.groups.count { Button("Niets kiezen") { model.selected = [] } }
                        else { Button("Alles kiezen") { model.selected = Set(model.groups.indices) } }
                    }
                }
            }
            .confirmationDialog("\(model.selected.count) groepen samenvoegen?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Voeg samen", role: .destructive) { model.mergeSelected() }
                Button("Annuleren", role: .cancel) {}
            } message: {
                Text("Per groep blijft één contact over met alle nummers, adressen en datums. De andere worden verwijderd, ook hun notities. Dit kan Fotoswipe niet terugdraaien. Gebruik je iCloud, dan kun je contacten op iCloud.com tot 30 dagen terugzetten.")
            }
        }
        .onAppear { if model.phase == .idle { model.start() } }
    }

    private var list: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    ForEach(Array(model.groups.enumerated()), id: \.offset) { index, group in
                        Button {
                            if model.selected.contains(index) { model.selected.remove(index) } else { model.selected.insert(index) }
                        } label: { row(group, on: model.selected.contains(index)) }
                    }
                } footer: {
                    Text("Kies de groepen die echt dezelfde persoon zijn. Het bovenste contact blijft en krijgt de gegevens van de andere.")
                }
            }
            .scrollContentBackground(.hidden)
            Button("Voeg \(model.selected.count) groepen samen") { confirm = true }
                .buttonStyle(PrimaryStyle())
                .disabled(model.selected.isEmpty)
                .padding(20)
        }
    }

    private func row(_ group: [CNContact], on: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .font(.title3).foregroundStyle(on ? Palette.brand : Palette.muted)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(group.enumerated()), id: \.offset) { position, contact in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: DuplicateContactsModel.name(contact).isEmpty ? String(localized: "Zonder naam", bundle: .app) : DuplicateContactsModel.name(contact))
                            .font(position == 0 ? .headline.weight(.semibold) : .subheadline)
                            .foregroundStyle(position == 0 ? Palette.ink : Palette.muted)
                        let details = contact.phoneNumbers.map(\.value.stringValue) + contact.emailAddresses.map { $0.value as String }
                        if !details.isEmpty {
                            Text(verbatim: details.prefix(2).joined(separator: " · ")).font(.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
