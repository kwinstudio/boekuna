import Foundation
import UserNotifications

/// Local reminders only (nothing leaves the phone): one week before and the day before.
enum Reminders {
    static var enabled: Bool {
        UserDefaults.standard.object(forKey: "reminders") as? Bool ?? true
    }

    static func plan(for group: SavedGroup, now: Date = .now, calendar: Calendar = .current) -> [(id: String, date: Date, title: String, body: String)] {
        guard let day = group.date else { return [] }
        let word = group.occasion.eventWord
        var out: [(id: String, date: Date, title: String, body: String)] = []
        func at(_ daysBefore: Int, hour: Int) -> Date? {
            guard let d = calendar.date(byAdding: .day, value: -daysBefore, to: calendar.startOfDay(for: day)) else { return nil }
            return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: d)
        }
        if let d = at(7, hour: 19), d > now {
            out.append(("\(group.id).week", d, "Nog een week tot \(word)",
                        "Heb je al een cadeau voor je lootje in \(group.name)? Kijk even op het verlanglijstje."))
        }
        if let d = at(1, hour: 19), d > now {
            let extra = group.occasion == .sinterklaas ? " Is je gedicht al af?" : ""
            out.append(("\(group.id).eve", d, "Morgen is het \(word)!", "Vergeet je cadeau voor \(group.name) niet.\(extra)"))
        }
        return out
    }

    static func schedule(for group: SavedGroup) {
        guard enabled else { return }
        let items = plan(for: group)
        guard !items.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            center.removePendingNotificationRequests(withIdentifiers: items.map(\.id))
            for item in items {
                let content = UNMutableNotificationContent()
                content.title = item.title
                content.body = item.body
                content.sound = .default
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.date)
                let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: trigger))
            }
        }
    }

    static func cancel(groupId: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["\(groupId).week", "\(groupId).eve"])
    }

    static func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }
}
