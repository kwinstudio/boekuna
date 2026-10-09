import CryptoKit
import Foundation

// Offline document drafts: the original file plus on-device OCR, kept until the
// existing upload flow has received it. A draft is never an accounting record;
// financial values are only taken over after the server processing and the
// user's own review, exactly as for a normal upload.
//
// Storage: Application Support/BoekunaOfflineDrafts/<sha256(user id)>/<draft id>/
// - one folder per account, so another account on the same iPhone never sees them
// - iOS Data Protection "complete" (unreadable while the device is locked)
// - excluded from iCloud/iTunes backups
// - nothing in UserDefaults, nothing logged

struct OfflineDraftMeta: Codable, Equatable {
    let id: String
    /// Stable reference for the existing upload flow, so a retried upload reuses the same document row.
    let clientRef: String
    let name: String
    let mimeType: String
    let size: Int
    let kind: String
    let sha256: String
    let createdAt: Date
    var updatedAt: Date
    var attempts: Int
    var lastError: String?
    var ocrCharacters: Int
    var pageCount: Int?
}

enum OfflineDraftError: Error, Equatable {
    case invalidAccount, invalidDraft, notFound, tooLarge, storageFull, tooManyDrafts

    var code: String {
        switch self {
        case .invalidAccount: return "DRAFT_INVALID_ACCOUNT"
        case .invalidDraft: return "DRAFT_INVALID"
        case .notFound: return "DRAFT_NOT_FOUND"
        case .tooLarge: return "DOCUMENT_TOO_LARGE"
        case .storageFull: return "DRAFT_STORAGE_FULL"
        case .tooManyDrafts: return "DRAFT_LIMIT_REACHED"
        }
    }
}

struct OfflineDraftLimits {
    var maxBytesPerDraft = 15 * 1024 * 1024
    var maxDraftsPerAccount = 30
    var maxBytesPerAccount = 250 * 1024 * 1024
    /// Unsent drafts older than this are removed; the user is told before that happens.
    var retentionDays = 30
}

final class OfflineDraftStore {
    private let root: URL
    private let limits: OfflineDraftLimits
    private let now: () -> Date
    private let fileManager = FileManager.default
    private let lock = NSLock()

    static func defaultRoot() throws -> URL {
        try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("BoekunaOfflineDrafts", isDirectory: true)
    }

    init(root: URL, limits: OfflineDraftLimits = OfflineDraftLimits(), now: @escaping () -> Date = Date.init) {
        self.root = root
        self.limits = limits
        self.now = now
    }

    /// clientRef: the upload flow's own reference when an upload was interrupted halfway,
    /// so the retry lands on the same storage path and document row instead of a second copy.
    func save(userId: String, name: String, mimeType: String, kind: String, data: Data,
              ocr: LocalOCRDocument?, clientRef: String? = nil) throws -> OfflineDraftMeta {
        lock.lock(); defer { lock.unlock() }
        guard data.count <= limits.maxBytesPerDraft else { throw OfflineDraftError.tooLarge }
        guard !data.isEmpty else { throw OfflineDraftError.invalidDraft }
        let account = try createAccount(userId)
        let existing = try listLocked(account)
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        // The same file twice (double tap, retry) stays one draft.
        if let duplicate = existing.first(where: { $0.sha256 == hash }) { return duplicate }
        guard existing.count < limits.maxDraftsPerAccount else { throw OfflineDraftError.tooManyDrafts }
        guard existing.reduce(0, { $0 + $1.size }) + data.count <= limits.maxBytesPerAccount else {
            throw OfflineDraftError.storageFull
        }
        let id = UUID().uuidString.lowercased()
        let folder = account.appendingPathComponent(id, isDirectory: true)
        try createProtectedDirectory(folder)
        let timestamp = now()
        let meta = OfflineDraftMeta(
            id: id, clientRef: clientRef.flatMap(Self.validClientRef) ?? "ios-draft-" + id, name: Self.safeName(name), mimeType: Self.safeMime(mimeType),
            size: data.count, kind: ["purchase", "sale", "auto"].contains(kind) ? kind : "auto", sha256: hash,
            createdAt: timestamp, updatedAt: timestamp, attempts: 0, lastError: nil,
            ocrCharacters: ocr?.text.count ?? 0, pageCount: ocr?.pageCount
        )
        do {
            try write(data, to: folder.appendingPathComponent("original"))
            if let ocr { try write(try Self.encoder.encode(ocr), to: folder.appendingPathComponent("ocr.json")) }
            // meta.json last: a draft without it is incomplete and gets cleaned up.
            try write(try Self.encoder.encode(meta), to: folder.appendingPathComponent("meta.json"))
        } catch {
            try? fileManager.removeItem(at: folder)
            throw error
        }
        return meta
    }

    /// Oldest first. Expired and incomplete drafts are removed on the way.
    func list(userId: String) throws -> [OfflineDraftMeta] {
        lock.lock(); defer { lock.unlock() }
        guard let account = try existingAccount(userId) else { return [] }
        return try listLocked(account)
    }

    func read(userId: String, id: String) throws -> (meta: OfflineDraftMeta, data: Data) {
        lock.lock(); defer { lock.unlock() }
        let folder = try draftFolder(userId, id)
        guard let meta = try? Self.decoder.decode(OfflineDraftMeta.self, from: Data(contentsOf: folder.appendingPathComponent("meta.json"))),
              let data = try? Data(contentsOf: folder.appendingPathComponent("original")) else { throw OfflineDraftError.notFound }
        return (meta, data)
    }

    func readOCR(userId: String, id: String) throws -> LocalOCRDocument? {
        lock.lock(); defer { lock.unlock() }
        let url = try draftFolder(userId, id).appendingPathComponent("ocr.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? Self.decoder.decode(LocalOCRDocument.self, from: data)
    }

    func markAttempt(userId: String, id: String, error: String?) throws -> OfflineDraftMeta {
        lock.lock(); defer { lock.unlock() }
        let folder = try draftFolder(userId, id), url = folder.appendingPathComponent("meta.json")
        guard var meta = try? Self.decoder.decode(OfflineDraftMeta.self, from: Data(contentsOf: url)) else {
            throw OfflineDraftError.notFound
        }
        meta.attempts += 1
        meta.updatedAt = now()
        meta.lastError = error.map { String($0.prefix(80)).filter { $0.isLetter || $0.isNumber || $0 == "_" } }
        try write(try Self.encoder.encode(meta), to: url)
        return meta
    }

    func delete(userId: String, id: String) throws {
        lock.lock(); defer { lock.unlock() }
        let folder = try draftFolder(userId, id)
        if fileManager.fileExists(atPath: folder.path) { try fileManager.removeItem(at: folder) }
    }

    /// Account deletion: removes every draft of that account.
    func deleteAll(userId: String) throws {
        lock.lock(); defer { lock.unlock() }
        if let account = try existingAccount(userId) { try fileManager.removeItem(at: account) }
    }

    // MARK: - Validation (pure, unit tested)

    static func accountKey(_ userId: String) -> String? {
        let trimmed = userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (8...64).contains(trimmed.count),
              trimmed.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" }) else { return nil }
        return SHA256.hash(data: Data(trimmed.lowercased().utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func validClientRef(_ value: String) -> String? {
        guard (1...120).contains(value.count),
              value.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || "._-".unicodeScalars.contains($0) }) else { return nil }
        return value
    }

    static func isDraftId(_ id: String) -> Bool {
        id.count == 36 && UUID(uuidString: id) != nil && id == id.lowercased()
    }

    static func safeName(_ name: String) -> String {
        let base = (name as NSString).lastPathComponent
            .components(separatedBy: CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "/\\:")))
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((base.isEmpty || base == "." || base == ".." ? "document" : base).prefix(140))
    }

    static func safeMime(_ mime: String) -> String {
        let lower = mime.lowercased()
        let allowed = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/tiff", "image/webp"]
        return allowed.contains(lower) ? lower : "application/octet-stream"
    }

    // MARK: - Private

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }()

    private func existingAccount(_ userId: String) throws -> URL? {
        let url = try accountURL(userId)
        return fileManager.fileExists(atPath: url.path) ? url : nil
    }

    private func createAccount(_ userId: String) throws -> URL {
        let url = try accountURL(userId)
        try createProtectedDirectory(root)
        try createProtectedDirectory(url)
        return url
    }

    private func accountURL(_ userId: String) throws -> URL {
        guard let key = Self.accountKey(userId) else { throw OfflineDraftError.invalidAccount }
        return root.appendingPathComponent(String(key.prefix(40)), isDirectory: true)
    }

    private func draftFolder(_ userId: String, _ id: String) throws -> URL {
        guard Self.isDraftId(id) else { throw OfflineDraftError.invalidDraft }
        guard let account = try existingAccount(userId) else { throw OfflineDraftError.notFound }
        return account.appendingPathComponent(id, isDirectory: true)
    }

    private func listLocked(_ account: URL) throws -> [OfflineDraftMeta] {
        let cutoff = now().addingTimeInterval(-Double(limits.retentionDays) * 86_400)
        var drafts: [OfflineDraftMeta] = []
        for folder in (try? fileManager.contentsOfDirectory(at: account, includingPropertiesForKeys: nil)) ?? [] {
            guard Self.isDraftId(folder.lastPathComponent) else { continue }
            guard let meta = try? Self.decoder.decode(OfflineDraftMeta.self, from: Data(contentsOf: folder.appendingPathComponent("meta.json"))),
                  meta.createdAt >= cutoff else {
                try? fileManager.removeItem(at: folder)
                continue
            }
            drafts.append(meta)
        }
        return drafts.sorted { $0.createdAt < $1.createdAt }
    }

    private func createProtectedDirectory(_ url: URL) throws {
        if !fileManager.fileExists(atPath: url.path) {
            var attributes: [FileAttributeKey: Any] = [:]
#if os(iOS)
            attributes[.protectionKey] = FileProtectionType.complete
#endif
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true, attributes: attributes)
        }
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = url
        try mutable.setResourceValues(values)
    }

    private func write(_ data: Data, to url: URL) throws {
#if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
#else
        try data.write(to: url, options: [.atomic])
#endif
    }
}
