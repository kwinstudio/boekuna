import Foundation

enum AppConfig {
    /// Edge function endpoint (filled in when the backend is deployed).
    static let apiURL = URL(string: "https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/lootjes")!
    /// Web pages for people without the app (join + personal lootje page).
    static let webBase = URL(string: "https://lootjes-zichtwerf.vercel.app")!
    static let privacyURL = URL(string: "https://lootjes-zichtwerf.vercel.app/privacy")!
    static let supportEmail = "k.phetmanee@gmail.com"

    static func joinURL(code: String) -> URL { webBase.appending(path: "j/\(code)") }
    static func memberURL(token: String) -> URL { webBase.appending(path: "m/\(token)") }
}

enum Occasion: String, Codable, CaseIterable, Identifiable {
    case sinterklaas, kerst, anders
    var id: String { rawValue }

    var title: String {
        switch self {
        case .sinterklaas: "Sinterklaas"
        case .kerst: "Kerst"
        case .anders: "Iets anders"
        }
    }
    var symbol: String {
        switch self {
        case .sinterklaas: "gift.fill"
        case .kerst: "tree.fill"
        case .anders: "party.popper.fill"
        }
    }
    /// What the evening is called, used in countdowns.
    var eventWord: String {
        switch self {
        case .sinterklaas: "pakjesavond"
        case .kerst: "kerst"
        case .anders: "het feest"
        }
    }
    /// The person who buys your gift.
    var giverWord: String { self == .sinterklaas ? "Sint" : "Secret Santa" }

    /// Sensible default date: 5 Dec / 25 Dec of this season, else none.
    func defaultDate(now: Date = .now, calendar: Calendar = .current) -> Date? {
        let day: Int
        switch self {
        case .sinterklaas: day = 5
        case .kerst: day = 25
        case .anders: return nil
        }
        var year = calendar.component(.year, from: now)
        let month = calendar.component(.month, from: now)
        let today = calendar.component(.day, from: now)
        if month == 12 && today > day { year += 1 }
        return calendar.date(from: DateComponents(year: year, month: 12, day: day))
    }

    func defaultName(now: Date = .now) -> String {
        let year = Calendar.current.component(.year, from: defaultDate(now: now) ?? now)
        switch self {
        case .sinterklaas: return "Sinterklaas \(year)"
        case .kerst: return "Kerst \(year)"
        case .anders: return "Lootjes \(year)"
        }
    }
}

// MARK: - API types

struct GroupInfo: Codable, Equatable {
    let id: String
    let joinCode: String
    var name: String
    var occasion: Occasion
    var eventDate: String?
    var budgetCents: Int?
    var note: String?
    var poems: Bool
    var joinOpen: Bool
    var drawnAt: String?

    var isDrawn: Bool { drawnAt != nil }
    var date: Date? { eventDate.flatMap(DayFormat.parse) }
}

struct MemberLink: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let token: String
    let isOrganizer: Bool
}

struct CreatedGroup: Codable {
    let adminToken: String
    let group: GroupInfo
    let members: [MemberLink]
}

struct AdminMember: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let isOrganizer: Bool
    let joinedSelf: Bool
    let hasWishlist: Bool
    let linkSentAt: String?
    let openedAt: String?
    let lastSeenAt: String?
    let giftReady: Bool
}

struct AdminStatus: Codable, Equatable {
    var group: GroupInfo
    var members: [AdminMember]
    var exclusions: [[String]]
    var repeatedLastYear: Bool?
}

struct Receiver: Codable, Equatable {
    let id: String
    let name: String
    let wishlist: String
    let wishlistUpdatedAt: String?
}

struct ChatMessage: Codable, Equatable, Identifiable {
    enum Thread: String, Codable { case myLootje, mySint }
    let id: String
    let thread: Thread
    let fromMe: Bool
    let body: String
    let createdAt: String
}

struct MeInfo: Codable, Equatable {
    let id: String
    let name: String
    var wishlist: String
    let isOrganizer: Bool
    let openedBefore: String?
}

struct MeResponse: Codable, Equatable {
    var group: GroupInfo
    var me: MeInfo
    var memberNames: [String]
    var receiver: Receiver?
    var giftReady: Bool
    var messages: [ChatMessage]
}

struct JoinPreview: Codable, Equatable {
    let group: GroupInfo
    let memberNames: [String]
}

struct JoinResult: Codable {
    struct M: Codable { let id: String; let name: String }
    let token: String
    let member: M
}

struct AddedMember: Codable { let member: MemberLink }
struct OK: Codable { let ok: Bool? }

// MARK: - Local

/// What this device remembers about a group. Tokens are secrets and live in the Keychain.
struct SavedGroup: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var occasion: Occasion
    var eventDate: String?
    var adminToken: String?
    var myToken: String?
    var myName: String?
    /// Organizer only: personal links to hand out.
    var memberTokens: [String: String] = [:]
    var addedAt: Date = .now

    var isOrganizer: Bool { adminToken != nil }
    var date: Date? { eventDate.flatMap(DayFormat.parse) }
}

/// A quick offline draw: everyone is in the same room and passes the phone around.
struct QuickDraw: Codable, Equatable, Identifiable {
    var id = UUID()
    var name: String
    var occasion: Occasion
    var people: [String]
    var pairs: [String: String] // giver -> receiver
    var exclusions: [[String]] = []
    var seen: Set<String> = []
    var createdAt: Date = .now
}

enum DayFormat {
    private static let f: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static func parse(_ s: String) -> Date? { f.date(from: s) }
    static func string(_ d: Date) -> String { f.string(from: d) }

    static func long(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "nl_NL")))
    }

    /// "nog 35 dagen", "morgen", "vandaag", or nil when past.
    static func countdown(to date: Date, now: Date = .now, calendar: Calendar = .current) -> String? {
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
        switch days {
        case ..<0: return nil
        case 0: return "vandaag"
        case 1: return "morgen"
        default: return "nog \(days) dagen"
        }
    }
}

/// Recognises lootjes links and codes, pasted or opened.
enum LinkParser {
    enum Target: Equatable {
        case join(code: String)
        case member(token: String)
    }

    static func parse(_ raw: String) -> Target? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: text), let target = parse(url) { return target }
        // Bare code like "K7M2QX9" (case and spaces don't matter).
        let code = text.uppercased().filter { $0.isLetter || $0.isNumber }
        if code.count == 7, text.count <= 12 { return .join(code: code) }
        // A link inside a WhatsApp message.
        if let range = text.range(of: #"(https?|lootjes)://\S+"#, options: .regularExpression),
           let url = URL(string: String(text[range])) {
            return parse(url)
        }
        return nil
    }

    static func parse(_ url: URL) -> Target? {
        var parts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "lootjes", let host = url.host() { parts.insert(host, at: 0) }
        guard parts.count >= 2 else { return nil }
        let value = parts[1]
        switch parts[0] {
        case "j":
            let code = value.uppercased().filter { $0.isLetter || $0.isNumber }
            return code.count == 7 ? .join(code: code) : nil
        case "m":
            return value.count >= 20 ? .member(token: value) : nil
        default:
            return nil
        }
    }
}
