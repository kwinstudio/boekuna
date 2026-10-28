import SwiftUI
import Photos
import PhotosUI
import UIKit
import Combine

private final class LibraryObserver: NSObject, PHPhotoLibraryChangeObserver {
    var onChange: (() -> Void)?
    func photoLibraryDidChange(_ changeInstance: PHChange) {
        DispatchQueue.main.async { [weak self] in self?.onChange?() }
    }
}

struct SwipeCommand: Identifiable {
    let id = UUID()
    let assetID: String
    let choice: PhotoDecision
}

/// These are existing Photos collections; no image analysis or custom labels.
struct PhotoCategory: Identifiable {
    let id: String
    let title: String
    let icon: String
    let collection: PHAssetCollection?
    let isAlbum: Bool
    var dateFilter: PhotoDateFilter = .all
    var isMonth: Bool { if case .month = dateFilter { return true }; return false }
    static let all = PhotoCategory(id: "all", title: "Alle foto's en video's", icon: "photo.on.rectangle", collection: nil, isAlbum: false)

    static func available(dates: [Date?]) -> [PhotoCategory] {
        let types: [(PHAssetCollectionSubtype, String, String)] = [
            (.smartAlbumVideos, "Video's", "video"),
            (.smartAlbumFavorites, "Favorieten", "heart"),
            (.smartAlbumScreenshots, "Screenshots", "viewfinder"),
            (.smartAlbumSelfPortraits, "Selfies", "person.crop.square"),
            (.smartAlbumDepthEffect, "Portretten", "person.crop.rectangle"),
            (.smartAlbumLivePhotos, "Live Photos", "livephoto"),
            (.smartAlbumPanoramas, "Panorama's", "pano"),
            (.smartAlbumRAW, "RAW", "camera"),
            (.smartAlbumRecentlyAdded, "Recent toegevoegd", "clock")
        ]
        var result = [PhotoCategory.all,
            PhotoCategory(id: "later", title: "Later beslissen", icon: "bookmark", collection: nil, isAlbum: false),
            PhotoCategory(id: "random30", title: "30 willekeurige items", icon: "shuffle", collection: nil, isAlbum: false),
            PhotoCategory(id: "on-this-day", title: "Op deze dag", icon: "calendar", collection: nil, isAlbum: false, dateFilter: .onThisDay),
            PhotoCategory(id: "clutter", title: "Rommel", icon: "wand.and.stars", collection: nil, isAlbum: false)]
        for (type, title, icon) in types {
            if let collection = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: type, options: nil).firstObject {
                result.append(PhotoCategory(id: collection.localIdentifier, title: title, icon: icon, collection: collection, isAlbum: false))
            }
        }
        var albums: [PhotoCategory] = []
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil).enumerateObjects { collection, _, _ in
            albums.append(PhotoCategory(id: collection.localIdentifier, title: collection.localizedTitle ?? "Naamloos album", icon: "rectangle.stack", collection: collection, isAlbum: true))
        }
        let months = PhotoDateFilter.monthStarts(in: dates).map { date in
            PhotoCategory(id: PhotoDateFilter.monthID(for: date), title: date.formatted(.dateTime.month(.wide).year()), icon: "calendar", collection: nil, isAlbum: false, dateFilter: .month(date))
        }
        return result + albums.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending } + months
    }
}

@MainActor final class PhotoLibrary: ObservableObject {
    @Published private(set) var authorization = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    @Published private(set) var assets: [PHAsset] = []
    @Published private(set) var categories: [PhotoCategory] = [.all]
    @Published private(set) var selectedCategory = PhotoCategory.all
    @Published private(set) var deckRevision = UUID()
    @Published private(set) var keptInCategory = 0
    @Published private(set) var order = PhotoOrder.newest
    @Published private(set) var monthProgress: [String: PhotoProgress] = [:]
    private var allAssets: [PHAsset] = [] {
        didSet { assetIndex = Dictionary(allAssets.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first }) }
    }
    private var assetIndex: [String: PHAsset] = [:]
    /// On-device scan for near-duplicate stacks and clutter; results live in memory only.
    let smart = SmartScanner()
    private var smartObserver: AnyCancellable?
    @Published private(set) var deferred: [PHAsset] = []
    @Published private(set) var mutating = false
    @Published private(set) var status: String?
    private var refreshGate = LibraryRefreshGate()
    private var randomSession = RandomReviewSession(limit: 30)
    private var refreshTask: Task<Void, Never>?
    private var favoriteOverrides: [String: Bool] = [:]
    lazy var imagePipeline = SwipeImagePipeline(manager: images)
    var comparisonAssets: [PHAsset] {
        let pendingIDs = Set(pending.map(\.localIdentifier))
        return assets.filter { $0.mediaType == .image && !pendingIDs.contains($0.localIdentifier) }
    }
    func isFavorite(_ asset: PHAsset) -> Bool { favoriteOverrides[asset.localIdentifier] ?? asset.isFavorite }
    private var scopeIDs: Set<String> = []
    @Published private(set) var deck: [PHAsset] = []
    @Published private(set) var remainingCount = 0
    @Published private(set) var swipeCommand: SwipeCommand?
    @Published private(set) var pending: [PHAsset] = []
    @Published private(set) var kept: [PHAsset] = []
    @Published private(set) var state = DecisionStore()
    @Published private(set) var loading = false
    @Published private(set) var deleting = false
    @Published var message: String?
    @Published var persistenceWarning: String?
    @Published private(set) var session = ReviewSession()
    @Published var sessionFinished = false
    @Published private(set) var streak = StreakStore()
    @Published private(set) var pendingBytes: Int64 = 0
    private var sizeCache: [String: Int64] = [:]
    private var sizeGeneration = 0
    private static let streakKey = "fotoswipe.streak.v1"
    let images = PHCachingImageManager()
    private let observer = LibraryObserver()
    private let stateURL: URL
    private var generation = 0
    private var queue = ReviewQueue<PHAsset>()
    private let persistence: DecisionPersistence

    var hasAccess: Bool { authorization == .authorized || authorization == .limited }
    var current: PHAsset? { deck.first }
    var reviewed: Int { assets.count - remainingCount }
    var canUndo: Bool { !loading && !deleting && !mutating && state.history.contains { scopeIDs.contains($0.id) } }

    init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fotoswipe", isDirectory: true)
        stateURL = folder.appendingPathComponent("decisions.json")
        persistence = DecisionPersistence(url: stateURL)
        if FileManager.default.fileExists(atPath: stateURL.path) {
            do { state = try JSONDecoder().decode(DecisionStore.self, from: Data(contentsOf: stateURL)) }
            catch { persistenceWarning = "Je opgeslagen keuzes konden niet worden gelezen. Verwijder pas foto's nadat je je selectie opnieuw hebt gecontroleerd." }
        }
        if let data = UserDefaults.standard.data(forKey: Self.streakKey),
           let saved = try? JSONDecoder().decode(StreakStore.self, from: data) { streak = saved }
        smartObserver = smart.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        observer.onChange = { [weak self] in self?.libraryDidChange() }
        PHPhotoLibrary.shared().register(observer)
        refresh()
    }

    deinit { PHPhotoLibrary.shared().unregisterChangeObserver(observer) }

    func requestAccess() {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func selectCategory(_ category: PhotoCategory) {
        guard !deleting, !mutating, category.id != selectedCategory.id || category.id == "random30" else { return }
        selectedCategory = category
        if category.id == "random30" { randomSession.restart() }
        refresh()
        if category.id == "clutter" && !smart.finished { startSmartScan() }
    }
    /// From a reminder: straight to today's memories from earlier years.
    func openOnThisDay() {
        guard !deleting, !mutating else { return }
        selectedCategory = PhotoCategory(id: "on-this-day", title: "Op deze dag", icon: "calendar", collection: nil, isAlbum: false, dateFilter: .onThisDay)
        refresh()
    }
    func asset(id: String) -> PHAsset? { assetIndex[id] }
    func clutterReason(_ asset: PHAsset) -> String? { smart.reasons[asset.localIdentifier]?.label }
    func startSmartScan() {
        guard hasAccess, !smart.scanning else { return }
        let candidates = allAssets
            .filter { state.decisions[$0.localIdentifier] == nil }
            .sorted { ($0.creationDate ?? .distantPast) > ($1.creationDate ?? .distantPast) }
        let favorites = Set(candidates.prefix(SmartScanner.limit * 2).filter { isFavorite($0) }.map(\.localIdentifier))
        smart.onFinish = { [weak self] in
            guard let self, self.selectedCategory.id == "clutter" else { return }
            self.refresh(showLoading: false)
        }
        smart.start(candidates, favorites: favorites)
    }
    /// One decision for a whole stack: keepers kept, the rest set aside for review.
    func applyStack(_ group: [String], keep: Set<String>) {
        guard !deleting, !mutating else { return }
        let decisions = SmartPick.decisions(group: group, keep: keep)
        guard !decisions.isEmpty else { return }
        let wasActive = streak.isActive(Date())
        for (id, choice) in decisions where state.decisions[id] == nil {
            state.decide(id, choice)
            session.record(id, choice)
            streak.recordChoice()
        }
        rebuildPresentation()
        save()
        Haptics.choice(decisions.contains { $0.1 == .trash } ? .trash : .keep)
        if session.isComplete { streak.markActive() }
        saveStreak()
        if !wasActive && streak.isActive(Date()) { rescheduleReminders() }
        if session.isComplete && !sessionFinished { sessionFinished = true; Haptics.success() }
    }
    /// Undecided items left in the current category.
    var remainingInCategory: Int { remainingCount }
    /// "Keep the rest": for people who do not want to judge every photo. Safe default: keeping never deletes.
    func keepRemaining() {
        guard !deleting, !mutating, !loading else { return }
        let rest = assets.filter { state.decisions[$0.localIdentifier] == nil }
        guard !rest.isEmpty else { return }
        for asset in rest { state.decide(asset.localIdentifier, .keep) }
        rebuildPresentation()
        save()
        Haptics.success()
        status = "\(rest.count) items bewaard. Met Bekijken kun je dit per item terugdraaien."
    }
    func bestInStack(_ group: [String]) -> String? {
        let favorites = Set(group.filter { id in assetIndex[id].map { isFavorite($0) } ?? false })
        return SmartPick.best(group, quality: smart.quality, favorites: favorites)
    }

    /// Plans the next 7 reminders with a personal line; skips today once the day is done.
    func rescheduleReminders() {
        let reminders = Reminders.shared
        guard reminders.enabled else { return }
        let now = Date()
        let dates = ReminderPlan.dates(now: now, hour: reminders.hour, minute: reminders.minute, doneToday: streak.isActive(now))
        let days = streak.current(now: now)
        let created = allAssets.map(\.creationDate)
        let items = dates.map { date -> (Date, String) in
            let count = created.reduce(0) { $0 + (PhotoDateFilter.onThisDay.includes($1, now: date) ? 1 : 0) }
            if count > 0 {
                return (date, "\(count) foto's van \(date.formatted(.dateTime.day().month(.wide))) uit eerdere jaren wachten op je. Even 2 minuten?")
            }
            if days > 0 { return (date, "Houd je reeks van \(days) dagen vast: 30 foto's, 2 minuten.") }
            return (date, "30 foto's, 2 minuten. Maak ruimte voor nieuwe herinneringen.")
        }
        reminders.schedule(items)
    }

    func selectOrder(_ order: PhotoOrder) {
        guard !deleting, !mutating, self.order != order else { return }
        self.order = order
        refresh()
    }

    func activate() {
        let access = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard !mutating, !deleting else { return }
        if authorization != access || refreshGate.needsRefresh { refresh(showLoading: assets.isEmpty) }
    }
    private func libraryDidChange() {
        guard refreshGate.didChange(), !mutating, !deleting else { return }
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(400)) } catch { return }
            guard let self, !Task.isCancelled, !self.mutating, !self.deleting,
                  self.refreshGate.canRunScheduledRefresh else { return }
            self.refresh(showLoading: false)
        }
    }
    func refresh(showLoading: Bool = true) {
        authorization = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        generation += 1
        let request = generation
        let selectedID = selectedCategory.id
        let selectedOrder = order
        let ascending = order == .oldest
        if showLoading { deckRevision = UUID(); swipeCommand = nil }
        refreshGate.refreshStarted()
        guard hasAccess else {
            assets = []; allAssets = []; scopeIDs = []; categories = [.all]; selectedCategory = .all; loading = false
            rebuildPresentation()
            return
        }
        if showLoading { loading = true }
        // Fetch metadata off the UI thread. No full-size image scan.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: ascending)]
            options.predicate = NSPredicate(format: "(mediaType == %d OR mediaType == %d) AND isHidden == NO", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
            let result = PHAsset.fetchAssets(with: options)
            var fetched: [PHAsset] = []
            result.enumerateObjects { asset, _, _ in fetched.append(asset) }
            let available = PhotoCategory.available(dates: fetched.map(\.creationDate))
            // Deleted/inaccessible albums fall back to the full accessible library.
            let selected = available.first { $0.id == selectedID } ?? .all
            var filtered: [PHAsset] = []
            if let collection = selected.collection {
                PHAsset.fetchAssets(in: collection, options: options).enumerateObjects { asset, _, _ in filtered.append(asset) }
            } else {
                let now = Date()
                filtered = fetched.filter { selected.dateFilter.includes($0.creationDate, now: now) }
            }
            DispatchQueue.main.async {
                guard let self = self, self.generation == request, !self.mutating else { return }
                self.allAssets = fetched
                self.favoriteOverrides.removeAll()
                if selected.id == "clutter" {
                    let lookup = Dictionary(fetched.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
                    filtered = self.smart.clutter.compactMap { lookup[$0] }
                } else if selected.id == "later" {
                    filtered = fetched.filter { self.state.decisions[$0.localIdentifier] == .later }
                } else if selected.id == "random30" {
                    let candidates = fetched.filter { self.state.decisions[$0.localIdentifier] == nil }.map(\.localIdentifier)
                    let lookup = Dictionary(fetched.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
                    let ids = self.randomSession.select(candidates: candidates, available: Set(lookup.keys))
                    filtered = ids.compactMap { lookup[$0] }
                    if selectedOrder == .newest || selectedOrder == .oldest {
                        filtered.sort { lhs, rhs in
                            let left = lhs.creationDate ?? .distantPast
                            let right = rhs.creationDate ?? .distantPast
                            if left == right { return lhs.localIdentifier < rhs.localIdentifier }
                            return selectedOrder == .oldest ? left < right : left > right
                        }
                    }
                }
                if selectedOrder == .random && selected.id != "random30" { filtered.shuffle() }
                if selectedOrder == .largest {
                    filtered.sort { lhs, rhs in
                        let left = PhotoLibrary.fileSize(lhs)
                        let right = PhotoLibrary.fileSize(rhs)
                        if left == right { return lhs.localIdentifier < rhs.localIdentifier }
                        return left > right
                    }
                }
                self.assets = filtered
                self.scopeIDs = Set(filtered.map(\.localIdentifier))
                self.categories = available
                self.selectedCategory = selected
                self.loading = false
                self.rebuildPresentation(invalidate: showLoading)
                self.rescheduleReminders()
            }
        }
    }

    func requestSwipe(_ choice: PhotoDecision) {
        guard !deleting, !mutating, !loading, let asset = current else { return }
        guard choice == .later || imagePipeline.isReady(asset.localIdentifier) else { return }
        swipeCommand = SwipeCommand(assetID: asset.localIdentifier, choice: choice)
    }
    func decide(_ choice: PhotoDecision, expectedID: String? = nil, expectedRevision: UUID? = nil) {
        guard SwipeCommitPolicy.canFinish(deleting: deleting, loading: loading, mutating: mutating), let asset = current else { return }
        // A delayed animation must never apply to a newer deck or category.
        guard expectedRevision == nil || expectedRevision == deckRevision else { return }
        guard expectedID == nil || expectedID == asset.localIdentifier else { return }
        guard choice == .later || imagePipeline.isReady(asset.localIdentifier) else { return }
        let wasReviewed = state.decisions[asset.localIdentifier] != nil
        state.decide(asset.localIdentifier, choice)
        if !wasReviewed, let date = asset.creationDate {
            let key = PhotoDateFilter.monthID(for: date)
            if var progress = monthProgress[key] { progress.reviewed += 1; monthProgress[key] = progress }
        }
        deferred.removeAll { $0.localIdentifier == asset.localIdentifier }
        switch choice {
        case .keep: kept.append(asset); keptInCategory += 1
        case .trash: pending.append(asset); updatePendingBytes()
        case .later: deferred.append(asset)
        }
        queue.advance()
        publishDeck()
        save()
        updateCache()
        Haptics.choice(choice)
        session.record(asset.localIdentifier, choice)
        let wasActive = streak.isActive(Date())
        streak.recordChoice()
        if !wasActive && streak.isActive(Date()) { rescheduleReminders() }
        if session.isComplete || (remainingCount == 0 && session.count > 0) { finishSession() }
        else { saveStreak() }
    }
    private func finishSession() {
        let wasActive = streak.isActive(Date())
        streak.markActive()
        if !wasActive { rescheduleReminders() }
        saveStreak()
        guard !sessionFinished else { return }
        sessionFinished = true
        Haptics.success()
    }
    /// Starts a fresh goal of 30; choices already made stay as they are.
    func startNewSession() {
        session = ReviewSession()
        sessionFinished = false
    }
    var sessionTrashedBytes: Int64 { session.trashed.reduce(0) { $0 + (sizeCache[$1] ?? 0) } }
    var sessionHighlights: [PHAsset] {
        let ids = Set(session.kept)
        let picks = kept.filter { ids.contains($0.localIdentifier) }
        return Array((picks.filter { isFavorite($0) } + picks.filter { !isFavorite($0) }).prefix(3))
    }
    func undo() {
        guard canUndo, !mutating else { return }
        if let id = state.undo(in: scopeIDs) { session.remove(id) }
        rebuildPresentation()
        save()
    }

    /// Estimated size from public PHAsset metadata. Never reads image data or uses private API.
    nonisolated static func fileSize(_ asset: PHAsset) -> Int64 {
        Int64(SizeEstimate.bytes(isVideo: asset.mediaType == .video, pixelWidth: asset.pixelWidth, pixelHeight: asset.pixelHeight,
                                 duration: asset.duration, isLive: asset.mediaSubtypes.contains(.photoLive)))
    }
    private func updatePendingBytes() {
        let batch = pending
        let cached = sizeCache
        sizeGeneration += 1
        let request = sizeGeneration
        DispatchQueue.global(qos: .utility).async { [weak self] in
            var results: [String: Int64] = [:]
            var total: Int64 = 0
            for asset in batch {
                let size = cached[asset.localIdentifier] ?? PhotoLibrary.fileSize(asset)
                results[asset.localIdentifier] = size
                total += size
            }
            DispatchQueue.main.async {
                guard let self, self.sizeGeneration == request else { return }
                self.sizeCache.merge(results) { _, new in new }
                self.pendingBytes = total
            }
        }
    }
    private func saveStreak() {
        if let data = try? JSONEncoder().encode(streak) { UserDefaults.standard.set(data, forKey: Self.streakKey) }
    }
    func restore(_ id: String) {
        guard !deleting, !mutating else { return }
        state.restore(id)
        rebuildPresentation()
        save()
    }
    func reviewKeptAgain() {
        guard !deleting, !mutating else { return }
        if selectedCategory.id == "later" {
            for asset in assets where state.decisions[asset.localIdentifier] == .keep {
                state.decide(asset.localIdentifier, .later)
            }
        } else { state.resetKept(in: scopeIDs) }
        rebuildPresentation()
        save()
    }

    func deletePending() {
        guard !deleting, !mutating, !pending.isEmpty else { return }
        // Snapshot: any later library refresh cannot change the requested batch.
        let batch = pending
        guard batch.allSatisfy({ $0.canPerform(.delete) }) else {
            message = "Deze selectie bevat items die Apple niet door deze app laat verwijderen. Herstel die items eerst, bijvoorbeeld items uit een gesynchroniseerd album."
            return
        }
        deleting = true
        let ids = Set(batch.map(\.localIdentifier))
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.deleteAssets(batch as NSArray)
        }) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                self.deleting = false
                if success {
                    let freed = batch.reduce(Int64(0)) { $0 + (self.sizeCache[$1.localIdentifier] ?? 0) }
                    self.streak.freedBytes += freed
                    self.saveStreak()
                    Haptics.success()
                    self.state.finishDeletion(ids)
                    self.assets.removeAll { ids.contains($0.localIdentifier) }
                    self.allAssets.removeAll { ids.contains($0.localIdentifier) }
                    self.scopeIDs.subtract(ids)
                    self.rebuildPresentation()
                    self.save()
                    self.message = "\(batch.count) items verwijderd\(freed > 0 ? ", \(ByteText.format(freed)) vrijgemaakt" : ""). Je kunt ze normaal tot 30 dagen terugzetten via 'Recent verwijderd' in Foto's."
                    self.refresh()
                } else {
                    self.message = "Er is niets door Fotoswipe verwijderd. Je selectie is bewaard. \(error?.localizedDescription ?? "De verwijdering is geannuleerd.")"
                }
            }
        }
    }

    private func save() {
        persistence.save(state) { [weak self] error in
            guard error != nil else { return }
            DispatchQueue.main.async {
                self?.persistenceWarning = "Je keuzes konden niet worden opgeslagen. Houd de app open en probeer later opnieuw."
            }
        }
    }
    func finishPendingWrites() {
        let task = UIApplication.shared.beginBackgroundTask(withName: "Fotoswipe keuzes opslaan", expirationHandler: nil)
        persistence.flush {
            DispatchQueue.main.async {
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
            }
        }
    }
    private func rebuildPresentation(invalidate: Bool = true) {
        if invalidate { deckRevision = UUID(); swipeCommand = nil }
        var progress: [String: PhotoProgress] = [:]
        var saved: [PHAsset] = []
        var trash: [PHAsset] = []
        var later: [PHAsset] = []
        for asset in allAssets {
            if let date = asset.creationDate {
                let key = PhotoDateFilter.monthID(for: date)
                var month = progress[key] ?? PhotoProgress()
                month.total += 1
                if state.decisions[asset.localIdentifier] != nil { month.reviewed += 1 }
                progress[key] = month
            }
            switch state.decisions[asset.localIdentifier] {
            case .keep: saved.append(asset)
            case .trash: trash.append(asset)
            case .later: later.append(asset)
            case nil: break
            }
        }
        if selectedCategory.id == "later" {
            queue.replace(assets.filter { state.decisions[$0.localIdentifier] == .later })
        } else { queue.replace(assets.filter { state.decisions[$0.localIdentifier] == nil }) }
        keptInCategory = assets.reduce(0) { $0 + (state.decisions[$1.localIdentifier] == .keep ? 1 : 0) }
        kept = saved
        let pendingChanged = pending.map(\.localIdentifier) != trash.map(\.localIdentifier)
        pending = trash
        deferred = later
        monthProgress = progress
        if pendingChanged || (pendingBytes == 0 && !trash.isEmpty) { updatePendingBytes() }
        if trash.isEmpty { pendingBytes = 0 }
        publishDeck()
        updateCache()
    }
    private func publishDeck() {
        remainingCount = queue.remainingCount
        deck = Array(queue.preview(limit: 3))
    }
    private func updateCache() {
        imagePipeline.prepare(Array(queue.preview(limit: 20)))
    }

    func deferCurrent() { decide(.later) }

    func queueForReview(_ ids: [String]) {
        guard !deleting, !mutating else { return }
        let selected = Set(ids)
        for asset in allAssets where selected.contains(asset.localIdentifier) {
            state.decide(asset.localIdentifier, .trash)
        }
        rebuildPresentation()
        save()
        status = "Selectie weggelegd. Controleer alle items in Bekijken."
    }

    func toggleFavorite() {
        guard !loading, !deleting, !mutating, let asset = current else { return }
        guard asset.canPerform(.properties) else {
            message = "Dit item kan niet als favoriet worden aangepast."; return
        }
        let favorite = !isFavorite(asset)
        refreshTask?.cancel(); refreshTask = nil
        generation += 1 // Invalidate any metadata fetch that began before the mutation.
        mutating = true
        refreshGate.beginMutation()
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest(for: asset).isFavorite = favorite
        }) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                self.mutating = false
                self.refreshGate.endMutation()
                if success {
                    self.favoriteOverrides[asset.localIdentifier] = favorite
                    self.status = favorite ? "Toegevoegd aan Favorieten in Foto's." : "Verwijderd uit Favorieten in Foto's."
                } else { self.message = error?.localizedDescription ?? "Favoriet wijzigen is niet gelukt." }
                // Do not rebuild the deck in response to our own metadata write.
                // A later category change or activation reconciles Photos collections.
            }
        }
    }

    func add(_ asset: PHAsset, to collection: PHAssetCollection?, newTitle: String?, completion: @escaping (String?) -> Void) {
        guard !mutating, !deleting else { completion("Er wordt nog een wijziging verwerkt."); return }
        let title = newTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard collection?.canPerform(.addContent) == true || (title?.isEmpty == false) else {
            completion("Kies een bewerkbaar album of geef een albumnaam op."); return
        }
        refreshTask?.cancel(); refreshTask = nil
        generation += 1 // Invalidate any metadata fetch that began before the mutation.
        mutating = true
        refreshGate.beginMutation()
        PHPhotoLibrary.shared().performChanges({
            let request: PHAssetCollectionChangeRequest?
            if let collection { request = PHAssetCollectionChangeRequest(for: collection) }
            else { request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title ?? "Album") }
            request?.addAssets([asset] as NSArray)
        }) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                if success, title != nil {
                    self.refreshAlbumCatalog {
                        self.mutating = false; self.refreshGate.endMutation()
                        self.status = "Toegevoegd aan album in Foto's."; completion(nil)
                    }
                } else {
                    self.mutating = false; self.refreshGate.endMutation()
                    if success { self.status = "Toegevoegd aan album in Foto's."; completion(nil) }
                    else { completion(error?.localizedDescription ?? "Toevoegen is niet gelukt. Je keuzes zijn bewaard.") }
                }
            }
        }
    }

    private func refreshAlbumCatalog(completion: @escaping () -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let catalog = PhotoCategory.available(dates: [])
            DispatchQueue.main.async {
                guard let self else { return }
                self.categories = catalog + self.categories.filter(\.isMonth)
                completion()
            }
        }
    }

}

/// UIKit presents Apple's limited-photo selector, not a custom permission screen.
struct LimitedLibraryPicker: UIViewControllerRepresentable {
    var onFinish: () -> Void
    func makeUIViewController(context: Context) -> PickerController {
        let controller = PickerController()
        controller.onFinish = onFinish
        return controller
    }
    func updateUIViewController(_ uiViewController: PickerController, context: Context) {}
    final class PickerController: UIViewController {
        var onFinish: (() -> Void)?
        private var presented = false
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard !presented else { return }
            presented = true
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: self) { [weak self] _ in
                DispatchQueue.main.async { self?.onFinish?() }
            }
        }
    }
}
