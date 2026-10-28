import SwiftUI

@main struct FotoswipeApp: App {
    @StateObject private var library = PhotoLibrary()
    var body: some Scene {
        WindowGroup { ContentView().environmentObject(library).preferredColorScheme(.light) }
    }
}

enum Palette {
    static let background = Color(red: 0.97, green: 0.97, blue: 0.94)
    static let ink = Color(red: 0.15, green: 0.20, blue: 0.12)
    static let sage = Color(red: 0.85, green: 0.91, blue: 0.73)
    static let muted = Color(red: 0.42, green: 0.48, blue: 0.37)
    static let coral = Color(red: 0.95, green: 0.86, blue: 0.83)
}
