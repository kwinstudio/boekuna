import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: Store
    @EnvironmentObject private var router: Router
    @State private var toast: ToastData?
    @State private var undo: (() -> Void)?
    @State private var showSettings = false

    var body: some View {
        NavigationStack(path: $router.path) {
            Group {
                if store.groups.isEmpty && store.quickDraws.isEmpty {
                    EmptyHome()
                } else {
                    list
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Lootjes")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Instellingen")
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .organizer(let id): OrganizerView(groupId: id)
                case .member(let id): MemberView(groupId: id)
                case .quick(let id): QuickDrawView(drawId: id)
                }
            }
        }
        .sheet(item: $router.sheet) { sheet in
            switch sheet {
            case .create:
                CreateFlowView { saved in
                    router.sheet = nil
                    router.path = [.organizer(saved.id)]
                }
            case .quickDraw:
                QuickDrawSetupView { draw in
                    router.sheet = nil
                    router.path = [.quick(draw.id)]
                }
            case .join(let code):
                JoinView(initialCode: code) { saved in
                    router.sheet = nil
                    router.path = [.member(saved.id)]
                }
            case .openMember(let token):
                OpenMemberLinkView(token: token) { saved in
                    router.sheet = nil
                    router.path = [saved.isOrganizer ? .organizer(saved.id) : .member(saved.id)]
                }
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .toast($toast) { undo?() }
    }

    private var list: some View {
        List {
            if !store.groups.isEmpty {
                Section {
                    ForEach(store.sortedGroups) { g in
                        Button {
                            Haptics.tap()
                            router.path.append(g.isOrganizer ? .organizer(g.id) : .member(g.id))
                        } label: {
                            GroupRow(group: g)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Theme.card)
                        .swipeActions {
                            Button(role: .destructive) {
                                if let removed = store.remove(g.id) {
                                    undo = { store.upsert(removed) }
                                    toast = ToastData(message: "\(removed.name) verwijderd van deze telefoon", undoTitle: "Ongedaan maken")
                                }
                            } label: { Label("Verwijder", systemImage: "trash") }
                        }
                    }
                } header: {
                    Text("Je groepen")
                }
            }
            if !store.quickDraws.isEmpty {
                Section {
                    ForEach(store.quickDraws) { q in
                        Button {
                            Haptics.tap()
                            router.path.append(.quick(q.id))
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: "iphone.gen3")
                                    .font(.title3)
                                    .foregroundStyle(Theme.accent(for: q.occasion))
                                    .frame(width: 44, height: 44)
                                    .background(Theme.accent(for: q.occasion).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(q.name).font(.headline)
                                    Text("\(q.seen.count) van \(q.people.count) hebben gekeken")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                            }
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Theme.card)
                        .swipeActions {
                            Button(role: .destructive) {
                                if let removed = store.removeQuick(q.id) {
                                    undo = { store.upsertQuick(removed) }
                                    toast = ToastData(message: "\(removed.name) verwijderd", undoTitle: "Ongedaan maken")
                                }
                            } label: { Label("Verwijder", systemImage: "trash") }
                        }
                    }
                } header: {
                    Text("Snel getrokken op deze telefoon")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .bottomBar {
            PrimaryButton(title: "Nieuwe trekking", systemImage: "plus") { router.sheet = .create }
            HStack(spacing: 10) {
                SecondaryButton(title: "Uitnodiging", systemImage: "envelope.open") { router.sheet = .join(code: nil) }
                SecondaryButton(title: "Iedereen is hier", systemImage: "person.3") { router.sheet = .quickDraw }
            }
        }
    }
}

private struct GroupRow: View {
    let group: SavedGroup

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: group.occasion.symbol)
                .font(.title3)
                .foregroundStyle(Theme.accent(for: group.occasion))
                .frame(width: 44, height: 44)
                .background(Theme.accent(for: group.occasion).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name).font(.headline)
                HStack(spacing: 6) {
                    Text(group.isOrganizer ? "Organisator" : "Deelnemer")
                    if let date = group.date, let c = DayFormat.countdown(to: date) {
                        Text("·")
                        Text("\(group.occasion.eventWord.capitalizedFirst) \(c)")
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

private struct EmptyHome: View {
    @EnvironmentObject private var router: Router

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                LootjeIllustration()
                    .frame(height: 190)
                    .padding(.top, 24)
                VStack(spacing: 10) {
                    Text("Lootjes trekken,\nzonder gedoe")
                        .font(.system(.largeTitle, design: .rounded).weight(.bold))
                        .multilineTextAlignment(.center)
                    Text("Iedereen krijgt zijn lootje op zijn eigen telefoon, ook zonder app. Niemand ziet wie wie heeft. Ook jij niet.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                VStack(alignment: .leading, spacing: 14) {
                    Benefit(icon: "lock.fill", text: "Geen account, geen wachtwoord")
                    Benefit(icon: "heart.text.square.fill", text: "Verlanglijstjes en anonieme vragen aan je lootje")
                    Benefit(icon: "person.2.slash.fill", text: "Partners trekken elkaar niet, vorig jaar wordt vermeden")
                    Benefit(icon: "eurosign.circle.fill", text: "Helemaal gratis, zonder reclame")
                }
                .card()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .bottomBar {
            PrimaryButton(title: "Nieuwe trekking", systemImage: "plus") { router.sheet = .create }
            HStack(spacing: 10) {
                SecondaryButton(title: "Uitnodiging", systemImage: "envelope.open") { router.sheet = .join(code: nil) }
                SecondaryButton(title: "Iedereen is hier", systemImage: "person.3") { router.sheet = .quickDraw }
            }
        }
    }
}

private struct Benefit: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Theme.red)
                .frame(width: 28)
            Text(text).font(.subheadline.weight(.medium))
        }
    }
}

/// Folded paper lootjes in a hat-like bowl, drawn with shapes (no image assets needed).
struct LootjeIllustration: View {
    @State private var float = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.red.opacity(0.1))
                .frame(width: 180, height: 180)
            ForEach(0..<3) { i in
                Slip(label: ["?", "★", "♥"][i])
                    .rotationEffect(.degrees([-18, 6, 22][i]))
                    .offset(x: CGFloat([-46, 0, 44][i]), y: CGFloat([6, -22, 10][i]) + (float ? -6 : 0))
                    .animation(reduceMotion ? nil : .easeInOut(duration: 2.2).repeatForever().delay(Double(i) * 0.3), value: float)
            }
        }
        .onAppear { float = true }
        .accessibilityHidden(true)
    }

    struct Slip: View {
        let label: String
        var body: some View {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.card)
                .frame(width: 70, height: 92)
                .overlay(
                    Text(label)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.red)
                )
                .overlay(alignment: .top) {
                    Rectangle().fill(Theme.gold).frame(height: 8)
                        .clipShape(.rect(topLeadingRadius: 8, topTrailingRadius: 8))
                }
                .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
