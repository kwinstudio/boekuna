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
                            if nameTaken(in: preview) {
                                Text("Die naam staat er al in. Ben jij dat? Vraag dan de organisator om jouw persoonlijke link. Ben je iemand anders, voeg dan een achternaam toe.")
                                    .font(.footnote).foregroundStyle(Theme.warning)
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
                .readableWidth()
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
                                  isLoading: busy, isEnabled: !name.trimmed.isEmpty && preview!.group.joinOpen && !preview!.group.isDrawn && !nameTaken(in: preview!)) {
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
            if p.group.isDrawn {
                Text("Er is al getrokken, dus aanmelden kan niet meer. Vraag de organisator om je toe te voegen.")
                    .font(.footnote).foregroundStyle(Theme.warning)
            } else if !p.group.joinOpen {
                Text("De organisator heeft het aanmelden gesloten. Vraag de organisator om je toe te voegen.")
                    .font(.footnote).foregroundStyle(Theme.warning)
            }
        }
        .card()
    }

    private func nameTaken(in p: JoinPreview) -> Bool {
        let n = name.trimmed.lowercased()
        return !n.isEmpty && p.memberNames.contains(where: { $0.lowercased() == n })
    }

    private func handlePasted(_ s: String) {
        switch LinkParser.parse(s) {
        case .join(let c):
            code = c
            Task { await lookup() }
        case .member, .admin:
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
            // Already in this group on this phone: this is someone else (e.g. a child), start empty.
            if store.groups.contains(where: { $0.groupId == p.group.id && $0.myToken != nil }) { name = "" }
            withAnimation { preview = p }
            code = c
            focus = .name
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func join() async {
        guard let p = preview, !name.trimmed.isEmpty, !nameTaken(in: p), !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let alreadyHere = store.groups.contains(where: { $0.groupId == p.group.id && $0.myToken != nil })
            let r = try await API().join(code: p.group.joinCode, name: name.trimmed)
            if !alreadyHere { savedMyName = name.trimmed }
            let g = store.saveMember(group: p.group, token: r.token, memberId: r.member.id, name: r.member.name)
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
    @State private var canRetry = false
    @State private var askManage = false
    @State private var loading = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let error {
                    ContentUnavailableView {
                        Label("Link werkt niet", systemImage: "link")
                    } description: {
                        Text(error)
                    } actions: {
                        if canRetry {
                            Button("Opnieuw proberen") {
                                self.error = nil
                                Task { await open() }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                } else if askManage {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Dit is de link van een andere deelnemer").font(.title3.weight(.semibold))
                        Text("Beheer je de lootjes voor deze persoon, bijvoorbeeld je kind? Dan zet je het lootje op deze telefoon. Anders: stuur de link door en open hem niet zelf.")
                            .foregroundStyle(.secondary)
                        PrimaryButton(title: "Ja, ik beheer dit lootje", isLoading: loading) { Task { await open() } }
                        SecondaryButton(title: "Nee, sluiten") { dismiss() }
                    }
                    .padding(20)
                    Spacer()
                } else {
                    ProgressView("Je lootje wordt opgehaald…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluit") { dismiss() } } }
        }
        .task {
            // The organizer tapped someone else's personal link: ask first. Opening it marks it as
            // "seen", which is only right when this phone manages that person (e.g. a child).
            if store.groups.contains(where: { $0.isOrganizer && $0.myToken != token && $0.memberTokens.values.contains(token) })
                && !store.groups.contains(where: { $0.myToken == token }) {
                askManage = true
                return
            }
            await open()
        }
    }

    private func open() async {
        loading = true
        defer { loading = false }
        do {
            let me = try await API().me(token)
            let g = store.saveMember(group: me.group, token: token, memberId: me.me.id, name: me.me.name)
            if me.me.openedBefore == nil || askManage { store.markJoinedHere(g.id) }
            Reminders.schedule(for: g)
            onDone(store.group(g.id) ?? g)
        } catch {
            canRetry = LinkErrors.isRetryable(error)
            self.error = error.localizedDescription
        }
    }
}

/// A management link: lets a second phone (or a co-organizer) manage the group.
struct OpenAdminLinkView: View {
    let token: String
    let onDone: (SavedGroup) -> Void
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    @State private var canRetry = false

    var body: some View {
        NavigationStack {
            VStack {
                if let error {
                    ContentUnavailableView {
                        Label("Beheerlink werkt niet", systemImage: "link")
                    } description: {
                        Text(error)
                    } actions: {
                        if canRetry {
                            Button("Opnieuw proberen") {
                                self.error = nil
                                Task { await load() }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                } else {
                    ProgressView("Groep wordt opgehaald…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluit") { dismiss() } } }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let s = try await API().adminStatus(token)
            var g = store.group(s.group.id) ?? SavedGroup(id: s.group.id, name: s.group.name, occasion: s.group.occasion, eventDate: s.group.eventDate)
            g.adminToken = token
            store.upsert(g)
            Haptics.success()
            onDone(store.group(g.id) ?? g)
        } catch {
            canRetry = LinkErrors.isRetryable(error)
            self.error = error.localizedDescription
        }
    }
}

/// Network trouble is worth a retry; an invalid or removed link is not.
private enum LinkErrors {
    static func isRetryable(_ error: Error) -> Bool {
        guard let e = error as? APIError else { return true }
        return e.code == "offline" || e.code == "server"
    }
}
