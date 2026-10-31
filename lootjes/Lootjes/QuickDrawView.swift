import SwiftUI

/// Offline: everyone is together, no internet or links needed.
struct QuickDrawSetupView: View {
    let onDone: (QuickDraw) -> Void
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("myName") private var savedMyName = ""

    @State private var step = 0
    @State private var occasion: Occasion = .sinterklaas
    @State private var names: [String] = []
    @State private var newName = ""
    @State private var exclusions: [NamePair] = []
    @State private var error: String?
    @FocusState private var focus: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StepIndicator(current: step, titles: ["Wie", "Regels"], tint: Theme.accent(for: occasion))
                    .padding(.horizontal, 20).padding(.vertical, 12)
                if step == 0 { namesStep } else {
                    ExclusionsStep(names: names, exclusions: $exclusions, tint: Theme.accent(for: occasion))
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Iedereen is hier")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(step == 0 ? "Annuleer" : "Terug") { if step == 0 { dismiss() } else { withAnimation { step = 0 } } }
                }
            }
            .bottomBar {
                if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                PrimaryButton(title: step == 0 ? "Volgende" : "Trek de lootjes", systemImage: step == 0 ? nil : "sparkles",
                              tint: Theme.accent(for: occasion), isEnabled: names.count >= 3) {
                    if step == 0 { withAnimation { step = 1 } } else { draw() }
                }
            }
            .onAppear {
                if names.isEmpty, !savedMyName.isEmpty { names = [savedMyName] }
                focus = true
            }
        }
    }

    private var namesStep: some View {
        List {
            Section {
                Picker("Gelegenheid", selection: $occasion) {
                    ForEach(Occasion.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Section {
                ForEach(names, id: \.self) { n in
                    HStack(spacing: 12) {
                        InitialsBadge(name: n, size: 34, tint: Theme.accent(for: occasion))
                        Text(n)
                    }
                    .frame(minHeight: 44)
                }
                .onDelete { names.remove(atOffsets: $0) }
                TextField("Naam toevoegen", text: $newName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.next)
                    .focused($focus)
                    .onSubmit(add)
                    .frame(minHeight: 44)
            } header: {
                Text("Wie doen er mee? (\(names.count))")
            } footer: {
                Text(names.count < 3 ? "Minstens 3 mensen." : "De telefoon gaat straks rond. Iedereen kiest zijn eigen naam en bekijkt zijn lootje.")
            }
        }
        .scrollContentBackground(.hidden)
    }

    private func add() {
        let n = newName.trimmed
        guard !n.isEmpty else { return }
        if names.contains(where: { $0.lowercased() == n.lowercased() }) {
            Haptics.warning()
            error = "\(n) staat er al in."
            return
        }
        error = nil
        Haptics.tap()
        withAnimation { names.append(n) }
        newName = ""
        focus = true
    }

    private func draw() {
        let ids = Dictionary(uniqueKeysWithValues: names.map { ($0, UUID()) })
        let back = Dictionary(uniqueKeysWithValues: ids.map { ($0.value, $0.key) })
        let excl = Set(exclusions.compactMap { p -> Pair? in
            guard let a = ids[p.a], let b = ids[p.b] else { return nil }
            return Pair(a, b)
        })
        var rng = SystemRandomNumberGenerator()
        switch DrawEngine.draw(people: Array(ids.values), exclusions: excl, rng: &rng) {
        case .success(let r):
            let pairs = Dictionary(uniqueKeysWithValues: r.pairs.map { (back[$0.key]!, back[$0.value]!) })
            let q = QuickDraw(name: "\(occasion.title) \(Date.now.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "nl_NL"))))",
                              occasion: occasion, people: names, pairs: pairs, exclusions: exclusions.map { [$0.a, $0.b] })
            store.upsertQuick(q)
            Haptics.success()
            onDone(q)
        case .failure:
            Haptics.warning()
            error = DrawCheck.warning(names: names, exclusions: exclusions) ?? "Trekken lukt niet met deze regels."
        }
    }
}

struct QuickDrawView: View {
    let drawId: UUID
    @EnvironmentObject private var store: Store
    @State private var showPass = false
    @State private var confirmRedraw = false

    private var draw: QuickDraw? { store.quickDraws.first { $0.id == drawId } }

    var body: some View {
        Group {
            if let draw {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Label("Getrokken op deze telefoon", systemImage: "iphone.gen3")
                                .font(.headline).foregroundStyle(Theme.accent(for: draw.occasion))
                            Text("Geef de telefoon door. Iedereen kiest zijn eigen naam en bekijkt zijn lootje. Het blijft op deze telefoon, zonder internet.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .card()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(draw.seen.count) van \(draw.people.count) hebben gekeken").font(.headline)
                            ProgressView(value: Double(draw.seen.count), total: Double(draw.people.count))
                                .tint(Theme.accent(for: draw.occasion))
                            Text(draw.people.map { draw.seen.contains($0) ? "\($0) ✓" : $0 }.joined(separator: ", "))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .card()
                    }
                    .padding(20)
                }
                .background(Theme.paper.ignoresSafeArea())
                .navigationTitle(draw.name)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { confirmRedraw = true } label: { Label("Opnieuw trekken", systemImage: "arrow.triangle.2.circlepath") }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                }
                .bottomBar {
                    PrimaryButton(title: draw.seen.count == draw.people.count ? "Nog eens kijken" : "Geef de telefoon door",
                                  systemImage: "iphone.gen3.radiowaves.left.and.right", tint: Theme.accent(for: draw.occasion)) {
                        showPass = true
                    }
                }
                .fullScreenCover(isPresented: $showPass) {
                    PassPhoneView(names: draw.people, tint: Theme.accent(for: draw.occasion), seen: Binding(
                        get: { store.quickDraws.first { $0.id == drawId }?.seen ?? [] },
                        set: { v in if var d = store.quickDraws.first(where: { $0.id == drawId }) { d.seen = v; store.upsertQuick(d) } }
                    )) { name in
                        guard let r = draw.pairs[name] else { throw APIError(code: "missing", message: "Geen lootje gevonden.") }
                        return r
                    }
                }
                .confirmationDialog("Opnieuw trekken?", isPresented: $confirmRedraw, titleVisibility: .visible) {
                    Button("Opnieuw trekken", role: .destructive) { redraw(draw) }
                } message: {
                    Text("Iedereen krijgt een nieuw lootje en moet opnieuw kijken.")
                }
            } else {
                ContentUnavailableView("Niet gevonden", systemImage: "questionmark")
            }
        }
    }

    private func redraw(_ d: QuickDraw) {
        let ids = Dictionary(uniqueKeysWithValues: d.people.map { ($0, UUID()) })
        let back = Dictionary(uniqueKeysWithValues: ids.map { ($0.value, $0.key) })
        var rng = SystemRandomNumberGenerator()
        // Avoid the previous result where possible.
        let last = Dictionary(uniqueKeysWithValues: d.pairs.compactMap { g, r in ids[g].flatMap { gi in ids[r].map { (gi, $0) } } })
        let excl = Set(d.exclusions.compactMap { p -> Pair? in
            guard p.count == 2, let a = ids[p[0]], let b = ids[p[1]] else { return nil }
            return Pair(a, b)
        })
        if case .success(let r) = DrawEngine.draw(people: Array(ids.values), exclusions: excl, lastYear: last, rng: &rng) {
            var nd = d
            nd.pairs = Dictionary(uniqueKeysWithValues: r.pairs.map { (back[$0.key]!, back[$0.value]!) })
            nd.seen = []
            store.upsertQuick(nd)
            Haptics.success()
        }
    }
}
