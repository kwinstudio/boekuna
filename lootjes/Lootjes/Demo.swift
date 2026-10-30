import SwiftUI

/// Launch with `-demoScreen <name>` to show a screen with sample data, without network.
/// Used for automated simulator screenshots in CI and for App Store screenshots.
enum Demo {
    static var screen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-demoScreen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static let names = ["Kwin", "Sanne", "Daan", "Oma Riet", "Lotte", "Bram", "Noor"]

    static func member(_ i: Int, opened: Bool, wish: Bool, ready: Bool = false, sent: Bool = true) -> AdminMember {
        AdminMember(id: "m\(i)", name: names[i], isOrganizer: i == 0, joinedSelf: i == 6,
                    hasWishlist: wish, linkSentAt: sent ? "2026-11-10T19:00:00Z" : nil,
                    openedAt: opened ? "2026-11-10T19:05:00Z" : nil, lastSeenAt: nil, giftReady: ready)
    }

    static let group = GroupInfo(id: "demo", joinCode: "K7M2QX9", name: "Familie Sinterklaas", occasion: .sinterklaas,
                                 eventDate: "2026-12-05", budgetCents: 2500, note: "We vieren het bij oma. Neem iets lekkers mee!",
                                 poems: true, joinOpen: false, drawnAt: "2026-11-10T18:55:00Z")

    static var organizerStatus: AdminStatus {
        AdminStatus(group: group, members: [
            member(0, opened: true, wish: true, ready: true), member(1, opened: true, wish: true),
            member(2, opened: true, wish: false), member(3, opened: false, wish: false, sent: true),
            member(4, opened: true, wish: true, ready: true), member(5, opened: false, wish: false, sent: false),
            member(6, opened: true, wish: true),
        ], exclusions: [["m1", "m2"]], repeatedLastYear: nil)
    }

    static var beforeDraw: AdminStatus {
        var g = group
        g.drawnAt = nil
        g.joinOpen = true
        return AdminStatus(group: g, members: (0..<6).map { member($0, opened: false, wish: false, sent: false) },
                           exclusions: [["m1", "m2"]], repeatedLastYear: nil)
    }

    static var me: MeResponse {
        MeResponse(group: group,
                   me: MeInfo(id: "m0", name: "Kwin", wishlist: "- Een goed boek (thriller)\n- Warme sokken maat 43", isOrganizer: true, openedBefore: nil),
                   memberNames: names,
                   receiver: Receiver(id: "m3", name: "Oma Riet",
                                      wishlist: "- Een mooie plant voor in de vensterbank\n- Puzzel van 1000 stukjes\n- Iets lekkers, maar geen drop\nhttps://www.bol.com",
                                      wishlistUpdatedAt: "2026-11-12T10:00:00Z"),
                   giftReady: false,
                   messages: [
                       ChatMessage(id: "1", thread: .myLootje, fromMe: true, body: "Hou je meer van rood of groen?", createdAt: "2026-11-12T10:00:00Z"),
                       ChatMessage(id: "2", thread: .myLootje, fromMe: false, body: "Groen! Net als mijn tuin 🌿", createdAt: "2026-11-12T11:00:00Z"),
                       ChatMessage(id: "3", thread: .mySint, fromMe: false, body: "Welke schoenmaat heb je?", createdAt: "2026-11-13T09:00:00Z"),
                   ])
    }

    @MainActor
    static func store() -> Store {
        let s = Store(keychain: KeychainBox(account: "demo-\(UUID().uuidString)", synchronizable: false),
                      defaults: UserDefaults(suiteName: "demo") ?? .standard)
        s.upsert(SavedGroup(id: "demo", name: group.name, occasion: .sinterklaas, eventDate: group.eventDate,
                            adminToken: "demo-admin-token-000000000000", myToken: "demo-member-token-0000000000", myName: "Kwin",
                            memberTokens: Dictionary(uniqueKeysWithValues: (0..<6).map { ("m\($0)", "demo-token-\($0)-00000000000000") })))
        s.upsert(SavedGroup(id: "demo2", name: "Kerst met vrienden", occasion: .kerst, eventDate: "2026-12-24", myToken: "x-000000000000000000000", myName: "Kwin"))
        return s
    }
}

struct DemoRoot: View {
    let screen: String
    @StateObject private var store = Demo.store()
    @StateObject private var router = Router()

    var body: some View {
        Group {
            switch screen {
            case "home":
                HomeView()
            case "create":
                CreateFlowView { _ in }
            case "organizer":
                NavigationStack { OrganizerView(groupId: "demo", preview: Demo.organizerStatus) }
            case "before":
                NavigationStack { OrganizerView(groupId: "demo", preview: Demo.beforeDraw) }
            case "scratch":
                NavigationStack { MemberView(groupId: "demo", preview: Demo.me, previewRevealed: false) }
            case "member":
                NavigationStack { MemberView(groupId: "demo", preview: Demo.me) }
            case "poem":
                PoemHelperView(receiverName: "Oma Riet", wishlist: "Een mooie plant", tint: Theme.red)
            case "pass":
                PassPhoneView(names: Demo.names, seen: .constant(["Kwin", "Sanne", "Daan"])) { _ in "Lotte" }
            default:
                Text("Onbekend demoscherm \(screen)")
            }
        }
        .environmentObject(store)
        .environmentObject(router)
        .tint(Theme.red)
    }
}
