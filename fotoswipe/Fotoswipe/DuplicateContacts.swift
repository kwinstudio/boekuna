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
    /// Last 9 digits, so "+31 6 1234 5678" and "06-12345678" match.
    static func normalizedPhone(_ phone: String) -> String {
        let digits = phone.filter(\.isNumber)
        return digits.count >= 6 ? String(digits.suffix(9)) : ""
    }

    /// Groups of ids that are the same person. Conservative on purpose:
    /// the same full name, or the same number or e-mail when one of the two cards has no name.
    static func groups(_ contacts: [ContactInfo]) -> [[String]] {
        var parent = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, $0.id) })
        func find(_ id: String) -> String {
            var root = id
            while let next = parent[root], next != root { root = next }
            return root
        }
        func union(_ a: String, _ b: String) { let ra = find(a), rb = find(b); if ra != rb { parent[rb] = ra } }

        var byName: [String: String] = [:]
        var byKey: [String: [ContactInfo]] = [:]
        for contact in contacts {
            let name = normalizedName(contact.name)
            if !name.isEmpty {
                if let other = byName[name] { union(other, contact.id) } else { byName[name] = contact.id }
            }
            let keys = contact.phones.map(normalizedPhone).filter { !$0.isEmpty }.map { "p:" + $0 }
                + contact.emails.map { "e:" + $0.lowercased().trimmingCharacters(in: .whitespaces) }.filter { $0.count > 2 }
            for key in Set(keys) { byKey[key, default: []].append(contact) }
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
        return grouped.values.filter { $0.count > 1 }
            .map { group in group.sorted { (richness[$0] ?? 0, -(order[$0] ?? 0)) > (richness[$1] ?? 0, -(order[$1] ?? 0)) } }
            .sorted { (order[$0[0]] ?? 0) < (order[$1[0]] ?? 0) }
    }
}

@MainActor final class DuplicateContactsModel: ObservableObject {
    enum Phase: Equatable { case idle, asking, denied, loading, ready, merging, done(Int) }
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
        CNContactImageDataAvailableKey as CNKeyDescriptor, CNContactImageDataKey as CNKeyDescriptor
    ]

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
                self.selected = Set(groups.indices)
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
        DispatchQueue.global(qos: .userInitiated).async {
            var merged = 0
            for group in chosen {
                guard let first = group.first, let primary = first.mutableCopy() as? CNMutableContact else { continue }
                let request = CNSaveRequest()
                for other in group.dropFirst() {
                    Self.copyMissing(from: other, into: primary)
                    if let removable = other.mutableCopy() as? CNMutableContact { request.delete(removable) }
                }
                request.update(primary)
                do { try store.execute(request); merged += 1 } catch { continue }
            }
            DispatchQueue.main.async { self.phase = .done(merged) }
        }
    }

    nonisolated private static func copyMissing(from other: CNContact, into primary: CNMutableContact) {
        if primary.givenName.isEmpty { primary.givenName = other.givenName }
        if primary.familyName.isEmpty { primary.familyName = other.familyName }
        if primary.middleName.isEmpty { primary.middleName = other.middleName }
        if primary.nickname.isEmpty { primary.nickname = other.nickname }
        if primary.organizationName.isEmpty { primary.organizationName = other.organizationName }
        if primary.jobTitle.isEmpty { primary.jobTitle = other.jobTitle }
        if primary.birthday == nil { primary.birthday = other.birthday }
        if primary.imageData == nil, other.imageDataAvailable { primary.imageData = other.imageData }
        let phones = Set(primary.phoneNumbers.map { ContactDuplicates.normalizedPhone($0.value.stringValue) })
        primary.phoneNumbers += other.phoneNumbers.filter { !phones.contains(ContactDuplicates.normalizedPhone($0.value.stringValue)) }
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
                case .done(let count):
                    ContentUnavailableView {
                        Label("\(count) groepen samengevoegd", systemImage: "checkmark.seal.fill")
                    } description: {
                        Text("Je contacten zijn bijgewerkt.")
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
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Sluiten") { dismiss() } } }
            .confirmationDialog("\(model.selected.count) groepen samenvoegen?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Voeg samen", role: .destructive) { model.mergeSelected() }
                Button("Annuleren", role: .cancel) {}
            } message: {
                Text("Per groep blijft één contact over met alle nummers en adressen. De andere worden verwijderd. Dit kan Fotoswipe niet terugdraaien. Gebruik je iCloud, dan kun je contacten op iCloud.com tot 30 dagen terugzetten.")
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
                    Text("Het bovenste contact blijft en krijgt de gegevens van de andere. Tik om een groep over te slaan.")
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
                            .font(position == 0 ? .headline.weight(.heavy) : .subheadline)
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
