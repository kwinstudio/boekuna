import SwiftUI

struct OrganizerView: View {
    let groupId: String
    /// Screenshot/demo mode: show this instead of loading.
    var preview: AdminStatus? = nil

    @EnvironmentObject private var store: Store
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    private let api = API()

    @State private var status: AdminStatus?
    @State private var loadError: String?
    @State private var busy = false
    @State private var newName = ""
    @State private var toast: ToastData?
    @State private var undo: (() -> Void)?
    @State private var showRules = false
    @State private var showPassPhone = false
    @State private var showEdit = false
    @State private var confirmRedraw = false
    @State private var confirmDelete = false
    @State private var justDrawn = false
    @State private var passSeen = Set<String>()
    @FocusState private var addFocus: Bool

    private var saved: SavedGroup? { store.group(groupId) }
    private var tint: Color { Theme.accent(for: status?.group.occasion ?? saved?.occasion ?? .sinterklaas) }

    var body: some View {
        Group {
            if let status {
                content(status)
            } else if let loadError {
                ContentUnavailableView {
                    Label("Kan de groep niet laden", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Opnieuw proberen") { Task { await load() } }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle(status?.group.name ?? saved?.name ?? "")
        .navigationBarTitleDisplayMode(.large)
        .toolbar { toolbar }
        .task { await load() }
        .refreshable { await load() }
        .toast($toast) { undo?() }
        .sheet(isPresented: $showRules) {
            if let status { RulesSheet(status: status, tint: tint) { pairs in await setRules(pairs) } }
        }
        .sheet(isPresented: $showEdit) {
            if let status, let token = saved?.adminToken {
                EditGroupSheet(group: status.group, adminToken: token) { updated in
                    self.status = updated
                    store.update(groupId) { $0.name = updated.group.name; $0.eventDate = updated.group.eventDate }
                    if let g = store.group(groupId) { Reminders.schedule(for: g) }
                }
            }
        }
        .fullScreenCover(isPresented: $showPassPhone) {
            if let status { passPhone(status) }
        }
        .confirmationDialog("Opnieuw trekken?", isPresented: $confirmRedraw, titleVisibility: .visible) {
            Button("Opnieuw trekken", role: .destructive) { Task { await draw(redraw: true) } }
        } message: {
            Text("Iedereen krijgt een nieuw lootje. Wie al gekeken heeft, moet opnieuw kijken. Anonieme berichten worden gewist.")
        }
        .confirmationDialog("Groep verwijderen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Verwijder voor iedereen", role: .destructive) { Task { await deleteGroup() } }
        } message: {
            Text("De lootjes, verlanglijstjes en berichten verdwijnen voor alle deelnemers.")
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { showEdit = true } label: { Label("Groep aanpassen", systemImage: "pencil") }
                Button { showRules = true } label: { Label("Wie mag wie niet trekken", systemImage: "person.2.slash") }
                if status?.group.isDrawn == true {
                    Button { confirmRedraw = true } label: { Label("Opnieuw trekken", systemImage: "arrow.triangle.2.circlepath") }
                    Button { Task { await nextYear() } } label: { Label("Volgend jaar weer", systemImage: "calendar.badge.plus") }
                }
                Divider()
                Button(role: .destructive) { confirmDelete = true } label: { Label("Groep verwijderen", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel("Meer")
        }
    }

    // MARK: Content

    private func content(_ s: AdminStatus) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(s)
                ProgressChecklist(status: s, tint: tint)
                if s.group.isDrawn {
                    if justDrawn || s.repeatedLastYear == true { drawnBanner(s) }
                    myOwnLootje(s)
                    sendLinks(s)
                } else {
                    invite(s)
                    participants(s)
                }
            }
            .padding(20)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
        .bottomBar {
            if s.group.isDrawn {
                PrimaryButton(title: "Iedereen is hier: geef de telefoon door", systemImage: "iphone.gen3.radiowaves.left.and.right", tint: tint) {
                    showPassPhone = true
                }
            } else {
                let n = s.members.count
                if n == 3 {
                    Text("Met 3 mensen kan iedereen raden wie wie heeft.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                PrimaryButton(title: n < 3 ? "Nog \(3 - n) \(3 - n == 1 ? "persoon" : "mensen") nodig" : "Trek de lootjes (\(n))",
                              systemImage: n < 3 ? nil : "sparkles", tint: tint, isLoading: busy, isEnabled: n >= 3) {
                    Task { await draw(redraw: false) }
                }
            }
        }
    }

    private func header(_ s: AdminStatus) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: s.group.occasion.symbol)
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(tint, in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                if let d = s.group.date {
                    Text(DayFormat.long(d)).font(.headline)
                    if let c = DayFormat.countdown(to: d) {
                        Text("\(s.group.occasion.eventWord.capitalizedFirst) is \(c)").font(.subheadline).foregroundStyle(.secondary)
                    }
                } else {
                    Text("Nog geen datum").font(.headline)
                }
                if let b = s.group.budgetCents {
                    Label("Budget \(b.euroText)", systemImage: "eurosign.circle").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .card()
    }

    private func drawnBanner(_ s: AdminStatus) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("De lootjes zijn getrokken!", systemImage: "checkmark.seal.fill")
                .font(.headline).foregroundStyle(tint)
            Text("Niemand kan zien wie wie heeft, ook jij niet. Stuur nu iedereen zijn eigen link.")
                .font(.subheadline)
            if s.repeatedLastYear == true {
                Text("Let op: door de regels moest iemand dezelfde persoon trekken als vorig jaar.")
                    .font(.footnote).foregroundStyle(.orange)
            }
        }
        .card()
    }

    @ViewBuilder
    private func myOwnLootje(_ s: AdminStatus) -> some View {
        if saved?.myToken != nil {
            Button {
                Haptics.tap()
                router.path.append(.member(groupId))
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: "envelope.badge.fill")
                        .font(.title2).foregroundStyle(tint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mijn lootje").font(.headline)
                        Text("Bekijk je lootje, het verlanglijstje en de berichten")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                .card()
            }
            .buttonStyle(PressableStyle())
        }
    }

    private func invite(_ s: AdminStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Laat mensen zichzelf aanmelden").font(.headline)
            Text("Deel deze link in de groepsapp. Iedereen vult zelf zijn naam in, met of zonder app.")
                .font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Text(s.group.joinCode)
                    .font(.system(.title3, design: .monospaced).weight(.bold))
                    .textSelection(.enabled)
                    .accessibilityLabel("Code \(s.group.joinCode.map(String.init).joined(separator: " "))")
                Spacer()
                if !s.group.joinOpen { Text("Gesloten").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
            }
            SecondaryButton(title: "Deel aanmeldlink", systemImage: "square.and.arrow.up", tint: tint) {
                Share.present(text: Share.inviteMessage(group: s.group.name, url: AppConfig.joinURL(code: s.group.joinCode), budget: s.group.budgetCents))
            }
        }
        .card()
    }

    private func participants(_ s: AdminStatus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Deelnemers (\(s.members.count))").font(.headline)
                Spacer()
                Button { showRules = true } label: {
                    Label(s.exclusions.isEmpty ? "Regels" : "Regels (\(s.exclusions.count))", systemImage: "person.2.slash")
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                }
            }
            ForEach(s.members) { m in
                HStack(spacing: 12) {
                    InitialsBadge(name: m.name, size: 36, tint: tint)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.name + (m.isOrganizer ? " (jij)" : ""))
                        if m.joinedSelf { Text("Zelf aangemeld").font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if !m.isOrganizer {
                        Button {
                            Task { await remove(m) }
                        } label: {
                            Image(systemName: "minus.circle.fill").font(.title3).foregroundStyle(.secondary)
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Haal \(m.name) weg")
                    }
                }
                .frame(minHeight: 52)
                Divider()
            }
            HStack {
                TextField("Naam toevoegen", text: $newName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .focused($addFocus)
                    .onSubmit { Task { await add() } }
                    .frame(minHeight: 48)
                Button {
                    Task { await add() }
                } label: {
                    Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(tint)
                        .frame(width: 44, height: 44)
                }
                .disabled(newName.trimmed.isEmpty)
                .accessibilityLabel("Voeg toe")
            }
        }
        .card()
    }

    private func sendLinks(_ s: AdminStatus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Stuur iedereen zijn lootje").font(.headline)
            Text("Elke link is persoonlijk. Je ziet wie hem al geopend heeft, maar niet wie wie heeft.")
                .font(.subheadline).foregroundStyle(.secondary)
                .padding(.bottom, 8)
            ForEach(s.members) { m in
                MemberStatusRow(member: m, tint: tint, token: saved?.memberTokens[m.id]) { token in
                    let url = AppConfig.memberURL(token: token)
                    Share.present(text: Share.personalMessage(name: m.name, group: s.group.name, occasion: s.group.occasion, url: url)) { done in
                        if done { Task { try? await api.markLinkSent(saved?.adminToken ?? "", memberId: m.id); await load() } }
                    }
                } renew: {
                    Task { await renew(m) }
                }
                Divider()
            }
        }
        .card()
    }

    private func passPhone(_ s: AdminStatus) -> some View {
        let tokens = saved?.memberTokens ?? [:]
        let people = s.members.filter { tokens[$0.id] != nil }
        return PassPhoneView(names: people.map(\.name), tint: tint, seen: $passSeen) { name in
            guard let m = people.first(where: { $0.name == name }), let t = tokens[m.id] else {
                throw APIError(code: "no_link", message: "\(name) heeft een eigen link.")
            }
            let me = try await api.me(t)
            guard let r = me.receiver else { throw APIError(code: "not_drawn", message: "Er is nog niet getrokken.") }
            return r.name
        }
    }

    // MARK: Actions

    private func load() async {
        if let preview { status = preview; return }
        guard let token = saved?.adminToken else { loadError = "Deze groep is niet van jou."; return }
        do {
            let s = try await api.adminStatus(token)
            status = s
            loadError = nil
            store.update(groupId) { $0.name = s.group.name; $0.eventDate = s.group.eventDate }
        } catch let e as APIError where e.code == "auth" {
            loadError = e.message
        } catch {
            if status == nil { loadError = error.localizedDescription } else { toast = ToastData(message: error.localizedDescription) }
        }
    }

    private func add() async {
        let n = newName.trimmed
        guard !n.isEmpty, let token = saved?.adminToken else { return }
        do {
            let m = try await api.addMember(token, name: n)
            store.update(groupId) { $0.memberTokens[m.id] = m.token }
            newName = ""
            Haptics.tap()
            addFocus = true
            await load()
        } catch {
            Haptics.warning()
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func remove(_ m: AdminMember) async {
        guard let token = saved?.adminToken else { return }
        do {
            status = try await api.removeMember(token, memberId: m.id)
            store.update(groupId) { $0.memberTokens[m.id] = nil }
            undo = { Task { newName = m.name; await add() } }
            toast = ToastData(message: "\(m.name) weggehaald", undoTitle: "Ongedaan maken")
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func setRules(_ pairs: [[String]]) async {
        guard let token = saved?.adminToken else { return }
        do {
            status = try await api.setExclusions(token, pairs)
            Haptics.success()
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func draw(redraw: Bool) async {
        guard let token = saved?.adminToken else { return }
        busy = true
        defer { busy = false }
        do {
            let s = try await api.draw(token, redraw: redraw)
            withAnimation(.spring) {
                status = s
                justDrawn = true
            }
            passSeen = []
            Haptics.success()
        } catch {
            Haptics.warning()
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func renew(_ m: AdminMember) async {
        guard let token = saved?.adminToken else { return }
        do {
            let link = try await api.renewMemberLink(token, memberId: m.id)
            store.update(groupId) { $0.memberTokens[link.id] = link.token }
            toast = ToastData(message: "Nieuwe link voor \(m.name). De oude werkt niet meer.")
            await load()
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func nextYear() async {
        guard let token = saved?.adminToken, let s = status else { return }
        do {
            let created = try await api.nextYear(token, eventDate: s.group.occasion.defaultDate())
            let g = store.saveCreated(created)
            Reminders.schedule(for: g)
            Haptics.success()
            router.path = [.organizer(g.id)]
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func deleteGroup() async {
        guard let token = saved?.adminToken else { return }
        do {
            try await api.deleteGroup(token)
            _ = store.remove(groupId)
            Reminders.cancel(groupId: groupId)
            dismiss()
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }
}

private struct MemberStatusRow: View {
    let member: AdminMember
    let tint: Color
    let token: String?
    let send: (String) -> Void
    let renew: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            InitialsBadge(name: member.name, size: 36, tint: tint)
            VStack(alignment: .leading, spacing: 3) {
                Text(member.name + (member.isOrganizer ? " (jij)" : "")).font(.body.weight(.medium))
                HStack(spacing: 8) {
                    StatusPill(done: member.openedAt != nil, on: "Bekeken", off: member.linkSentAt != nil ? "Verstuurd" : "Nog niet verstuurd")
                    if member.hasWishlist { StatusPill(done: true, on: "Lijstje", off: "") }
                    if member.giftReady { StatusPill(done: true, on: "Cadeau klaar", off: "") }
                }
            }
            Spacer()
            if member.isOrganizer {
                EmptyView()
            } else if let token {
                Menu {
                    Button { send(token) } label: { Label("Stuur link", systemImage: "paperplane") }
                    Button(role: .destructive, action: renew) { Label("Nieuwe link maken", systemImage: "arrow.clockwise") }
                } label: {
                    Text(member.linkSentAt == nil ? "Stuur" : "Nogmaals")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 40)
                        .foregroundStyle(member.linkSentAt == nil ? .white : tint)
                        .background(member.linkSentAt == nil ? tint : tint.opacity(0.12), in: Capsule())
                } primaryAction: {
                    Haptics.tap()
                    send(token)
                }
            } else if member.joinedSelf {
                Text("Eigen link").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct StatusPill: View {
    let on: Bool
    let onText: String
    let offText: String
    init(done: Bool, on onText: String, off offText: String) {
        self.on = done; self.onText = onText; self.offText = offText
    }
    var body: some View {
        if on || !offText.isEmpty {
            HStack(spacing: 3) {
                if on { Image(systemName: "checkmark") }
                Text(on ? onText : offText)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(on ? Color.green : Color.secondary)
        }
    }
}

/// Goal-gradient checklist: shows how far the group is and what's next.
private struct ProgressChecklist: View {
    let status: AdminStatus
    let tint: Color

    var body: some View {
        let n = status.members.count
        let opened = status.members.filter { $0.openedAt != nil }.count
        let wish = status.members.filter(\.hasWishlist).count
        let ready = status.members.filter(\.giftReady).count
        let drawn = status.group.isDrawn
        VStack(alignment: .leading, spacing: 10) {
            Row(done: n >= 3, title: n >= 3 ? "\(n) deelnemers" : "Minstens 3 deelnemers (\(n) nu)")
            Row(done: drawn, title: "Lootjes getrokken")
            Row(done: drawn && opened == n, title: drawn ? "\(opened) van \(n) hebben hun lootje bekeken" : "Iedereen bekijkt zijn lootje")
            if drawn {
                Row(done: wish == n, title: "\(wish) van \(n) hebben een verlanglijstje")
                Row(done: ready == n, title: "\(ready) van \(n) hebben hun cadeau klaar")
            }
        }
        .card()
    }

    private struct Row: View {
        let done: Bool
        let title: String
        var body: some View {
            HStack(spacing: 10) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(done ? Color.green : Color.secondary)
                Text(title).font(.subheadline).foregroundStyle(done ? .secondary : .primary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityValue(done ? "klaar" : "nog niet")
        }
    }
}

private struct RulesSheet: View {
    let status: AdminStatus
    let tint: Color
    let save: ([[String]]) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var pairs: [NamePair] = []
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ExclusionsStep(names: status.members.map(\.name), exclusions: $pairs, tint: tint)
                .background(Theme.paper.ignoresSafeArea())
                .navigationTitle("Regels")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Bewaar") {
                            Task {
                                busy = true
                                let ids = Dictionary(status.members.map { ($0.name, $0.id) }, uniquingKeysWith: { a, _ in a })
                                await save(pairs.compactMap { p in
                                    guard let a = ids[p.a], let b = ids[p.b] else { return nil }
                                    return [a, b]
                                })
                                busy = false
                                dismiss()
                            }
                        }
                        .disabled(busy)
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if status.group.isDrawn {
                        Text("Er is al getrokken. Nieuwe regels gelden pas als je opnieuw trekt.")
                            .font(.footnote).foregroundStyle(.secondary).padding()
                    }
                }
        }
        .onAppear {
            let names = Dictionary(status.members.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
            pairs = status.exclusions.compactMap { p in
                guard p.count == 2, let a = names[p[0]], let b = names[p[1]] else { return nil }
                return NamePair(a, b)
            }
        }
    }
}

private struct EditGroupSheet: View {
    let group: GroupInfo
    let adminToken: String
    let onSaved: (AdminStatus) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var hasDate = false
    @State private var date = Date()
    @State private var budget: Int?
    @State private var note = ""
    @State private var joinOpen = true
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Naam") { TextField("Naam", text: $name) }
                Section {
                    Toggle("Datum", isOn: $hasDate.animation())
                    if hasDate {
                        DatePicker("Datum", selection: $date, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "nl_NL"))
                    }
                }
                Section("Budget per cadeau") { BudgetChips(budget: $budget, tint: Theme.accent(for: group.occasion)) }
                Section("Bericht voor iedereen") {
                    TextField("Bericht", text: $note, axis: .vertical).lineLimit(2...5)
                }
                if !group.isDrawn {
                    Section {
                        Toggle("Aanmelden via link staat open", isOn: $joinOpen)
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Groep aanpassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Bewaar") { Task { await save() } }.disabled(busy || name.trimmed.isEmpty)
                }
            }
        }
        .onAppear {
            name = group.name
            if let d = group.date { hasDate = true; date = d }
            budget = group.budgetCents
            note = group.note ?? ""
            joinOpen = group.joinOpen
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let s = try await API().updateGroup(adminToken, fields: [
                "name": name.trimmed,
                "eventDate": hasDate ? DayFormat.string(date) as Any : NSNull() as Any,
                "budgetCents": budget.map { $0 as Any } ?? (NSNull() as Any),
                "note": note.trimmed.isEmpty ? NSNull() as Any : note.trimmed as Any,
                "joinOpen": joinOpen,
            ])
            onSaved(s)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
