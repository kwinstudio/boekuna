import SwiftUI
import Photos
import PhotosUI
import UIKit
import Combine
import AVFoundation
import CoreLocation

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
    static let all = PhotoCategory(id: "all", title: String(localized: "Alle foto's en video's", bundle: .app), icon: "photo.on.rectangle", collection: nil, isAlbum: false)

    static func available(dates: [Date?]) -> [PhotoCategory] {
        let types: [(PHAssetCollectionSubtype, String, String)] = [
            (.smartAlbumVideos, String(localized: "Video's", bundle: .app), "video"),
            (.smartAlbumFavorites, String(localized: "Favorieten", bundle: .app), "heart"),
            (.smartAlbumScreenshots, String(localized: "Screenshots", bundle: .app), "viewfinder"),
            (.smartAlbumSelfPortraits, String(localized: "Selfies", bundle: .app), "person.crop.square"),
            (.smartAlbumDepthEffect, String(localized: "Portretten", bundle: .app), "person.crop.rectangle"),
            (.smartAlbumLivePhotos, String(localized: "Live Photos", bundle: .app), "livephoto"),
            (.smartAlbumPanoramas, String(localized: "Panorama's", bundle: .app), "pano"),
            (.smartAlbumRAW, String(localized: "RAW", bundle: .app), "camera"),
            (.smartAlbumRecentlyAdded, String(localized: "Recent toegevoegd", bundle: .app), "clock")
        ]
        var result = [PhotoCategory.all,
            PhotoCategory(id: "later", title: String(localized: "Later beslissen", bundle: .app), icon: "bookmark", collection: nil, isAlbum: false),
            PhotoCategory(id: "random30", title: String(localized: "\(ReviewSession.size) willekeurige items", bundle: .app), icon: "shuffle", collection: nil, isAlbum: false),
            PhotoCategory(id: "on-this-day", title: String(localized: "Op deze dag", bundle: .app), icon: "calendar", collection: nil, isAlbum: false, dateFilter: .onThisDay),
            PhotoCategory(id: "clutter", title: String(localized: "Rommel", bundle: .app), icon: "wand.and.stars", collection: nil, isAlbum: false),
            PhotoCategory(id: "accidental", title: String(localized: "Per ongeluk", bundle: .app), icon: "eye.slash", collection: nil, isAlbum: false),
            PhotoCategory(id: "old-screenshots", title: String(localized: "Oude screenshots", bundle: .app), icon: "clock.arrow.circlepath", collection: nil, isAlbum: false),
            PhotoCategory(id: "from-apps", title: String(localized: "Uit apps", bundle: .app), icon: "bubble.left.and.bubble.right.fill", collection: nil, isAlbum: false),
            PhotoCategory(id: "big-videos", title: String(localized: "Grote video's", bundle: .app), icon: "film.stack", collection: nil, isAlbum: false),
            PhotoCategory(id: "small", title: String(localized: "Kleine plaatjes en GIF's", bundle: .app), icon: "photo.badge.arrow.down", collection: nil, isAlbum: false)]
        for (type, title, icon) in types {
            if let collection = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: type, options: nil).firstObject {
                result.append(PhotoCategory(id: collection.localIdentifier, title: title, icon: icon, collection: collection, isAlbum: false))
            }
        }
        var albums: [PhotoCategory] = []
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil).enumerateObjects { collection, _, _ in
            albums.append(PhotoCategory(id: collection.localIdentifier, title: collection.localizedTitle ?? String(localized: "Naamloos album", bundle: .app), icon: "rectangle.stack", collection: collection, isAlbum: true))
        }
        let months = PhotoDateFilter.monthStarts(in: dates).map { date in
            PhotoCategory(id: PhotoDateFilter.monthID(for: date), title: date.formatted(Date.FormatStyle(locale: AppLocale.locale).month(.wide).year()), icon: "calendar", collection: nil, isAlbum: false, dateFilter: .month(date))
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
        didSet { rebuildIndex() }
    }
    /// Burst frames that the normal fetch hides; only loaded for "Burstfoto's" so set-aside frames can be reviewed and deleted.
    private var extraAssets: [PHAsset] = [] {
        didSet { rebuildIndex() }
    }
    private func rebuildIndex() {
        assetIndex = Dictionary((allAssets + extraAssets).map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
    }
    /// Burst groups (all frames) and what to keep by default.
    @Published private(set) var burstStacks: [[String]] = []
    private var burstKeep: [String: Set<String>] = [:]
    @Published private(set) var burstsLoaded = false
    /// Per smart group: undecided items and their estimated size.
    @Published private(set) var smartSummary: [SmartGroup: (count: Int, bytes: Int64)] = [:]
    @Published private(set) var summaryLoading = false
    /// Progress text while a video is compressed or a Live Photo is converted.
    @Published private(set) var converting: String?
    private var assetIndex: [String: PHAsset] = [:]
    /// On-device scan for near-duplicate stacks and clutter; results live in memory only.
    let smart = SmartScanner()
    private var smartObserver: AnyCancellable?
    @Published private(set) var deferred: [PHAsset] = []
    @Published private(set) var mutating = false
    @Published private(set) var status: String?
    private var refreshGate = LibraryRefreshGate()
    private var randomSession = RandomReviewSession(limit: ReviewSession.size)
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
    /// Cached streak length: computed when the streak changes, not on every redraw.
    @Published private(set) var streakDays = 0
    private var reminderTask: Task<Void, Never>?
    private var sizeCache: [String: Int64] = [:]
    private var sizeGeneration = 0
    private static let streakKey = "fotoswipe.streak.v1"
    let images = PHCachingImageManager()
    private let observer = LibraryObserver()
    private let stateURL: URL
    private var generation = 0
    private var queue = ReviewQueue<PHAsset>()
    private let persistence: DecisionPersistence

    var allLibraryAssets: [PHAsset] { allAssets }
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
            catch { persistenceWarning = String(localized: "Je opgeslagen keuzes konden niet worden gelezen. Verwijder pas foto's nadat je je selectie opnieuw hebt gecontroleerd.", bundle: .app) }
        }
        if let data = UserDefaults.standard.data(forKey: Self.streakKey),
           let saved = try? JSONDecoder().decode(StreakStore.self, from: data) { streak = saved }
        streakDays = streak.current()
        smartObserver = smart.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        observer.onChange = { [weak self] in self?.libraryDidChange() }
        // Registering a change observer makes iOS ask for photo access at once, so wait until access exists.
        startObservingIfAllowed()
        refresh()
    }

    deinit { PHPhotoLibrary.shared().unregisterChangeObserver(observer) }
    private var observing = false
    private func startObservingIfAllowed() {
        guard !observing, hasAccess else { return }
        PHPhotoLibrary.shared().register(observer)
        observing = true
    }

    func requestAccess() {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func selectCategory(_ category: PhotoCategory) {
        guard !deleting, !mutating, category.id != selectedCategory.id || category.id == "random30" else { return }
        selectedCategory = category
        if category.id == "random30" { randomSession = RandomReviewSession(limit: ReviewSession.size) }
        refresh()
        if (category.id == "clutter" || category.id == "accidental") && !smart.finished { startSmartScan() }
    }
    /// From a reminder: straight to today's memories from earlier years.
    func openOnThisDay() {
        guard !deleting, !mutating else { return }
        selectedCategory = PhotoCategory(id: "on-this-day", title: String(localized: "Op deze dag", bundle: .app), icon: "calendar", collection: nil, isAlbum: false, dateFilter: .onThisDay)
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
            guard let self else { return }
            self.updateSmartSummary()
            if self.selectedCategory.id == "clutter" || self.selectedCategory.id == "accidental" { self.refresh(showLoading: false) }
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
    #if DEBUG
    /// Screenshot tooling only (Debug builds): fills screens with sample state. Never saved.
    func debugSetAside(_ count: Int) {
        for asset in assets.prefix(count) where state.decisions[asset.localIdentifier] == nil {
            state.decide(asset.localIdentifier, .trash)
        }
        rebuildPresentation()
    }
    func debugSimulateSession() {
        for (index, asset) in assets.prefix(ReviewSession.size).enumerated() {
            let choice: PhotoDecision = index % 3 == 0 ? .trash : (index % 7 == 0 ? .later : .keep)
            state.decide(asset.localIdentifier, choice)
            session.record(asset.localIdentifier, choice)
        }
        streak.markActive()
        rebuildPresentation()
        sessionFinished = true
    }
    #endif
    // MARK: Stats
    var totalReviewed: Int { state.decisions.count }
    var libraryCount: Int { allAssets.count }
    var libraryProgress: Double { allAssets.isEmpty ? 0 : min(1, Double(state.decisions.count) / Double(allAssets.count)) }
    /// Most recent months with their progress, newest first.
    func recentMonths(limit: Int = 6) -> [(title: String, reviewed: Int, total: Int)] {
        categories.filter(\.isMonth).prefix(limit).compactMap { category in
            guard let progress = monthProgress[category.id] else { return nil }
            return (category.title, progress.reviewed, progress.total)
        }
    }

    // MARK: Start over
    /// Kept items come back into the stacks; set-aside items stay set aside.
    func resetAllKept() {
        guard !deleting, !mutating else { return }
        state.resetKept()
        rebuildPresentation()
        save()
        status = String(localized: "Bewaarde items staan weer in de stapels.", bundle: .app)
    }
    /// Clears every choice (kept, set aside and later). Nothing in Photos is changed.
    func resetAllChoices() {
        guard !deleting, !mutating else { return }
        state = DecisionStore()
        session = ReviewSession()
        rebuildPresentation()
        save()
        status = String(localized: "Alle keuzes gewist. Je foto's zelf zijn niet aangepast.", bundle: .app)
    }

    // MARK: Smart groups

    nonisolated static func facts(_ asset: PHAsset) -> AssetFacts {
        AssetFacts(id: asset.localIdentifier, isVideo: asset.mediaType == .video,
                   isScreenshot: asset.mediaSubtypes.contains(.photoScreenshot),
                   isAnimated: asset.playbackStyle == .imageAnimated,
                   pixelWidth: asset.pixelWidth, pixelHeight: asset.pixelHeight,
                   duration: asset.duration, created: asset.creationDate)
    }
    /// Items in albums made by messaging and social apps (WhatsApp, Telegram, ...).
    nonisolated static func appAlbumAssetIDs() -> Set<String> {
        var ids = Set<String>()
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil).enumerateObjects { collection, _, _ in
            guard SmartRules.isAppAlbum(collection.localizedTitle ?? "") else { return }
            PHAsset.fetchAssets(in: collection, options: nil).enumerateObjects { asset, _, _ in ids.insert(asset.localIdentifier) }
        }
        return ids
    }
    func category(_ id: String) -> PhotoCategory? { categories.first { $0.id == id } ?? placeCategories[id] }

    // MARK: Places ("Reiskaart")

    @Published private(set) var places: [PlaceCluster] = []
    @Published private(set) var placesLoading = false
    @Published private(set) var placeNames: [String: String] = [:]
    private var placeCategories: [String: PhotoCategory] = [:]
    private var placeScopes: [String: Set<String>] = [:]
    private let geocoder = CLGeocoder()

    func loadPlaces() {
        guard hasAccess, !placesLoading else { return }
        placesLoading = true
        let assets = allAssets
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let points = assets.compactMap { asset -> PlacePoint? in
                guard let location = asset.location, let date = asset.creationDate else { return nil }
                return PlacePoint(id: asset.localIdentifier, latitude: location.coordinate.latitude,
                                  longitude: location.coordinate.longitude, date: date)
            }
            let clusters = PlaceClustering.clusters(points)
            DispatchQueue.main.async {
                guard let self else { return }
                self.places = clusters
                self.placesLoading = false
                self.nameNextPlace(Array(clusters.prefix(25)))
            }
        }
    }
    /// Place names come from Apple's map service, one at a time (it limits how many requests an app may send).
    private func nameNextPlace(_ queue: [PlaceCluster]) {
        guard let place = queue.first(where: { placeNames[$0.id] == nil }) else { return }
        let rest = queue.filter { $0.id != place.id }
        let location = CLLocation(latitude: place.latitude, longitude: place.longitude)
        geocoder.reverseGeocodeLocation(location, preferredLocale: AppLocale.locale) { [weak self] marks, _ in
            Task { @MainActor in
                guard let self else { return }
                let mark = marks?.first
                let name = mark?.locality ?? mark?.subAdministrativeArea ?? mark?.administrativeArea ?? mark?.country
                self.placeNames[place.id] = name ?? ""
                self.nameNextPlace(rest)
            }
        }
    }
    func placeName(_ place: PlaceCluster) -> String {
        if let name = placeNames[place.id], !name.isEmpty { return name }
        return place.isHome ? String(localized: "Thuis", bundle: .app)
            : place.start.formatted(Date.FormatStyle(locale: AppLocale.locale).month(.wide).year())
    }
    func undecidedCount(_ ids: [String]) -> Int { ids.filter { state.decisions[$0] == nil }.count }
    /// Makes a temporary category for one place and returns its id.
    func preparePlace(_ place: PlaceCluster) -> String {
        placeScopes[place.id] = Set(place.ids)
        placeCategories[place.id] = PhotoCategory(id: place.id, title: placeName(place), icon: "map", collection: nil, isAlbum: false)
        return place.id
    }

    /// Loads all burst frames once; the frames iOS or you picked are kept by default.
    func loadBursts() {
        guard hasAccess, !burstsLoaded else { return }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let options = PHFetchOptions()
            // burstIdentifier is a supported fetch key; without includeAllBurstAssets only one photo per burst is returned.
            options.predicate = NSPredicate(format: "burstIdentifier != nil")
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            var stacks: [[String]] = []
            var keep: [String: Set<String>] = [:]
            var frames: [PHAsset] = []
            PHAsset.fetchAssets(with: .image, options: options).enumerateObjects { representative, _, _ in
                guard representative.representsBurst, let burst = representative.burstIdentifier else { return }
                let all = PHFetchOptions()
                all.includeAllBurstAssets = true
                var members: [PHAsset] = []
                PHAsset.fetchAssets(withBurstIdentifier: burst, options: all).enumerateObjects { asset, _, _ in members.append(asset) }
                guard members.count > 1 else { return }
                let ids = members.map(\.localIdentifier)
                let picked = Set(members.filter { !$0.burstSelectionTypes.intersection([.autoPick, .userPick]).isEmpty }.map(\.localIdentifier))
                keep[ids[0]] = SmartRules.burstKeep(ids, picked: picked, representative: representative.localIdentifier)
                stacks.append(ids)
                frames.append(contentsOf: members.filter { $0.localIdentifier != representative.localIdentifier })
            }
            DispatchQueue.main.async {
                guard let self else { return }
                self.extraAssets = frames
                self.burstStacks = stacks
                self.burstKeep = keep
                self.burstsLoaded = true
                self.rebuildPresentation(invalidate: false)
                self.updateSmartSummary()
            }
        }
    }

    func stacks(for group: SmartGroup) -> [[String]] {
        switch group {
        case .similar: return smart.stacks
        case .copies: return smart.copies
        case .bursts: return burstStacks
        default: return []
        }
    }
    /// What is preselected to keep in a stack: picked burst frames, otherwise the best shot.
    func defaultKeep(for ids: [String], in group: SmartGroup) -> Set<String> {
        if group == .bursts, let first = ids.first, let keep = burstKeep[first] { return keep.intersection(ids) }
        return bestInStack(ids).map { [$0] } ?? []
    }

    /// Counts and estimated sizes per group, for undecided items. Runs off the main thread.
    func updateSmartSummary() {
        guard hasAccess else { return }
        summaryLoading = true
        let assets = allAssets.filter { state.decisions[$0.localIdentifier] == nil }
        let decided = Set(state.decisions.keys)
        let index = assetIndex
        let scanned: [SmartGroup: [String]] = [
            .clutter: smart.clutter, .accidental: smart.accidental,
            .similar: smart.stacks.flatMap { $0 }, .copies: smart.copies.flatMap { $0 }
        ]
        let burstFrames = burstStacks.flatMap { $0 }
        let scanFinished = smart.finished
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let now = Date()
            let appIDs = PhotoLibrary.appAlbumAssetIDs()
            var result: [SmartGroup: (count: Int, bytes: Int64)] = [:]
            func add(_ group: SmartGroup, _ list: [PHAsset]) {
                result[group] = (list.count, list.reduce(Int64(0)) { $0 + PhotoLibrary.fileSize($1) })
            }
            add(.oldScreenshots, assets.filter { SmartRules.isOldScreenshot(PhotoLibrary.facts($0), now: now) })
            add(.small, assets.filter { SmartRules.isSmall(PhotoLibrary.facts($0)) })
            add(.bigVideos, assets.filter { SmartRules.isBigVideo(PhotoLibrary.facts($0)) })
            add(.fromApps, assets.filter { appIDs.contains($0.localIdentifier) })
            let shortVideos = assets.filter { SmartRules.isShortVideo(PhotoLibrary.facts($0)) }
            if scanFinished {
                for group in [SmartGroup.clutter, .similar, .copies] {
                    add(group, (scanned[group] ?? []).filter { !decided.contains($0) }.compactMap { index[$0] })
                }
                add(.accidental, (scanned[.accidental] ?? []).filter { !decided.contains($0) }.compactMap { index[$0] } + shortVideos)
            }
            add(.bursts, burstFrames.filter { !decided.contains($0) }.compactMap { index[$0] })
            DispatchQueue.main.async {
                guard let self else { return }
                self.smartSummary = result
                self.summaryLoading = false
            }
        }
    }

    // MARK: Space without deleting

    private final class Box<T> { var value: T?; init() {} }

    /// Saves a smaller HEVC copy of a video (max 1080p) and sets the original aside for review.
    func compressVideo(_ asset: PHAsset, quality: VideoQuality = .high) {
        guard asset.mediaType == .video, converting == nil, !mutating, !deleting else { return }
        converting = String(localized: "Video verkleinen…", bundle: .app)
        Task { @MainActor in
            let message = await self.runCompression(asset, quality: quality)
            self.converting = nil
            self.message = message
            self.refresh(showLoading: false)
        }
    }
    private func runCompression(_ asset: PHAsset, quality: VideoQuality) async -> String {
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.version = .current
        let video: AVAsset? = await withCheckedContinuation { continuation in
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                continuation.resume(returning: avAsset)
            }
        }
        guard let video else { return String(localized: "Deze video kon niet worden geladen. Staat hij alleen in iCloud? Probeer het met internet opnieuw.", bundle: .app) }
        guard let session = AVAssetExportSession(asset: video, presetName: quality.preset) else {
            return String(localized: "Verkleinen is voor deze video niet mogelijk.", bundle: .app)
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("mov")
        defer { try? FileManager.default.removeItem(at: url) }
        do {
            if #available(iOS 18.0, *) {
                try await session.export(to: url, as: .mov)
            } else {
                session.outputURL = url
                session.outputFileType = .mov
                await session.export()
                guard session.status == .completed else { return String(localized: "Verkleinen is niet gelukt. Er is niets veranderd.", bundle: .app) }
            }
        } catch {
            return String(localized: "Verkleinen is niet gelukt. Er is niets veranderd.", bundle: .app)
        }
        let newSize = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
        let estimate = PhotoLibrary.fileSize(asset)
        guard newSize > 0, Double(newSize) < Double(estimate) * 0.8 else {
            return String(localized: "Deze video is al compact. Er is niets veranderd.", bundle: .app)
        }
        return await saveReplacement(for: asset, resource: .video, fileURL: url,
                                     done: String(localized: "Kleinere versie opgeslagen (\(ByteText.format(newSize))). Het origineel staat bij Weggelegd, zodat jij beslist.", bundle: .app))
    }

    /// Saves the still image of a Live Photo as a normal photo and sets the original aside for review.
    func convertLiveToStill(_ asset: PHAsset) {
        guard asset.mediaSubtypes.contains(.photoLive), converting == nil, !mutating, !deleting else { return }
        converting = String(localized: "Omzetten naar gewone foto…", bundle: .app)
        Task { @MainActor in
            let resources = PHAssetResource.assetResources(for: asset)
            guard let photo = resources.first(where: { $0.type == .fullSizePhoto }) ?? resources.first(where: { $0.type == .photo }) else {
                self.converting = nil
                self.message = String(localized: "Deze Live Photo kon niet worden omgezet.", bundle: .app)
                return
            }
            let ext = (photo.originalFilename as NSString).pathExtension
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext.isEmpty ? "heic" : ext)
            defer { try? FileManager.default.removeItem(at: url) }
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true
            do {
                try await PHAssetResourceManager.default().writeData(for: photo, toFile: url, options: options)
            } catch {
                self.converting = nil
                self.message = String(localized: "De foto kon niet worden geladen. Staat hij alleen in iCloud? Probeer het met internet opnieuw.", bundle: .app)
                return
            }
            let message = await self.saveReplacement(for: asset, resource: .photo, fileURL: url,
                                                     done: String(localized: "Gewone foto opgeslagen, zonder het bewegende deel (ca. 1,5 MB kleiner). Het origineel staat bij Weggelegd, zodat jij beslist.", bundle: .app))
            self.converting = nil
            self.message = message
            self.refresh(showLoading: false)
        }
    }

    /// Creates the new item with the original date, place and favourite; the original goes to "set aside", never straight to deletion.
    private func saveReplacement(for asset: PHAsset, resource: PHAssetResourceType, fileURL: URL, done: String) async -> String {
        refreshTask?.cancel(); refreshTask = nil
        generation += 1
        mutating = true
        refreshGate.beginMutation()
        let created = Box<String>()
        do {
            try await PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: resource, fileURL: fileURL, options: nil)
                request.creationDate = asset.creationDate
                request.location = asset.location
                request.isFavorite = asset.isFavorite
                created.value = request.placeholderForCreatedAsset?.localIdentifier
            }
        } catch {
            mutating = false
            refreshGate.endMutation()
            return String(localized: "Opslaan is niet gelukt. Er is niets veranderd.", bundle: .app)
        }
        mutating = false
        refreshGate.endMutation()
        if let newID = created.value { state.decide(newID, .keep) }
        state.decide(asset.localIdentifier, .trash)
        rebuildPresentation()
        save()
        Haptics.success()
        return done
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
        status = String(localized: "\(rest.count) items bewaard. Met Bekijken kun je dit per item terugdraaien.", bundle: .app)
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
        let days = streakDays
        let created = allAssets.map(\.creationDate)
        reminderTask?.cancel()
        // Counting runs off the main thread: one pass over the library, then 7 lookups.
        reminderTask = Task.detached(priority: .utility) {
            let calendar = Calendar.current
            var years: [Int: [Int]] = [:]   // month*100+day -> photo years
            for date in created {
                guard let date else { continue }
                let parts = calendar.dateComponents([.year, .month, .day], from: date)
                years[(parts.month ?? 0) * 100 + (parts.day ?? 0), default: []].append(parts.year ?? 0)
            }
            let items = dates.map { date -> (Date, String) in
                let parts = calendar.dateComponents([.year, .month, .day], from: date)
                let year = parts.year ?? 0
                let count = (years[(parts.month ?? 0) * 100 + (parts.day ?? 0)] ?? []).filter { $0 < year }.count
                if count > 0 {
                    return (date, String(localized: "\(count) foto's van \(date.formatted(Date.FormatStyle(locale: AppLocale.locale).day().month(.wide))) uit eerdere jaren wachten op je. Even 2 minuten?", bundle: .app))
                }
                if days > 0 { return (date, String(localized: "Houd je reeks van \(days) dagen vast. Een paar minuten swipen?", bundle: .app)) }
                return (date, String(localized: "Een paar minuten swipen en ruimte maken voor nieuwe herinneringen.", bundle: .app))
            }
            guard !Task.isCancelled else { return }
            await MainActor.run { Reminders.shared.schedule(items) }
        }
    }

    func selectOrder(_ order: PhotoOrder) {
        guard !deleting, !mutating, self.order != order else { return }
        self.order = order
        refresh()
    }

    func activate() {
        let days = streak.current()
        if days != streakDays { streakDays = days }   // a new day may have started while the app was open
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
        startObservingIfAllowed()
        generation += 1
        let request = generation
        let selectedID = selectedCategory.id
        let placeScope = placeScopes[selectedID]
        let placeCategory = placeCategories[selectedID]
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
            let selected = available.first { $0.id == selectedID } ?? placeCategory ?? .all
            var filtered: [PHAsset] = []
            let appIDs: Set<String> = selected.id == "from-apps" ? PhotoLibrary.appAlbumAssetIDs() : []
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
                } else if selected.id == "accidental" {
                    let lookup = Dictionary(fetched.map { ($0.localIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
                    let shortVideos = fetched.filter { SmartRules.isShortVideo(PhotoLibrary.facts($0)) }
                    filtered = self.smart.accidental.compactMap { lookup[$0] } + shortVideos
                } else if selected.id == "old-screenshots" {
                    let now = Date()
                    filtered = fetched.filter { SmartRules.isOldScreenshot(PhotoLibrary.facts($0), now: now) }
                } else if let placeScope, selected.id == selectedID, placeCategory != nil {
                    filtered = fetched.filter { placeScope.contains($0.localIdentifier) }
                } else if selected.id == "big-videos" {
                    filtered = fetched.filter { SmartRules.isBigVideo(PhotoLibrary.facts($0)) }
                } else if selected.id == "small" {
                    filtered = fetched.filter { SmartRules.isSmall(PhotoLibrary.facts($0)) }
                } else if selected.id == "from-apps" {
                    filtered = fetched.filter { appIDs.contains($0.localIdentifier) }
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
                if selectedOrder == .largest || (selected.id == "big-videos" && selectedOrder != .random) {
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
    /// Sessions finished in total; used for stats and for when to ask for a rating.
    var completedSessions: Int { UserDefaults.standard.integer(forKey: "fotoswipe.sessionsCompleted") }
    private func finishSession() {
        UserDefaults.standard.set(completedSessions + 1, forKey: "fotoswipe.sessionsCompleted")
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
        let days = streak.current()
        if days != streakDays { streakDays = days }
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
            message = String(localized: "Deze selectie bevat items die Apple niet door deze app laat verwijderen. Herstel die items eerst, bijvoorbeeld items uit een gesynchroniseerd album.", bundle: .app)
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
                    self.message = String(localized: "\(batch.count) items verwijderd", bundle: .app) + (freed > 0 ? " (\(ByteText.format(freed)))" : "") + ". " + String(localized: "Ze staan nog 30 dagen in 'Recent verwijderd' in Foto's; pas daarna komt de ruimte vrij. Wil je de ruimte nu al? Open Foto's, ga naar Albums > Recent verwijderd en kies Verwijder alles.", bundle: .app)
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
                self?.persistenceWarning = String(localized: "Je keuzes konden niet worden opgeslagen. Houd de app open en probeer later opnieuw.", bundle: .app)
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
        for asset in extraAssets {
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
        status = String(localized: "Selectie weggelegd. Controleer alle items in Bekijken.", bundle: .app)
    }

    func toggleFavorite() {
        guard !loading, !deleting, !mutating, let asset = current else { return }
        guard asset.canPerform(.properties) else {
            message = String(localized: "Dit item kan niet als favoriet worden aangepast.", bundle: .app); return
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
                    self.status = favorite ? String(localized: "Toegevoegd aan Favorieten in Foto's.", bundle: .app) : String(localized: "Verwijderd uit Favorieten in Foto's.", bundle: .app)
                } else { self.message = error?.localizedDescription ?? String(localized: "Favoriet wijzigen is niet gelukt.", bundle: .app) }
                // Do not rebuild the deck in response to our own metadata write.
                // A later category change or activation reconciles Photos collections.
            }
        }
    }

    func add(_ asset: PHAsset, to collection: PHAssetCollection?, newTitle: String?, completion: @escaping (String?) -> Void) {
        guard !mutating, !deleting else { completion(String(localized: "Er wordt nog een wijziging verwerkt.", bundle: .app)); return }
        let title = newTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard collection?.canPerform(.addContent) == true || (title?.isEmpty == false) else {
            completion(String(localized: "Kies een bewerkbaar album of geef een albumnaam op.", bundle: .app)); return
        }
        refreshTask?.cancel(); refreshTask = nil
        generation += 1 // Invalidate any metadata fetch that began before the mutation.
        mutating = true
        refreshGate.beginMutation()
        PHPhotoLibrary.shared().performChanges({
            let request: PHAssetCollectionChangeRequest?
            if let collection { request = PHAssetCollectionChangeRequest(for: collection) }
            else { request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title ?? String(localized: "Album", bundle: .app)) }
            request?.addAssets([asset] as NSArray)
        }) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                if success, title != nil {
                    self.refreshAlbumCatalog {
                        self.mutating = false; self.refreshGate.endMutation()
                        self.status = String(localized: "Toegevoegd aan album in Foto's.", bundle: .app); completion(nil)
                    }
                } else {
                    self.mutating = false; self.refreshGate.endMutation()
                    if success { self.status = String(localized: "Toegevoegd aan album in Foto's.", bundle: .app); completion(nil) }
                    else { completion(error?.localizedDescription ?? String(localized: "Toevoegen is niet gelukt. Je keuzes zijn bewaard.", bundle: .app)) }
                }
            }
        }
    }

    /// Creates an empty album in Photos and returns its id (for pinning as a quick album).
    func createAlbum(named name: String, completion: @escaping (String?) -> Void) {
        var placeholder: String?
        PHPhotoLibrary.shared().performChanges({
            placeholder = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: name)
                .placeholderForCreatedAssetCollection.localIdentifier
        }) { [weak self] success, _ in
            Task { @MainActor in
                guard let self, success else { completion(nil); return }
                self.refreshAlbumCatalog { completion(placeholder) }
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
