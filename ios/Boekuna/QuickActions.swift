import Combine
import UIKit

/// Hold the Boekuna icon on the home screen: "Bon scannen" and "Factuur maken".
/// The shortcut items themselves live in Info.plist; this hands the chosen one to the web app.
final class QuickActionCenter: ObservableObject {
    static let shared = QuickActionCenter()
    @Published var pending: String?

    static func action(for item: UIApplicationShortcutItem) -> String? {
        switch item.type {
        case "nl.boekuna.app.scan": return "scan"
        case "nl.boekuna.app.invoice": return "invoice"
        default: return nil
        }
    }

    func handle(_ item: UIApplicationShortcutItem) -> Bool {
        guard let action = QuickActionCenter.action(for: item) else { return false }
        DispatchQueue.main.async { self.pending = action }
        return true
    }
}

final class BoekunaAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // Cold start from a quick action.
        if let item = options.shortcutItem { _ = QuickActionCenter.shared.handle(item) }
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = BoekunaSceneDelegate.self
        return configuration
    }
}

final class BoekunaSceneDelegate: NSObject, UIWindowSceneDelegate {
    // App already running in the background.
    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(QuickActionCenter.shared.handle(shortcutItem))
    }
}
