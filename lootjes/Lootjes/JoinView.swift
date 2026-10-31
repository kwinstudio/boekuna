import SwiftUI

/// Join with a code or a pasted link. Two fields at most: code, then your name.
struct JoinView: View {
    var initialCode: String?
    let onDone: (SavedGroup) -> Void

    @EnvironmentObject private var store: Store
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    @AppStorage("myName") private var savedMyName = ""

    @State private var code = ""
    @State private var preview: JoinPreview?
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case code, name }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let preview {
                        groupCard(preview)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Hoe heet je?").font(.headline)
                            TextField("Je naam", text: $name)
                                .textContentType(.givenName)
                                .textInputAutocapitalization(.words)
                                .submitLabel(.join)
                                .focused($focus, equals: .name)
                                .onSubmit { Task { await join() } }
                                .padding(14)
                                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                            if preview.memberNames.contains(where: { $0.lowercased() == name.trimmed.lowercased() }) {
                                Text("Die naam staat er al in. Ben jij dat? Vraag dan de organisator om jouw persoonlijke link. Ben je iemand anders, voeg dan een achternaam toe.")
                                    .font(.footnote).foregroundStyle(.orange)
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Plak je uitnodiging of typ de code").font(.headline)
                            TextField("Bijv. K7M2QX9", text: $code)
                                .font(.system(.title3, design: .monospaced))
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .code)
                                .submitLabel(.go)
                                .onSubmit { Task { await lookup() } }
                                .padding(14)
                                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                            PasteButton(payloadType: String.self) { strings in
                                guard let s = strings.first else { return }
                                Task { @MainActor in handlePasted(s) }
                            }
                            .buttonBorderShape(.capsule)
                            .tint(Theme.red)
                            Text("Heb je een persoonlijke link gekregen? Open die gewoon, of plak hem hier.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    if let error {
                        Label(error, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(20)
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Meedoen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } } }
            .bottomBar {
                if preview == nil {
                    PrimaryButton(title: "Zoek groep", isLoading: busy, isEnabled: !code.trimmed.isEmpty) { Task { await lookup() } }
                } else {
                    PrimaryButton(title: "Doe mee", systemImage: "hand.raised.fill", tint: Theme.accent(for: preview!.group.occasion),
                                  isLoading: busy, isEnabled: !name.trimmed.isEmpty && preview!.group.joinOpen && !preview!.group.isDrawn) {
                        Task { await join() }
                    }
                }
            }
            .task {
                name = savedMyName
                if let initialCode {
                    code = initialCode
                    await lookup()
                } else {
                    focus = .code
                }
            }
        }
    }

    private func groupCard(_ p: JoinPreview) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(p.group.occasion.title, systemImage: p.group.occasion.symbol)
                .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent(for: p.group.occasion))
            Text(p.group.name).font(.title2.weight(.bold))
            if let d = p.group.date { Text(DayFormat.long(d)).foregroundStyle(.secondary) }
            if let b = p.group.budgetCents { Text("Budget \(b.euroText)").foregroundStyle(.secondary) }
            if !p.memberNames.isEmpty {
                Text("Doen al mee: " + p.memberNames.joined(separator: ", "))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if p.group.isDrawn || !p.group.joinOpen {
                Text("Aanmelden is gesloten: er is al getrokken. Vraag de organisator om je toe te voegen.")
                    .font(.footnote).foregroundStyle(.orange)
            }
        }
        .card()
    }

    private func handlePasted(_ s: String) {
        switch LinkParser.parse(s) {
        case .join(let c):
            code = c
            Task { await lookup() }
        case .member:
            if let target = LinkParser.parse(s) {
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { router.open(target) }
            }
        case nil:
            code = s
            error = "Dit lijkt geen lootjes-link of code."
        }
    }

    private func lookup() async {
        error = nil
        guard case .join(let c) = LinkParser.parse(code) else {
            error = "Een code heeft 7 tekens, bijvoorbeeld K7M2QX9."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let p = try await API().groupByCode(c)
            withAnimation { preview = p }
            code = c
            focus = .name
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func join() async {
        guard let p = preview, !name.trimmed.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let r = try await API().join(code: p.group.joinCode, name: name.trimmed)
            savedMyName = name.trimmed
            let g = SavedGroup(id: p.group.id, name: p.group.name, occasion: p.group.occasion, eventDate: p.group.eventDate,
                               adminToken: nil, myToken: r.token, myName: r.member.name)
            store.upsert(g)
            store.markJoinedHere(g.id)
            Reminders.schedule(for: g)
            Haptics.success()
            onDone(store.group(g.id) ?? g)
        } catch {
            Haptics.warning()
            self.error = error.localizedDescription
        }
    }
}

/// Opening a personal link (from WhatsApp, or pasted): save it and go to the lootje.
struct OpenMemberLinkView: View {
    let token: String
    let onDone: (SavedGroup) -> Void
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let error {
                    ContentUnavailableView("Link werkt niet", systemImage: "link.badge.plus", description: Text(error))
                } else {
                    ProgressView("Je lootje wordt opgehaald…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluit") { dismiss() } } }
        }
        .task {
            do {
                // The organizer tapped someone else's personal link: don't open it (that would
                // mark it as "seen") and don't make it theirs.
                if let g = store.groups.first(where: { $0.isOrganizer && $0.myToken != token && $0.memberTokens.values.contains(token) }) {
                    error = "Dit is de persoonlijke link van iemand anders in \(g.name). Stuur hem door en open hem niet zelf."
                    return
                }
                let me = try await API().me(token)
                let g = SavedGroup(id: me.group.id, name: me.group.name, occasion: me.group.occasion,
                                   eventDate: me.group.eventDate, adminToken: nil, myToken: token, myName: me.me.name)
                store.upsert(g)
                if me.me.openedBefore == nil { store.markJoinedHere(g.id) }
                Reminders.schedule(for: g)
                onDone(store.group(g.id) ?? g)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
