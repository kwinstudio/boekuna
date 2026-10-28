import SwiftUI
import Photos
import UIKit

private final class LibraryObserver: NSObject, PHPhotoLibraryChangeObserver {
    var onChange: (() -> Void)?
    func photoLibraryDidChange(_ changeInstance: PHChange) {
        DispatchQueue.main.async { [weak self] in self?.onChange?() }
    }
}

@MainActor final class PhotoLibrary: ObservableObject {
    @Published private(set) var authorization = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    @Published private(set) var assets: [PHAsset] = []
    @Published private(set) var state = DecisionStore()
    @Published private(set) var loading = false
    @Published private(set) var deleting = false
    @Published var message: String?
    @Published var persistenceWarning: String?
    let images = PHCachingImageManager()
    private let observer = LibraryObserver()
    private let stateURL: URL
    private var generation = 0

    var hasAccess: Bool { authorization == .authorized || authorization == .limited }
    var remaining: [PHAsset] { assets.filter { state.decisions[$0.localIdentifier] == nil } }
    var current: PHAsset? { remaining.first }
    var pending: [PHAsset] { assets.filter { state.decisions[$0.localIdentifier] == .trash } }
    var kept: [PHAsset] { assets.filter { state.decisions[$0.localIdentifier] == .keep } }
    var reviewed: Int { assets.count - remaining.count }
    var canUndo: Bool { !state.history.isEmpty && !deleting }

    init() {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fotoswipe", isDirectory: true)
        stateURL = folder.appendingPathComponent("decisions.json")
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

    func refresh() {
        authorization = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        generation += 1
        let request = generation
        guard hasAccess else { assets = []; loading = false; return }
        loading = true
        // Fetch metadata off the UI thread. No full-size image scan.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            let result = PHAsset.fetchAssets(with: .image, options: options)
            var fetched: [PHAsset] = []
            result.enumerateObjects { asset, _, _ in fetched.append(asset) }
            DispatchQueue.main.async {
                guard let self = self, self.generation == request else { return }
                self.assets = fetched
                self.loading = false
                self.updateCache()
            }
        }
    }

    func decide(_ choice: PhotoDecision) {
        guard !deleting, !loading, let asset = current else { return }
        state.decide(asset.localIdentifier, choice)
        save()
        updateCache()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    func undo() {
        guard canUndo else { return }
        state.undo()
        save()
        updateCache()
    }
    func restore(_ id: String) {
        guard !deleting else { return }
        state.restore(id)
        save()
        updateCache()
    }
    func reviewKeptAgain() {
        guard !deleting else { return }
        state.resetKept()
        save()
        updateCache()
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
        do {
            try FileManager.default.createDirectory(at: stateURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(state)
            try data.write(to: stateURL, options: .atomic)
        } catch {
            persistenceWarning = "Je keuzes konden niet worden opgeslagen. Houd de app open en probeer later opnieuw."
        }
    }
    private func updateCache() {
        images.stopCachingImagesForAllAssets()
        let next = Array(remaining.prefix(4))
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = false
        images.startCachingImages(for: next, targetSize: CGSize(width: 1000, height: 1400), contentMode: .aspectFit, options: options)
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
