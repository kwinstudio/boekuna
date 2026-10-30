import SwiftUI

@main
struct LootjesApp: App {
    @StateObject private var store = Store()
    @StateObject private var router = Router()

    var body: some Scene {
        WindowGroup {
            if let screen = Demo.screen {
                DemoRoot(screen: screen)
            } else {
                HomeView()
                    .environmentObject(store)
                    .environmentObject(router)
                    .tint(Theme.red)
                    .onOpenURL { url in router.open(url) }
            }
        }
    }
}

enum Route: Hashable {
    case organizer(String)
    case member(String)
    case quick(UUID)
}

enum SheetRoute: Identifiable, Equatable {
    case create
    case quickDraw
    case join(code: String?)
    case openMember(token: String)
    var id: String {
        switch self {
        case .create: "create"
        case .quickDraw: "quick"
        case .join(let c): "join-\(c ?? "")"
        case .openMember(let t): "m-\(t)"
        }
    }
}

@MainActor
final class Router: ObservableObject {
    @Published var path: [Route] = []
    @Published var sheet: SheetRoute?

    func open(_ url: URL) {
        guard let target = LinkParser.parse(url) else { return }
        open(target)
    }

    func open(_ target: LinkParser.Target) {
        path = []
        switch target {
        case .join(let code): sheet = .join(code: code)
        case .member(let token): sheet = .openMember(token: token)
        }
    }
}
