import SwiftUI
import UIKit

@main struct FotoswipeApp: App {
    @StateObject private var library = PhotoLibrary()
    var body: some Scene {
        WindowGroup { ContentView().environmentObject(library).preferredColorScheme(.light) }
    }
}

/// "Pop" palette. Every text/background pair used in the app meets WCAG AA (4.5:1 or better).
enum Palette {
    static let background = Color(hex: 0xFFF4E8)   // warm paper
    static let surface = Color.white
    static let ink = Color(hex: 0x1D1A2E)          // text, borders, hard shadows
    static let muted = Color(hex: 0x5E5A70)        // secondary text, 6.1:1 on background
    static let brand = Color(hex: 0x5B3DF5)        // violet; white text 6.1:1
    static let keep = Color(hex: 0x14785A)         // green; white text 5.4:1
    static let trash = Color(hex: 0xFF7A59)        // coral; ink text 6.6:1
    static let reward = Color(hex: 0xFFD43B)       // yellow; ink text 11.9:1
    static let track = Color(hex: 0xEADFD2)
    // Older names kept for views that still use them.
    static let sage = reward
    static let coral = trash
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Hard-edged Pop look: ink border plus an offset shadow without blur.
struct PopFrame: ViewModifier {
    var radius: CGFloat = 16
    var fill: Color = Palette.surface
    var shadow: CGFloat = 4
    func body(content: Content) -> some View {
        content
            .background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Palette.ink, lineWidth: 2))
            .background(RoundedRectangle(cornerRadius: radius).fill(Palette.ink).offset(x: shadow, y: shadow))
    }
}

extension View {
    func pop(radius: CGFloat = 16, fill: Color = Palette.surface, shadow: CGFloat = 4) -> some View {
        modifier(PopFrame(radius: radius, fill: fill, shadow: shadow))
    }
}

/// Sizes are estimates from resolution and duration, so they are always shown as "ca.".
enum ByteText {
    static func format(_ bytes: Int64) -> String {
        "ca. " + ByteCountFormatter.string(fromByteCount: max(0, bytes), countStyle: .file)
    }
}

/// Distinct, short haptics make each decision feel confirmed without looking.
enum Haptics {
    static func choice(_ choice: PhotoDecision) {
        switch choice {
        case .keep: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .trash: UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        case .later: UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        }
    }
    static func threshold() { UISelectionFeedbackGenerator().selectionChanged() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
