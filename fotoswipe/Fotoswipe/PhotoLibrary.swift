import SwiftUI
import Photos
import PhotosUI
import UIKit

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
    static let all = PhotoCategory(id: "all", title: "Alle foto's", icon: "photo.on.rectangle", collection: nil, isAlbum: false)

    static func available(dates: [Date?]) -> [PhotoCategory] {
        let types: [(PHAssetCollectionSubtype, String, String)] = [
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
            PhotoCategory(id: "on-this-day", title: "Op deze dag", icon: "calendar", collection: nil, isAlbum: false, dateFilter: .onThisDay)]
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
    private var allAssets: [PHAsset] = []
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
    let images = PHCachingImageManager()
    private let observer = LibraryObserver()
    private let stateURL: URL
    private var generation = 0
    private var queue = ReviewQueue<PHAsset>()
    private var preheated: [PHAsset] = []
    private let persistence: DecisionPersistence

    var hasAccess: Bool { authorization == .authorized || authorization == .limited }
    var current: PHAsset? { deck.first }
    var reviewed: Int { assets.count - remainingCount }
    var canUndo: Bool { !loading && !deleting && state.history.contains { scopeIDs.contains($0.id) } }

    init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fotoswipe", isDirectory: true)
        stateURL = folder.appendingPathComponent("decisions.json")
        persistence = DecisionPersistence(url: stateURL)
        if FileManager.default.fileExists(atPath: stateURL.path) {
            do { state = try JSONDecoder().decode(DecisionStore.self, from: Data(contentsOf: stateURL)) }
            catch { persistenceWarning = "Je opgeslagen keuzes konden niet worden gelezen. Verwijder pas foto's nadat je je selectie opnieuw hebt gecontroleerd." }
        }
        observer.onChange = { [weak self] in self?.refresh() }
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
        guard !deleting, category.id != selectedCategory.id else { return }
        selectedCategory = category
        refresh()
    }

    func selectOrder(_ order: PhotoOrder) {
        guard !deleting, self.order != order else { return }
        self.order = order
        refresh()
    }

    func refresh() {
        authorization = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        generation += 1
        let request = generation
        let selectedID = selectedCategory.id
        let ascending = order == .oldest
        deckRevision = UUID()
        swipeCommand = nil
        guard hasAccess else {
            assets = []; allAssets = []; scopeIDs = []; categories = [.all]; selectedCategory = .all; loading = false
            rebuildPresentation()
            return
        }
        loading = true
        // Fetch metadata off the UI thread. No full-size image scan.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: ascending)]
            options.predicate = NSPredicate(format: "mediaType == %d AND isHidden == NO", PHAssetMediaType.image.rawValue)
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
                guard let self = self, self.generation == request else { return }
                self.allAssets = fetched
                self.assets = filtered
                self.scopeIDs = Set(filtered.map(\.localIdentifier))
                self.categories = available
                self.selectedCategory = selected
                self.loading = false
                self.rebuildPresentation()
            }
        }
    }

    func requestSwipe(_ choice: PhotoDecision) {
        guard !deleting, !loading, let asset = current else { return }
        swipeCommand = SwipeCommand(assetID: asset.localIdentifier, choice: choice)
    }
    func decide(_ choice: PhotoDecision, expectedID: String? = nil, expectedRevision: UUID? = nil) {
        guard !deleting, !loading, let asset = current else { return }
        // A delayed animation must never apply to a newer deck or category.
        guard expectedRevision == nil || expectedRevision == deckRevision else { return }
        guard expectedID == nil || expectedID == asset.localIdentifier else { return }
        state.decide(asset.localIdentifier, choice)
        if let date = asset.creationDate {
            let key = PhotoDateFilter.monthID(for: date)
            if var progress = monthProgress[key] { progress.reviewed += 1; monthProgress[key] = progress }
        }
        if choice == .keep { kept.append(asset); keptInCategory += 1 } else { pending.append(asset) }
        queue.advance()
        publishDeck()
        save()
        updateCache()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    func undo() {
        guard canUndo else { return }
        state.undo(in: scopeIDs)
        rebuildPresentation()
        save()
    }
    func restore(_ id: String) {
        guard !deleting else { return }
        state.restore(id)
        rebuildPresentation()
        save()
    }
    func reviewKeptAgain() {
        guard !deleting else { return }
        state.resetKept(in: scopeIDs)
        rebuildPresentation()
        save()
    }

    func deletePending() {
        guard !deleting, !pending.isEmpty else { return }
        // Snapshot: any later library refresh cannot change the requested batch.
        let batch = pending
        guard batch.allSatisfy({ $0.canPerform(.delete) }) else {
            message = "Deze selectie bevat foto's die Apple niet door deze app laat verwijderen. Herstel die foto's eerst, bijvoorbeeld foto's uit een gesynchroniseerd album."
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
                    self.state.finishDeletion(ids)
                    self.assets.removeAll { ids.contains($0.localIdentifier) }
                    self.allAssets.removeAll { ids.contains($0.localIdentifier) }
                    self.scopeIDs.subtract(ids)
                    self.rebuildPresentation()
                    self.save()
                    self.message = "\(batch.count) foto's verwijderd. Je kunt ze normaal tot 30 dagen terugzetten via 'Recent verwijderd' in Foto's."
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
    private func rebuildPresentation() {
        deckRevision = UUID()
        swipeCommand = nil
        var progress: [String: PhotoProgress] = [:]
        var saved: [PHAsset] = []
        var trash: [PHAsset] = []
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
            case nil: break
            }
        }
        queue.replace(assets.filter { state.decisions[$0.localIdentifier] == nil })
        keptInCategory = assets.reduce(0) { $0 + (state.decisions[$1.localIdentifier] == .keep ? 1 : 0) }
        kept = saved
        pending = trash
        monthProgress = progress
        publishDeck()
        updateCache()
    }
    private func publishDeck() {
        remainingCount = queue.remainingCount
        deck = Array(queue.preview(limit: 3))
    }
    private func updateCache() {
        let next = Array(queue.preview(limit: 8))
        let nextIDs = Set(next.map(\.localIdentifier))
        let previousIDs = Set(preheated.map(\.localIdentifier))
        let removed = preheated.filter { !nextIDs.contains($0.localIdentifier) }
        let added = next.filter { !previousIDs.contains($0.localIdentifier) }
        let options = PhotoImageConfiguration.options()
        if !removed.isEmpty {
            images.stopCachingImages(for: removed, targetSize: PhotoImageConfiguration.cardSize, contentMode: .aspectFit, options: options)
        }
        if !added.isEmpty {
            images.startCachingImages(for: added, targetSize: PhotoImageConfiguration.cardSize, contentMode: .aspectFit, options: options)
        }
        preheated = next
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
