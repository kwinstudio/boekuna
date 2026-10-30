import Foundation

enum PhotoDecision: String, Codable { case keep, trash, later }
struct SwipeRecord: Codable, Equatable {
    let id: String
    let previous: PhotoDecision?
}

/// Persist identifiers and choices only, never photo bytes.
struct DecisionStore: Codable {
    private(set) var decisions: [String: PhotoDecision] = [:]
    private(set) var history: [SwipeRecord] = []

    mutating func decide(_ id: String, _ decision: PhotoDecision) {
        history.append(SwipeRecord(id: id, previous: decisions[id]))
        if history.count > 200 { history.removeFirst(history.count - 200) }
        decisions[id] = decision
    }
    @discardableResult mutating func undo(in ids: Set<String>? = nil) -> String? {
        guard let index = history.lastIndex(where: { ids?.contains($0.id) ?? true }) else { return nil }
        let last = history.remove(at: index)
        decisions[last.id] = last.previous
        return last.id
    }
    mutating func restore(_ id: String) {
        decisions.removeValue(forKey: id)
        history.removeAll { $0.id == id }
    }
    mutating func finishDeletion(_ ids: Set<String>) {
        decisions = decisions.filter { !ids.contains($0.key) }
        history.removeAll { ids.contains($0.id) }
    }
    mutating func resetKept(in ids: Set<String>? = nil) {
        let kept = Set(decisions.filter { $0.value == .keep && (ids?.contains($0.key) ?? true) }.map(\.key))
        decisions = decisions.filter { !kept.contains($0.key) }
        history.removeAll { kept.contains($0.id) }
    }
}

/// Moving through the library changes an index, never shifts/copies the library.
struct ReviewQueue<Element> {
    private var elements: [Element]
    private var position = 0
    init(_ elements: [Element] = []) { self.elements = elements }
    var remainingCount: Int { elements.count - position }
    var current: Element? { position < elements.count ? elements[position] : nil }
    func preview(limit: Int) -> ArraySlice<Element> {
        elements[position..<min(elements.count, position + max(0, limit))]
    }
    mutating func advance() { if position < elements.count { position += 1 } }
    mutating func replace(_ elements: [Element]) { self.elements = elements; position = 0 }
}

/// JSON encoding and atomic disk writes never run on the swipe/UI thread.
/// The serial queue preserves ordering even when the user swipes rapidly.
final class DecisionPersistence {
    private let url: URL
    private let queue = DispatchQueue(label: "nl.zichtwerfstudio.fotoswipe.persistence", qos: .utility)
    init(url: URL) { self.url = url }
    func save(_ snapshot: DecisionStore, completion: @escaping (Error?) -> Void) {
        queue.async { [url] in
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try JSONEncoder().encode(snapshot).write(to: url, options: .atomic)
                completion(nil)
            } catch { completion(error) }
        }
    }
    func flush(completion: @escaping () -> Void) { queue.async(execute: completion) }
}


/// Date filtering uses calendar intervals, including leap days and DST boundaries.
enum PhotoDateFilter: Equatable {
    case all
    case month(Date)
    case onThisDay
    func includes(_ date: Date?, now: Date = Date(), calendar: Calendar = .current) -> Bool {
        if case .all = self { return true }
        guard let date else { return false }
        switch self {
        case .all: return true
        case .month(let start):
            guard let interval = calendar.dateInterval(of: .month, for: start) else { return false }
            return date >= interval.start && date < interval.end
        case .onThisDay:
            let photo = calendar.dateComponents([.year, .month, .day], from: date)
            let today = calendar.dateComponents([.year, .month, .day], from: now)
            return photo.month == today.month && photo.day == today.day && (photo.year ?? Int.max) < (today.year ?? Int.min)
        }
    }
    static func monthStarts(in dates: [Date?], calendar: Calendar = .current) -> [Date] {
        Set(dates.compactMap { date in date.flatMap { calendar.dateInterval(of: .month, for: $0)?.start } }).sorted(by: >)
    }
    static func monthID(for date: Date, calendar: Calendar = .current) -> String {
        let start = calendar.dateInterval(of: .month, for: date)?.start ?? date
        return "month:\(start.timeIntervalSince1970)"
    }
}

enum PhotoOrder: String, CaseIterable, Identifiable {
    case newest, oldest, largest, random
    var id: String { rawValue }
    var title: String {
        switch self {
        case .newest: return String(localized: "Nieuwste eerst", bundle: .app)
        case .oldest: return String(localized: "Oudste eerst", bundle: .app)
        case .largest: return String(localized: "Grootste eerst", bundle: .app)
        case .random: return String(localized: "Willekeurige volgorde", bundle: .app)
        }
    }
}

/// Size estimate from public metadata only (no file reads, no private API).
/// Photos: about 0.3 byte per pixel (HEIC/JPEG), plus the short movie of a Live Photo.
/// Videos: about 0.6 byte per pixel per second (typical iPhone HEVC/H.264 bitrates).
enum SizeEstimate {
    static let livePhotoMovie = 1_500_000.0
    static func bytes(isVideo: Bool, pixelWidth: Int, pixelHeight: Int, duration: Double, isLive: Bool = false) -> Double {
        let pixels = Double(max(0, pixelWidth)) * Double(max(0, pixelHeight))
        if isVideo { return pixels * max(1, duration) * 0.6 }
        return pixels * 0.3 + (isLive ? livePhotoMovie : 0)
    }
}

/// One short, finishable session: progress toward a small goal keeps swiping fast.
struct ReviewSession: Equatable {
    static let sizes = [30, 50, 100]
    /// People asked for their own batch size; 100 is the default.
    static var size: Int {
        let stored = UserDefaults.standard.integer(forKey: "fotoswipe.sessionSize")
        return sizes.contains(stored) ? stored : 100
    }
    private(set) var kept: [String] = []
    private(set) var trashed: [String] = []
    private(set) var later: [String] = []
    private(set) var startedAt: Date?
    var count: Int { kept.count + trashed.count + later.count }
    var isComplete: Bool { count >= Self.size }
    var progress: Double { min(1, Double(count) / Double(Self.size)) }

    mutating func record(_ id: String, _ choice: PhotoDecision, now: Date = Date()) {
        if startedAt == nil { startedAt = now }
        remove(id)
        switch choice {
        case .keep: kept.append(id)
        case .trash: trashed.append(id)
        case .later: later.append(id)
        }
    }
    /// Undo removes the item from this session's tally.
    mutating func remove(_ id: String) {
        kept.removeAll { $0 == id }; trashed.removeAll { $0 == id }; later.removeAll { $0 == id }
    }
    func duration(now: Date = Date()) -> TimeInterval { startedAt.map { now.timeIntervalSince($0) } ?? 0 }
}

/// A forgiving daily streak: one missed day in between does not break it.
struct StreakStore: Codable, Equatable {
    static let dailyGoal = 10
    private(set) var activeDays: [String] = []
    private(set) var countDay = ""
    private(set) var countToday = 0
    var freedBytes: Int64 = 0

    static func key(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    /// Counts choices; a day becomes active at the daily goal or when a session is finished.
    mutating func recordChoice(now: Date = Date(), calendar: Calendar = .current) {
        let today = Self.key(now, calendar: calendar)
        if countDay != today { countDay = today; countToday = 0 }
        countToday += 1
        if countToday >= Self.dailyGoal { markActive(now, calendar: calendar) }
    }
    mutating func markActive(_ now: Date = Date(), calendar: Calendar = .current) {
        let today = Self.key(now, calendar: calendar)
        if activeDays.last != today { activeDays.append(today) }
        if activeDays.count > 400 { activeDays.removeFirst(activeDays.count - 400) }
    }
    func isActive(_ date: Date, calendar: Calendar = .current) -> Bool { activeDays.contains(Self.key(date, calendar: calendar)) }
    /// Longest run ever, with the same forgiving rule (one missed day in between is fine).
    func longest(calendar: Calendar = .current) -> Int {
        let days = activeDays.compactMap { key -> Date? in
            let parts = key.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        }.sorted()
        guard var previous = days.first else { return 0 }
        var best = 1, run = 1
        for day in days.dropFirst() {
            let gap = calendar.dateComponents([.day], from: previous, to: day).day ?? 0
            if gap == 0 { continue }
            run = gap <= 2 ? run + 1 : 1
            best = max(best, run)
            previous = day
        }
        return best
    }
    func current(now: Date = Date(), calendar: Calendar = .current) -> Int {
        let active = Set(activeDays)
        var day = calendar.startOfDay(for: now)
        // Today may still be in progress: start from yesterday when today is not active yet.
        if !active.contains(Self.key(day, calendar: calendar)) {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day) else { return 0 }
            day = yesterday
        }
        var streak = 0
        var misses = 0
        for _ in 0..<800 {
            if active.contains(Self.key(day, calendar: calendar)) { streak += 1; misses = 0 }
            else { misses += 1; if misses > 1 { break } }
            guard let previous = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = previous
        }
        return streak
    }
}

struct PhotoProgress {
    var total = 0
    var reviewed = 0
}


/// Membership is fixed until the user explicitly starts another random session.
struct RandomReviewSession {
    let limit: Int
    private var identifiers: [String]?
    init(limit: Int) { self.limit = max(0, limit) }
    mutating func restart() { identifiers = nil }
    mutating func select(candidates: [String], available: Set<String>) -> [String] {
        if identifiers == nil {
            var unique: [String] = []
            var seen = Set<String>()
            for id in candidates where seen.insert(id).inserted { unique.append(id) }
            identifiers = Array(unique.shuffled().prefix(max(0, limit)))
        }
        return (identifiers ?? []).filter { available.contains($0) }
    }
}

/// A delayed external refresh must recheck this gate after a Photos mutation starts.
struct LibraryRefreshGate {
    private(set) var needsRefresh = false
    private var mutating = false
    private var suppressOwnObserver = false
    var canRunScheduledRefresh: Bool { !mutating && !suppressOwnObserver }
    mutating func didChange() -> Bool { needsRefresh = true; return canRunScheduledRefresh }
    mutating func beginMutation() { mutating = true; suppressOwnObserver = true }
    mutating func endMutation() { mutating = false; needsRefresh = true }
    mutating func refreshStarted() { needsRefresh = false; suppressOwnObserver = false }
}

enum SwipeCommitPolicy {
    /// A previously issued, visible-card swipe may finish during a metadata-only write.
    static func canFinish(deleting: Bool, loading: Bool, mutating: Bool) -> Bool { !deleting && !loading }
}

/// Focus mode: the whole photo is the target. Direction decides, a fast flick also counts.
enum FocusGesture: Equatable {
    case keep, trash, later, undo, none
    static func classify(dx: CGFloat, dy: CGFloat, predictedDX: CGFloat, predictedDY: CGFloat,
                         width: CGFloat, height: CGFloat) -> FocusGesture {
        if abs(dx) >= abs(dy) {
            let threshold = max(65, width * 0.23)
            if abs(dx) > threshold { return dx > 0 ? .keep : .trash }
            if abs(dx) > 18 && abs(predictedDX) > width * 0.65 { return predictedDX > 0 ? .keep : .trash }
            return .none
        }
        let threshold = max(90, height * 0.14)
        if dy < -threshold || (dy < -18 && predictedDY < -height * 0.45) { return .later }
        if dy > threshold || (dy > 18 && predictedDY > height * 0.45) { return .undo }
        return .none
    }
    /// Live feedback while dragging, before release.
    static func preview(dx: CGFloat, dy: CGFloat, width: CGFloat, height: CGFloat) -> FocusGesture {
        classify(dx: dx, dy: dy, predictedDX: dx, predictedDY: dy, width: width, height: height)
    }
}

/// Per-photo quality from an on-device thumbnail. Only these numbers are cached on the device; never images, never uploaded.
struct PhotoQuality: Sendable, Equatable, Codable {
    /// Variance of the Laplacian on a small grayscale thumbnail (0...1 intensities). Low = soft or blurred.
    let sharpness: Double
    /// Apple's aesthetics score (-1...1), iOS 18 and later; nil on iOS 17.
    let aesthetic: Double?
    /// Apple marks receipts, documents, notes and similar "utility" images (iOS 18 and later).
    let utility: Bool
    /// Mean brightness (0 black ... 1 white) and contrast (standard deviation) of the thumbnail.
    var brightness: Double = 0.5
    var contrast: Double = 0.2
}

/// Default effect: the best shot is preselected, so one confirmation handles a whole stack.
enum SmartPick {
    static let blurThreshold = 0.0009
    static func score(_ quality: PhotoQuality?) -> Double {
        guard let quality else { return 0 }
        return (quality.aesthetic ?? 0) * 2 + min(quality.sharpness / 0.004, 1.5)
    }
    /// Favourites always win; otherwise the highest score; ties keep the earliest photo.
    static func best(_ ids: [String], quality: [String: PhotoQuality], favorites: Set<String>) -> String? {
        var winner: String?
        var top = -Double.infinity
        for id in ids {
            let value = score(quality[id]) + (favorites.contains(id) ? 100 : 0)
            if value > top { top = value; winner = id }
        }
        return winner
    }
    /// Everything not kept is set aside for review. At least one photo of a stack always stays.
    static func decisions(group: [String], keep: Set<String>) -> [(String, PhotoDecision)] {
        let keepers = keep.intersection(group)
        guard !keepers.isEmpty else { return [] }
        return group.map { ($0, keepers.contains($0) ? .keep : .trash) }
    }
}

enum ClutterReason: Int, Comparable {
    case document, screenshot, blurry, accidental
    static func < (lhs: ClutterReason, rhs: ClutterReason) -> Bool { lhs.rawValue < rhs.rawValue }
    var label: String {
        switch self {
        case .document: return String(localized: "Bonnetje of notitie", bundle: .app)
        case .screenshot: return String(localized: "Screenshot", bundle: .app)
        case .blurry: return String(localized: "Mogelijk wazig", bundle: .app)
        case .accidental: return String(localized: "Per ongeluk?", bundle: .app)
        }
    }
    /// Conservative on purpose: a wrong guess costs one extra swipe, never a deletion.
    static func classify(isScreenshot: Bool, isFavorite: Bool, quality: PhotoQuality?) -> ClutterReason? {
        if isFavorite { return nil }
        if isScreenshot { return .screenshot }
        guard let quality else { return nil }
        if SmartRules.looksAccidental(quality) { return .accidental }
        if quality.utility { return .document }
        if let aesthetic = quality.aesthetic {
            return quality.sharpness < SmartPick.blurThreshold * 2 && aesthetic < -0.2 ? .blurry : nil
        }
        return quality.sharpness < SmartPick.blurThreshold ? .blurry : nil
    }
}

/// One reminder per day at a time the user picked; skipped on days already done.
enum ReminderPlan {
    static func dates(now: Date, hour: Int, minute: Int, days: Int = 7, doneToday: Bool,
                      calendar: Calendar = .current) -> [Date] {
        let today = calendar.startOfDay(for: now)
        return (0..<days).compactMap { offset -> Date? in
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  let fire = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) else { return nil }
            if offset == 0 && (doneToday || fire <= now) { return nil }
            return fire
        }
    }
}


/// Ask for an App Store rating only after a clear win, rarely, and never twice for one version.
/// (iOS itself also limits how often the prompt appears.)
enum ReviewPrompt {
    static func shouldAsk(completedSessions: Int, setAsideThisSession: Int, lastAsked: Date?,
                          lastAskedVersion: String?, version: String, now: Date = Date()) -> Bool {
        guard completedSessions >= 2, setAsideThisSession >= 5, lastAskedVersion != version else { return false }
        if let lastAsked, now.timeIntervalSince(lastAsked) < 120 * 24 * 3600 { return false }
        return true
    }
}


/// Smart groups shown on "Slim opruimen". Swipe groups open as a category; stack groups open as stacks.
enum SmartGroup: String, CaseIterable, Identifiable {
    case similar, bursts, copies, bigVideos = "big-videos", clutter, accidental, oldScreenshots = "old-screenshots", fromApps = "from-apps", small
    var id: String { rawValue }
    var isStack: Bool { self == .similar || self == .bursts || self == .copies }
    var needsScan: Bool { self == .similar || self == .copies || self == .clutter || self == .accidental }
    var title: String {
        switch self {
        case .similar: return String(localized: "Bijna dubbel", bundle: .app)
        case .bursts: return String(localized: "Burstfoto's", bundle: .app)
        case .copies: return String(localized: "Exacte kopieën", bundle: .app)
        case .clutter: return String(localized: "Rommel", bundle: .app)
        case .accidental: return String(localized: "Per ongeluk", bundle: .app)
        case .oldScreenshots: return String(localized: "Oude screenshots", bundle: .app)
        case .fromApps: return String(localized: "Uit apps", bundle: .app)
        case .small: return String(localized: "Kleine plaatjes en GIF's", bundle: .app)
        case .bigVideos: return String(localized: "Grote video's", bundle: .app)
        }
    }
    var detail: String {
        switch self {
        case .similar: return String(localized: "Bijna gelijke foto's; de beste staat al klaar", bundle: .app)
        case .bursts: return String(localized: "iOS weet zelf welke foto de beste is", bundle: .app)
        case .copies: return String(localized: "Dezelfde foto twee keer opgeslagen", bundle: .app)
        case .clutter: return String(localized: "Wazig, bonnetjes, notities, screenshots", bundle: .app)
        case .accidental: return String(localized: "Bijna zwart, leeg, of video korter dan 3 sec.", bundle: .app)
        case .oldScreenshots: return String(localized: "Ouder dan \(SmartRules.oldScreenshotDays) dagen", bundle: .app)
        case .fromApps: return String(localized: "WhatsApp, Telegram, Instagram en meer", bundle: .app)
        case .small: return String(localized: "Lage resolutie, memes en gedownloade plaatjes", bundle: .app)
        case .bigVideos: return String(localized: "Groter dan ca. 50 MB. Weg of kleiner maken", bundle: .app)
        }
    }
    var icon: String {
        switch self {
        case .similar: return "square.stack.3d.up.fill"
        case .bursts: return "square.stack.fill"
        case .copies: return "plus.square.on.square"
        case .clutter: return "wand.and.stars"
        case .accidental: return "eye.slash"
        case .oldScreenshots: return "clock.arrow.circlepath"
        case .fromApps: return "bubble.left.and.bubble.right.fill"
        case .small: return "photo.badge.arrow.down"
        case .bigVideos: return "film.stack"
        }
    }
}

/// Metadata-only facts about an item (no image data).
struct AssetFacts: Equatable {
    let id: String
    var isVideo = false
    var isScreenshot = false
    var isAnimated = false
    var pixelWidth = 0
    var pixelHeight = 0
    var duration: Double = 0
    var created: Date?
}

enum SmartRules {
    static let oldScreenshotDays = 30
    static let smallPixels = 600_000
    static let shortVideoSeconds = 3.0
    static let appAlbumNames = ["whatsapp", "whatsapp business", "telegram", "messenger", "instagram", "snapchat", "signal",
                                "facebook", "tiktok", "pinterest", "twitter", "x", "threads", "discord", "wechat", "line", "viber"]

    static func isOldScreenshot(_ facts: AssetFacts, now: Date = Date()) -> Bool {
        guard facts.isScreenshot, let created = facts.created else { return false }
        return now.timeIntervalSince(created) > Double(oldScreenshotDays) * 24 * 3600
    }
    static func isSmall(_ facts: AssetFacts) -> Bool {
        guard !facts.isVideo, !facts.isScreenshot else { return false }
        return facts.isAnimated || (facts.pixelWidth * facts.pixelHeight > 0 && facts.pixelWidth * facts.pixelHeight < smallPixels)
    }
    static let bigVideoBytes = 50_000_000.0
    static func isBigVideo(_ facts: AssetFacts) -> Bool {
        facts.isVideo && SizeEstimate.bytes(isVideo: true, pixelWidth: facts.pixelWidth, pixelHeight: facts.pixelHeight,
                                            duration: facts.duration) >= bigVideoBytes
    }
    static func isShortVideo(_ facts: AssetFacts) -> Bool {
        facts.isVideo && facts.duration > 0 && facts.duration < shortVideoSeconds
    }
    /// Pocket shots and empty frames: almost black, or flat and soft.
    static func looksAccidental(_ quality: PhotoQuality) -> Bool {
        quality.brightness < 0.06 || (quality.contrast < 0.025 && quality.sharpness < SmartPick.blurThreshold * 2)
    }
    static func isAppAlbum(_ title: String) -> Bool {
        let name = title.lowercased().trimmingCharacters(in: .whitespaces)
        return appAlbumNames.contains(name) || appAlbumNames.contains { name.hasPrefix($0 + " ") }
    }
    /// Bursts: keep what iOS or the user picked; otherwise the representative photo.
    static func burstKeep(_ ids: [String], picked: Set<String>, representative: String?) -> Set<String> {
        let kept = picked.intersection(ids)
        if !kept.isEmpty { return kept }
        if let representative, ids.contains(representative) { return [representative] }
        return ids.first.map { [$0] } ?? []
    }
}


/// How much smaller a video becomes. "High" keeps 1080p (HEVC), the others lower the resolution too.
enum VideoQuality: String, CaseIterable, Identifiable {
    case high, medium, low
    var id: String { rawValue }
    var title: String {
        switch self {
        case .high: return String(localized: "Hoog (1080p)", bundle: .app)
        case .medium: return String(localized: "Midden (720p)", bundle: .app)
        case .low: return String(localized: "Laag (540p)", bundle: .app)
        }
    }
    var preset: String {
        switch self {
        case .high: return "AVAssetExportPresetHEVC1920x1080"
        case .medium: return "AVAssetExportPreset1280x720"
        case .low: return "AVAssetExportPreset960x540"
        }
    }
    /// Rough share of the original size that remains, shown before the user picks.
    var expectedShare: Double {
        switch self {
        case .high: return 0.5
        case .medium: return 0.3
        case .low: return 0.15
        }
    }
}
