import SwiftUI
import UIKit
import UserNotifications

@main struct FotoswipeApp: App {
    @StateObject private var library = PhotoLibrary()
    init() { UNUserNotificationCenter.current().delegate = Reminders.shared }
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


/// Local daily reminder at a time the user picked (an implementation intention: "after dinner I swipe").
/// Scheduled on the device only; at most one per day, skipped once the day is done.
@MainActor final class Reminders: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = Reminders()
    @Published var openOnThisDay = false
    @Published private(set) var enabled: Bool
    @Published private(set) var hour: Int
    @Published private(set) var minute: Int
    @Published private(set) var denied = false
    private static let count = 7

    override init() {
        let defaults = UserDefaults.standard
        enabled = defaults.bool(forKey: "fotoswipe.reminder.on")
        hour = defaults.object(forKey: "fotoswipe.reminder.hour") as? Int ?? 20
        minute = defaults.object(forKey: "fotoswipe.reminder.minute") as? Int ?? 0
        super.init()
    }

    var time: Date {
        Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
    }
    var timeText: String { String(format: "%02d:%02d", hour, minute) }

    /// Asks permission only at the moment the user turns the reminder on.
    func setEnabled(_ on: Bool, then reschedule: @escaping () -> Void) {
        guard on else {
            enabled = false
            save()
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: Self.ids)
            return
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            Task { @MainActor in
                let reminders = Reminders.shared
                reminders.denied = !granted
                reminders.enabled = granted
                reminders.save()
                if granted { reschedule() }
            }
        }
    }
    func setTime(_ date: Date, then reschedule: () -> Void) {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        hour = parts.hour ?? 20
        minute = parts.minute ?? 0
        save()
        if enabled { reschedule() }
    }
    func schedule(_ items: [(Date, String)]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: Self.ids)
        guard enabled else { return }
        for (index, item) in items.prefix(Self.count).enumerated() {
            let content = UNMutableNotificationContent()
            content.title = "Je 2 minuten staan klaar"
            content.body = item.1
            content.sound = .default
            content.userInfo = ["open": "on-this-day"]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.0)
            let request = UNNotificationRequest(identifier: Self.ids[index], content: content,
                                                trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
            center.add(request)
        }
    }
    private static var ids: [String] { (0..<count).map { "fotoswipe.reminder.\($0)" } }
    private func save() {
        let defaults = UserDefaults.standard
        defaults.set(enabled, forKey: "fotoswipe.reminder.on")
        defaults.set(hour, forKey: "fotoswipe.reminder.hour")
        defaults.set(minute, forKey: "fotoswipe.reminder.minute")
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        Task { @MainActor in Reminders.shared.openOnThisDay = true }
        completionHandler()
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }
}
