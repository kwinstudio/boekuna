import Foundation

/// What the home screen widget shows. The app writes it; the widget only reads it.
/// Shared through an App Group on this iPhone only.
struct WidgetSnapshot: Codable, Equatable {
    var streak = 0
    var doneToday = false
    var swipedToday = 0
    var goal = 10
    var onThisDayCount = 0
    var hasPhoto = false
    var language = "en"
    var updated = Date()

    static let group = "group.nl.zichtwerfstudio.fotoswipe"
    static let key = "fotoswipe.widget"
    static let photoName = "on-this-day.jpg"
    static let deepLink = URL(string: "fotoswipe://on-this-day")!

    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }
    static var photoURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent(photoName)
    }
    static func load() -> WidgetSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
    func save() {
        if let data = try? JSONEncoder().encode(self) { Self.defaults?.set(data, forKey: Self.key) }
    }
}
