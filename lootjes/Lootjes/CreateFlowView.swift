import SwiftUI
import ContactsUI

/// Three short steps: the occasion, the people, the rules. Everything has a sensible default,
/// so a typical group is ready in under a minute.
struct CreateFlowView: View {
    let onDone: (SavedGroup) -> Void

    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("myName") private var savedMyName = ""

    @State private var step = 0
    @State private var occasion: Occasion = .sinterklaas
    @State private var name = Occasion.sinterklaas.defaultName()
    @State private var nameEdited = false
    @State private var hasDate = true
    @State private var date = Occasion.sinterklaas.defaultDate() ?? .now
    @State private var budget: Int? = 2000
    @State private var poems = true
    @State private var note = ""

    @State private var myName = ""
    @State private var participates = true
    @State private var people: [String] = []
    @State private var exclusions: [NamePair] = []

    @State private var busy = false
    @State private var error: String?

    private let titles = ["Feest", "Wie", "Regels"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StepIndicator(current: step, titles: titles, tint: Theme.accent(for: occasion))
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                Group {
                    switch step {
                    case 0: occasionStep
                    case 1: PeopleStep(myName: $myName, participates: $participates, people: $people, tint: Theme.accent(for: occasion))
                    default: ExclusionsStep(names: allNames, exclusions: $exclusions, tint: Theme.accent(for: occasion))
                    }
                }
                .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)).combined(with: .opacity))
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Nieuwe trekking")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(step == 0 ? "Annuleer" : "Terug") {
                        if step == 0 { dismiss() } else { withAnimation { step -= 1 } }
                    }
                }
            }
            .bottomBar {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                }
                PrimaryButton(title: primaryTitle, systemImage: step == 2 ? "checkmark" : nil,
                              tint: Theme.accent(for: occasion), isLoading: busy, isEnabled: canContinue) {
                    next()
                }
                if step == 2 && exclusions.isEmpty {
                    Text("Geen regels nodig? Dan kun je dit overslaan.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .onAppear { if myName.isEmpty { myName = savedMyName } }
        }
        .interactiveDismissDisabled(!people.isEmpty)
    }

    private var allNames: [String] {
        (participates && !myName.trimmed.isEmpty ? [myName.trimmed] : []) + people
    }

    private var primaryTitle: String {
        switch step {
        case 0: "Volgende"
        case 1: "Volgende"
        default: "Groep maken"
        }
    }

    private var canContinue: Bool {
        switch step {
        case 0: !name.trimmed.isEmpty
        case 1: !myName.trimmed.isEmpty && Set(allNames.map { $0.lowercased() }).count == allNames.count
        default: true
        }
    }

    private func next() {
        error = nil
        if step < 2 {
            if step == 1 { savedMyName = myName.trimmed }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.9)) { step += 1 }
            return
        }
        Task { await create() }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let api = API()
            let created = try await api.createGroup(
                name: name.trimmed, occasion: occasion, eventDate: hasDate ? date : nil,
                budgetCents: budget, note: note.trimmed.isEmpty ? nil : note.trimmed, poems: occasion == .sinterklaas && poems,
                organizerName: myName.trimmed, organizerParticipates: participates, members: people
            )
            let saved = store.saveCreated(created)
            if !exclusions.isEmpty {
                let ids = Dictionary(created.members.map { ($0.name.lowercased(), $0.id) }, uniquingKeysWith: { a, _ in a })
                let pairs = exclusions.compactMap { p -> [String]? in
                    guard let a = ids[p.a.lowercased()], let b = ids[p.b.lowercased()] else { return nil }
                    return [a, b]
                }
                _ = try? await api.setExclusions(created.adminToken, pairs)
            }
            Haptics.success()
            Reminders.schedule(for: saved)
            onDone(saved)
        } catch {
            Haptics.warning()
            self.error = error.localizedDescription
        }
    }

    // MARK: Step 1

    private var occasionStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Wat vieren jullie?")
                    .font(.system(.title2, design: .rounded).weight(.bold))
                HStack(spacing: 10) {
                    ForEach(Occasion.allCases) { o in
                        Button {
                            Haptics.tap()
                            withAnimation(.snappy) { choose(o) }
                        } label: {
                            VStack(spacing: 8) {
                                Image(systemName: o.symbol).font(.title2)
                                Text(o.title).font(.subheadline.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity, minHeight: 84)
                            .foregroundStyle(occasion == o ? .white : Theme.accent(for: o))
                            .background(occasion == o ? Theme.accent(for: o) : Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityAddTraits(occasion == o ? .isSelected : [])
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Naam van de groep").font(.subheadline.weight(.semibold))
                    TextField("Bijvoorbeeld Familie de Vries", text: $name)
                        .textInputAutocapitalization(.words)
                        .padding(14)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                        .onChange(of: name) { _, _ in nameEdited = true }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Toggle(isOn: $hasDate.animation()) {
                        Text("Datum van \(occasion.eventWord)").font(.subheadline.weight(.semibold))
                    }
                    .tint(Theme.accent(for: occasion))
                    if hasDate {
                        DatePicker("Datum", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .environment(\.locale, Locale(identifier: "nl_NL"))
                    }
                }
                .card()

                VStack(alignment: .leading, spacing: 10) {
                    Text("Budget per cadeau").font(.subheadline.weight(.semibold))
                    BudgetChips(budget: $budget, tint: Theme.accent(for: occasion))
                }

                if occasion == .sinterklaas {
                    Toggle(isOn: $poems) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Met gedicht").font(.subheadline.weight(.semibold))
                            Text("Je krijgt een gedichthulp bij je lootje.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .tint(Theme.accent(for: occasion))
                    .card()
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Bericht voor iedereen (mag leeg)").font(.subheadline.weight(.semibold))
                    TextField("Bijv. we vieren het bij oma, neem iets lekkers mee", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                        .padding(14)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func choose(_ o: Occasion) {
        let wasDefaultName = !nameEdited || name == occasion.defaultName()
        occasion = o
        if wasDefaultName { name = o.defaultName(); nameEdited = false }
        if let d = o.defaultDate() { date = d; hasDate = true } else { hasDate = false }
        poems = o == .sinterklaas
    }
}

struct NamePair: Hashable, Identifiable {
    let a: String
    let b: String
    var id: String { "\(a)|\(b)" }
    init(_ x: String, _ y: String) {
        if x.lowercased() < y.lowercased() { a = x; b = y } else { a = y; b = x }
    }
}

struct BudgetChips: View {
    @Binding var budget: Int?
    var tint: Color
    private let options: [Int?] = [nil, 1000, 1500, 2000, 2500, 5000]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { o in
                    Button {
                        Haptics.tap()
                        budget = o
                    } label: {
                        Text(o.map(\.euroText) ?? "Geen")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .foregroundStyle(budget == o ? .white : .primary)
                            .background(budget == o ? tint : Theme.card, in: Capsule())
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityAddTraits(budget == o ? .isSelected : [])
                }
            }
        }
    }
}

// MARK: - People

struct PeopleStep: View {
    @Binding var myName: String
    @Binding var participates: Bool
    @Binding var people: [String]
    var tint: Color

    @State private var newName = ""
    @State private var showContacts = false
    @State private var toast: ToastData?
    @State private var lastRemoved: (Int, String)?
    @FocusState private var focus: Bool

    var body: some View {
        List {
            Section {
                TextField("Je naam", text: $myName)
                    .textContentType(.givenName)
                    .textInputAutocapitalization(.words)
                    .frame(minHeight: 44)
                Toggle("Ik doe zelf ook mee", isOn: $participates)
                    .tint(tint)
            } header: {
                Text("Jij")
            } footer: {
                Text("Als je meedoet, trek je ook een lootje. Ook jij ziet alleen je eigen lootje.")
            }

            Section {
                ForEach(Array(people.enumerated()), id: \.element) { i, person in
                    HStack(spacing: 12) {
                        InitialsBadge(name: person, size: 34, tint: tint)
                        Text(person)
                        Spacer()
                        if isDuplicate(person) {
                            Text("Dubbel").font(.caption.weight(.semibold)).foregroundStyle(.red)
                        }
                    }
                    .frame(minHeight: 44)
                    .swipeActions {
                        Button(role: .destructive) { remove(at: i) } label: { Label("Weg", systemImage: "trash") }
                    }
                }
                HStack {
                    TextField("Naam toevoegen", text: $newName)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.next)
                        .focused($focus)
                        .onSubmit(add)
                        .frame(minHeight: 44)
                    if !newName.trimmed.isEmpty {
                        Button("Voeg toe", action: add).font(.subheadline.weight(.semibold))
                    }
                }
                Button {
                    showContacts = true
                } label: {
                    Label("Uit contacten kiezen", systemImage: "person.crop.circle.badge.plus")
                        .frame(minHeight: 44)
                }
            } header: {
                Text("Deelnemers (\(people.count + (participates ? 1 : 0)))")
            } footer: {
                Text("Je hoeft niet iedereen nu toe te voegen. Straks kun je een link delen waarmee mensen zichzelf aanmelden.")
            }
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $showContacts) {
            ContactPicker { names in
                for n in names where !n.isEmpty && !allLower.contains(n.lowercased()) { people.append(n) }
            }
            .ignoresSafeArea()
        }
        .toast($toast) {
            if let r = lastRemoved { people.insert(r.1, at: min(r.0, people.count)) }
        }
        .onAppear { if people.isEmpty && !myName.isEmpty { focus = true } }
    }

    private var allLower: [String] { ([myName.trimmed] + people).map { $0.lowercased() } }

    private func isDuplicate(_ n: String) -> Bool {
        allLower.filter { $0 == n.lowercased() }.count > 1
    }

    private func add() {
        let n = newName.trimmed
        guard !n.isEmpty else { return }
        if allLower.contains(n.lowercased()) {
            Haptics.warning()
            toast = ToastData(message: "\(n) staat er al in. Voeg bijv. een achternaam toe.")
            return
        }
        Haptics.tap()
        withAnimation { people.append(n) }
        newName = ""
        focus = true
    }

    private func remove(at i: Int) {
        let name = people.remove(at: i)
        lastRemoved = (i, name)
        toast = ToastData(message: "\(name) weggehaald", undoTitle: "Ongedaan maken")
    }
}

/// System contact picker: needs no contacts permission, the user picks who to add.
struct ContactPicker: UIViewControllerRepresentable {
    let onPick: ([String]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let vc = CNContactPickerViewController()
        vc.delegate = context.coordinator
        vc.displayedPropertyKeys = [CNContactGivenNameKey, CNContactFamilyNameKey]
        return vc
    }

    func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let onPick: ([String]) -> Void
        init(onPick: @escaping ([String]) -> Void) { self.onPick = onPick }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contacts: [CNContact]) {
            onPick(ContactNames.names(for: contacts.map { ($0.givenName, $0.familyName, $0.nickname) }))
        }
    }
}

enum ContactNames {
    /// First names; when two people share one, add the first letter of the family name.
    static func names(for contacts: [(given: String, family: String, nick: String)]) -> [String] {
        let firsts = contacts.map { c in
            let g = c.given.trimmed
            return g.isEmpty ? (c.nick.trimmed.isEmpty ? c.family.trimmed : c.nick.trimmed) : g
        }
        return contacts.indices.map { i in
            let first = firsts[i]
            let clash = firsts.filter { $0.lowercased() == first.lowercased() }.count > 1
            if clash, let initial = contacts[i].family.trimmed.first, first != contacts[i].family.trimmed {
                return "\(first) \(initial)."
            }
            return first
        }
        .map { String($0.prefix(40)) }
    }
}

// MARK: - Exclusions

struct ExclusionsStep: View {
    let names: [String]
    @Binding var exclusions: [NamePair]
    var tint: Color
    @State private var picked: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Wie mogen elkaar niet trekken?")
                        .font(.system(.title2, design: .rounded).weight(.bold))
                    Text("Bijvoorbeeld partners of huisgenoten. Tik op twee namen.")
                        .foregroundStyle(.secondary)
                }
                if names.count < 2 {
                    Text("Voeg eerst deelnemers toe. Je kunt dit later ook nog instellen.")
                        .foregroundStyle(.secondary)
                        .card()
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(names, id: \.self) { n in
                            Button {
                                tap(n)
                            } label: {
                                Text(n)
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 44)
                                    .foregroundStyle(picked == n ? .white : .primary)
                                    .background(picked == n ? tint : Theme.card, in: Capsule())
                                    .overlay(Capsule().stroke(tint.opacity(isExcluded(n) ? 0.6 : 0), lineWidth: 1.5))
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    if let picked {
                        Text("Met wie mag \(picked) niet?").font(.footnote.weight(.semibold)).foregroundStyle(tint)
                    }
                }
                if !exclusions.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(exclusions) { p in
                            HStack {
                                Image(systemName: "person.2.slash").foregroundStyle(tint)
                                Text("\(p.a) en \(p.b)")
                                Spacer()
                                Button {
                                    Haptics.tap()
                                    withAnimation { exclusions.removeAll { $0 == p } }
                                } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary).font(.title3)
                                        .frame(width: 44, height: 44)
                                }
                                .accessibilityLabel("Verwijder regel \(p.a) en \(p.b)")
                            }
                            .frame(minHeight: 48)
                            Divider()
                        }
                    }
                    .card()
                    if let warning = DrawCheck.warning(names: names, exclusions: exclusions) {
                        Label(warning, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .padding(20)
        }
    }

    private func isExcluded(_ n: String) -> Bool { exclusions.contains { $0.a == n || $0.b == n } }

    private func tap(_ n: String) {
        Haptics.tap()
        if let p = picked {
            if p != n {
                let pair = NamePair(p, n)
                withAnimation { if !exclusions.contains(pair) { exclusions.append(pair) } }
                Haptics.success()
            }
            picked = nil
        } else {
            picked = n
        }
    }
}

/// Uses the same draw engine to warn early if the rules make a draw impossible.
enum DrawCheck {
    static func warning(names: [String], exclusions: [NamePair]) -> String? {
        guard names.count >= 3 else { return nil }
        let ids = Dictionary(uniqueKeysWithValues: names.map { ($0, UUID()) })
        let excl = Set(exclusions.compactMap { p -> Pair? in
            guard let a = ids[p.a], let b = ids[p.b] else { return nil }
            return Pair(a, b)
        })
        var rng = SystemRandomNumberGenerator()
        switch DrawEngine.draw(people: Array(ids.values), exclusions: excl, rng: &rng) {
        case .success: return nil
        case .failure(.nobodyLeft(let id)):
            let n = ids.first { $0.value == id }?.key ?? "Iemand"
            return "\(n) mag dan niemand meer trekken. Haal een regel weg."
        case .failure(.impossible):
            return "Met deze regels kan niet iedereen een lootje krijgen. Haal een regel weg of voeg mensen toe."
        case .failure(.tooFewPeople):
            return nil
        }
    }
}

/// Simple wrapping layout for name chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
