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
            .navigationBarTitleDisplayMode(.large)
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
                                    .foregroundStyle(Theme.red)
                                    .frame(width: 40, height: 40)
                                    .background(Theme.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(q.name).font(.body.weight(.medium))
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
            Section("Meer") {
                ActionRow(icon: "envelope.open", title: "Ik heb een uitnodiging", subtitle: "Meedoen met een code of link") { router.sheet = .join(code: nil) }
                ActionRow(icon: "person.3", title: "Iedereen is hier", subtitle: "Trekken op deze telefoon, zonder internet") { router.sheet = .quickDraw }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .bottomBar {
            PrimaryButton(title: "Nieuwe trekking", systemImage: "plus") { router.sheet = .create }
        }
    }
}

private struct GroupRow: View {
    let group: SavedGroup

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: group.occasion.symbol)
                .font(.title3)
                .foregroundStyle(Theme.red)
                .frame(width: 40, height: 40)
                .background(Theme.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name).font(.body.weight(.medium))
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
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Lootjes trekken voor Sinterklaas of Kerst")
                        .font(.title3.weight(.semibold))
                    Text("Iedereen ontvangt zijn lootje op de eigen telefoon, ook zonder app. Niemand kan zien wie wie heeft, ook de organisator niet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
            Section("Wat wil je doen?") {
                ActionRow(icon: "plus.circle", title: "Nieuwe trekking", subtitle: "Groep maken en mensen uitnodigen") { router.sheet = .create }
                ActionRow(icon: "envelope.open", title: "Ik heb een uitnodiging", subtitle: "Meedoen met een code of link") { router.sheet = .join(code: nil) }
                ActionRow(icon: "person.3", title: "Iedereen is hier", subtitle: "Trekken op deze telefoon, zonder internet") { router.sheet = .quickDraw }
            }
            Section {
                InfoRow(icon: "lock", text: "Geen account of wachtwoord nodig")
                InfoRow(icon: "list.bullet.rectangle", text: "Verlanglijstjes en anonieme vragen")
                InfoRow(icon: "person.2.slash", text: "Partners trekken elkaar niet")
                InfoRow(icon: "eurosign.circle", text: "Gratis en zonder advertenties")
            } header: {
                Text("Zo werkt het")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

private struct ActionRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(Theme.red)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(.primary)
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct InfoRow: View {
    let icon: String
    let text: String
    var body: some View {
        Label {
            Text(text).font(.subheadline)
        } icon: {
            Image(systemName: icon).foregroundStyle(.secondary)
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
