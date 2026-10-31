import SwiftUI

/// A participant's own page: their lootje, the wishlist of who they drew,
/// their own wishlist, and two anonymous threads.
struct MemberView: View {
    let groupId: String
    /// Screenshot/demo mode: show this instead of loading.
    var preview: MeResponse? = nil
    var previewRevealed = true

    @EnvironmentObject private var store: Store
    private let api = API()

    @State private var data: MeResponse?
    @State private var loadError: String?
    @State private var revealedNow = false
    @State private var toast: ToastData?
    @State private var showWishlist = false
    @State private var showPoem = false
    @State private var chat: ChatMessage.Thread?
    @State private var confirmLeave = false
    @State private var warnOpened = false
    @AppStorage("revealed") private var revealedRaw = ""
    @Environment(\.dismiss) private var dismiss

    private var token: String? { store.group(groupId)?.myToken }
    private var tint: Color { Theme.accent(for: data?.group.occasion ?? store.group(groupId)?.occasion ?? .sinterklaas) }
    private var revealKey: String { "\(groupId):\(data?.group.drawnAt ?? "")" }
    private var hasRevealed: Bool { revealedRaw.split(separator: ",").contains(Substring(revealKey)) }

    var body: some View {
        Group {
            if let data {
                content(data)
            } else if let loadError {
                ContentUnavailableView {
                    Label("Kan je lootje niet laden", systemImage: "wifi.exclamationmark")
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
        .navigationTitle(data?.group.name ?? store.group(groupId)?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .toast($toast)
        .sheet(isPresented: $showWishlist) {
            if let data, let token {
                WishlistEditor(text: data.me.wishlist, budget: data.group.budgetCents, tint: tint) { text in
                    try await api.setWishlist(token, text)
                    self.data?.me.wishlist = text
                    Haptics.success()
                }
            }
        }
        .sheet(isPresented: $showPoem) {
            if let data, let r = data.receiver {
                PoemHelperView(receiverName: r.name, wishlist: r.wishlist, tint: tint)
            }
        }
        .sheet(item: $chat) { thread in
            if let data, let token {
                ChatView(thread: thread, data: data, tint: tint, token: token) { await load() }
            }
        }
        .confirmationDialog("Uit de groep stappen?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Stap uit de groep", role: .destructive) { Task { await leave() } }
        }
        .toolbar {
            if data?.group.isDrawn == false {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) { confirmLeave = true } label: { Label("Uit de groep stappen", systemImage: "rectangle.portrait.and.arrow.right") }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
    }

    private func content(_ d: MeResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let r = d.receiver {
                    lootje(d, r)
                } else {
                    waiting(d)
                }
                groupInfo(d)
            }
            .padding(20)
        }
    }

    // MARK: Not drawn yet

    private func waiting(_ d: MeResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Label("Je doet mee, \(d.me.name)!", systemImage: "checkmark.seal.fill")
                    .font(.headline).foregroundStyle(tint)
                Text("De lootjes worden nog getrokken. Je krijgt je lootje hier zodra het zover is.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            .card()
            myWishlistCard(d, nudge: true)
        }
    }

    // MARK: Drawn

    @ViewBuilder
    private func lootje(_ d: MeResponse, _ r: Receiver) -> some View {
        if !hasRevealed && !revealedNow {
            VStack(spacing: 14) {
                ScratchCard(receiverName: r.name, tint: tint, caption: "Jij trekt") {
                    markRevealed()
                }
                .frame(height: 280)
                if warnOpened && !d.me.isOrganizer {
                    Text("Deze link is al eerder geopend. Was jij dat niet? Vraag de organisator om een nieuwe link.")
                        .font(.footnote).foregroundStyle(.orange)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("Jij koopt een cadeau voor").font(.subheadline).foregroundStyle(.secondary)
                Text(r.name)
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .foregroundStyle(tint)
                    .privacySensitive()
                if let b = d.group.budgetCents {
                    Label("Budget \(b.euroText)", systemImage: "eurosign.circle").font(.subheadline)
                }
                Toggle(isOn: Binding(get: { d.giftReady }, set: { v in Task { await setReady(v) } })) {
                    Label("Cadeau is klaar", systemImage: "gift.fill")
                }
                .tint(.green)
                .frame(minHeight: 44)
            }
            .card()
            .transition(.scale.combined(with: .opacity))

            theirWishlist(d, r)

            HStack(spacing: 10) {
                ThreadButton(title: "Vraag \(r.name) iets", subtitle: "Anoniem", icon: "questionmark.bubble.fill",
                             count: unread(d, .myLootje), tint: tint) { openChat(d, .myLootje) }
                ThreadButton(title: "Je \(d.group.occasion.giverWord)", subtitle: "Vragen aan jou", icon: "theatermasks.fill",
                             count: unread(d, .mySint), tint: tint) { openChat(d, .mySint) }
            }

            if d.group.poems {
                Button {
                    Haptics.tap()
                    showPoem = true
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "pencil.and.scribble").font(.title2).foregroundStyle(tint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Gedicht schrijven").font(.headline)
                            Text("Een rijmhulp en een opzetje voor \(r.name)").font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                    }
                    .card()
                }
                .buttonStyle(PressableStyle())
            }

            myWishlistCard(d, nudge: false)
        }
    }

    private func theirWishlist(_ d: MeResponse, _ r: Receiver) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Verlanglijstje van \(r.name)").font(.headline)
            if r.wishlist.trimmed.isEmpty {
                Text("\(r.name) heeft nog niets ingevuld. Stel anoniem een vraag om een hint te krijgen.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text(Linkify.attributed(r.wishlist))
                    .font(.body)
                    .textSelection(.enabled)
                if let u = r.wishlistUpdatedAt, let date = ISO.parse(u) {
                    Text("Bijgewerkt \(date.formatted(.relative(presentation: .named).locale(Locale(identifier: "nl_NL"))))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .card()
    }

    private func myWishlistCard(_ d: MeResponse, nudge: Bool) -> some View {
        Button {
            Haptics.tap()
            showWishlist = true
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Mijn verlanglijstje").font(.headline)
                    Spacer()
                    Text(d.me.wishlist.trimmed.isEmpty ? "Invullen" : "Aanpassen")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(tint)
                }
                if d.me.wishlist.trimmed.isEmpty {
                    Text(nudge ? "Vul het alvast in. Dan weet je Sint meteen wat je leuk vindt." : "Je Sint ziet nog niets. Help hem op weg!")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    Text(d.me.wishlist).font(.subheadline).lineLimit(4).foregroundStyle(.primary)
                }
            }
            .card()
        }
        .buttonStyle(PressableStyle())
    }

    private func groupInfo(_ d: MeResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let date = d.group.date {
                Label {
                    Text(DayFormat.long(date) + (DayFormat.countdown(to: date).map { " · \($0)" } ?? ""))
                } icon: { Image(systemName: "calendar") }
            }
            if let note = d.group.note, !note.isEmpty {
                Label { Text(note) } icon: { Image(systemName: "text.bubble") }
            }
            Label {
                Text(d.memberNames.joined(separator: ", "))
            } icon: { Image(systemName: "person.3") }
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .card()
    }

    // MARK: Actions

    private func load() async {
        if let preview { data = preview; revealedNow = previewRevealed; return }
        guard let token else { loadError = "Deze link staat niet meer op deze telefoon."; return }
        do {
            let d = try await api.me(token)
            // Warn only when someone else opened this link before this phone ever did.
            let seenKey = "openedHere.\(groupId)"
            if !UserDefaults.standard.bool(forKey: seenKey) {
                warnOpened = d.me.openedBefore != nil && !store.groupJoinedHere(groupId)
                UserDefaults.standard.set(true, forKey: seenKey)
            }
            data = d
            loadError = nil
            store.update(groupId) { $0.name = d.group.name; $0.eventDate = d.group.eventDate; $0.myName = d.me.name }
        } catch {
            if data == nil { loadError = error.localizedDescription } else { toast = ToastData(message: error.localizedDescription) }
        }
    }

    private func received(_ d: MeResponse, _ t: ChatMessage.Thread) -> Int {
        d.messages.filter { $0.thread == t && !$0.fromMe }.count
    }

    private func seenKey(_ t: ChatMessage.Thread) -> String { "chatSeen.\(groupId).\(t.rawValue)" }

    private func unread(_ d: MeResponse, _ t: ChatMessage.Thread) -> Int {
        max(0, received(d, t) - UserDefaults.standard.integer(forKey: seenKey(t)))
    }

    private func openChat(_ d: MeResponse, _ t: ChatMessage.Thread) {
        UserDefaults.standard.set(received(d, t), forKey: seenKey(t))
        chat = t
    }

    private func markRevealed() {
        revealedRaw = (revealedRaw.split(separator: ",").map(String.init) + [revealKey]).joined(separator: ",")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { revealedNow = true }
        }
    }

    private func setReady(_ v: Bool) async {
        guard let token else { return }
        data?.giftReady = v
        if v { Haptics.success() }
        do { try await api.setGiftReady(token, v) } catch {
            data?.giftReady = !v
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func leave() async {
        guard let token else { return }
        do {
            try await api.leave(token)
            _ = store.remove(groupId)
            dismiss()
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }
}

extension ChatMessage.Thread: Identifiable { var id: String { rawValue } }

private struct ThreadButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let count: Int
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: icon).font(.title3).foregroundStyle(tint)
                    Spacer()
                    if count > 0 {
                        Text("\(count)").font(.caption.weight(.bold)).foregroundStyle(.white)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(tint, in: Capsule())
                    }
                }
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            .card()
        }
        .buttonStyle(PressableStyle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Wishlist

struct WishlistEditor: View {
    @State var text: String
    let budget: Int?
    let tint: Color
    let save: (String) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(budget.map { "Tip: zet er ideeën rond \($0.euroText) op. Links naar webshops werken ook." } ?? "Tip: zet er een paar ideeën op. Links naar webshops werken ook.")
                    .font(.subheadline).foregroundStyle(.secondary)
                TextEditor(text: $text)
                    .focused($focused)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text("Bijv.\n- Een goed boek (thriller)\n- Warme sokken maat 42\n- Iets lekkers, maar geen drop")
                                .foregroundStyle(.tertiary).padding(16).allowsHitTesting(false)
                        }
                    }
                Text("\(text.count)/2000").font(.caption).foregroundStyle(text.count > 2000 ? .red : .secondary)
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            .padding(20)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Mijn verlanglijstje")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Bewaar") {
                        Task {
                            busy = true
                            defer { busy = false }
                            do { try await save(text); dismiss() } catch { self.error = error.localizedDescription }
                        }
                    }
                    .disabled(busy || text.count > 2000)
                }
            }
            .onAppear { focused = true }
        }
    }
}

// MARK: - Chat

struct ChatView: View {
    let thread: ChatMessage.Thread
    let data: MeResponse
    let tint: Color
    let token: String
    let reload: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var sending = false
    @State private var local: [ChatMessage] = []
    @State private var error: String?

    private var otherName: String {
        thread == .myLootje ? (data.receiver?.name ?? "je lootje") : "je \(data.group.occasion.giverWord)"
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 10) {
                        Text(thread == .myLootje
                             ? "\(data.receiver?.name ?? "Je lootje") ziet niet wie deze vragen stelt."
                             : "Jouw \(data.group.occasion.giverWord) blijft geheim. Jij kunt gewoon antwoorden.")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            .padding(.vertical, 8)
                        if messages.isEmpty {
                            Text(thread == .myLootje ? "Stel bijvoorbeeld: \"Welke kleur vind je mooi?\"" : "Nog geen vragen van je \(data.group.occasion.giverWord).")
                                .font(.subheadline).foregroundStyle(.secondary).padding(.top, 30)
                        }
                        ForEach(messages) { m in
                            HStack {
                                if m.fromMe { Spacer(minLength: 50) }
                                Text(m.body)
                                    .padding(.horizontal, 14).padding(.vertical, 10)
                                    .foregroundStyle(m.fromMe ? .white : .primary)
                                    .background(m.fromMe ? tint : Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                if !m.fromMe { Spacer(minLength: 50) }
                            }
                            .id(m.id)
                            .accessibilityLabel((m.fromMe ? "Jij: " : "\(otherName.capitalizedFirst): ") + m.body)
                        }
                    }
                    .padding(16)
                }
                .onAppear { proxy.scrollTo(messages.last?.id, anchor: .bottom) }
                .onChange(of: messages.count) { _, _ in withAnimation { proxy.scrollTo(messages.last?.id, anchor: .bottom) } }
            }
            .background(Theme.paper.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 6) {
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                    HStack(alignment: .bottom, spacing: 8) {
                        TextField(thread == .myLootje ? "Vraag iets aan \(otherName)" : "Antwoord", text: $draft, axis: .vertical)
                            .lineLimit(1...4)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
                        Button {
                            Task { await send() }
                        } label: {
                            Image(systemName: "arrow.up.circle.fill").font(.system(size: 34)).foregroundStyle(tint)
                                .frame(width: 44, height: 44)
                        }
                        .disabled(draft.trimmed.isEmpty || sending)
                        .accessibilityLabel("Verstuur")
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.bar)
            }
            .navigationTitle(thread == .myLootje ? "Vraag aan \(otherName)" : "Je \(data.group.occasion.giverWord)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } } }
        }
        .onDisappear { Task { await reload() } }
    }

    private var messages: [ChatMessage] { data.messages.filter { $0.thread == thread } + local }

    private func send() async {
        let text = draft.trimmed
        guard !text.isEmpty else { return }
        sending = true
        defer { sending = false }
        do {
            try await API().sendMessage(token, thread: thread, body: text)
            local.append(ChatMessage(id: UUID().uuidString, thread: thread, fromMe: true, body: text, createdAt: ISO.now()))
            draft = ""
            error = nil
            Haptics.tap()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

enum ISO {
    static func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
    static func now() -> String { ISO8601DateFormatter().string(from: .now) }
}

/// Makes web links in a wishlist tappable.
enum Linkify {
    static func attributed(_ text: String) -> AttributedString {
        var out = AttributedString(text)
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return out }
        let ns = text as NSString
        for match in detector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url, let range = Range(match.range, in: text),
                  let lower = AttributedString.Index(range.lowerBound, within: out),
                  let upper = AttributedString.Index(range.upperBound, within: out) else { continue }
            out[lower..<upper].link = url
        }
        return out
    }
}
