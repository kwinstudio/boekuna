import SwiftUI

@main
struct BoekunaApp: App {
    @UIApplicationDelegateAdaptor(BoekunaAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.light)
        }
    }
}
