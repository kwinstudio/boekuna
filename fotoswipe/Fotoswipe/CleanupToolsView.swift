import SwiftUI
import Photos
import AVKit

struct AssetPreviewView: View {
    let asset: PHAsset
    let manager: PHCachingImageManager
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Group {
                if asset.mediaType == .video { VideoAssetView(asset: asset, manager: manager) }
                else { AssetImage(asset: asset, manager: manager) }
            }
            .background(.black)
            .navigationTitle(asset.mediaType == .video ? "Video bekijken" : "Foto bekijken")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
    }
}

@MainActor private final class VideoPlayback: ObservableObject {
    @Published var player: AVPlayer?
    @Published var failed = false
    @Published var progress: Double = 0
    private var request = PHInvalidImageRequestID
    private var token = UUID()
    private var manager: PHImageManager?

    func load(_ asset: PHAsset, manager: PHImageManager) {
        stop()
        self.manager = manager
        failed = false; progress = 0
        let current = token
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .automatic
        options.progressHandler = { [weak self] value, _, _, _ in
            Task { @MainActor in
                guard self?.token == current else { return }
                self?.progress = value
            }
        }
        request = manager.requestPlayerItem(forVideo: asset, options: options) { [weak self] item, _ in
            Task { @MainActor in
                guard let self, self.token == current else { return }
                self.request = PHInvalidImageRequestID
                if let item { self.player = AVPlayer(playerItem: item) }
                else { self.failed = true }
            }
        }
    }
    func stop() {
        token = UUID()
        player?.pause(); player?.replaceCurrentItem(with: nil); player = nil
        if request != PHInvalidImageRequestID { manager?.cancelImageRequest(request) }
        request = PHInvalidImageRequestID
    }
}

private struct VideoAssetView: View {
    let asset: PHAsset
    let manager: PHCachingImageManager
    @StateObject private var playback = VideoPlayback()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            if let player = playback.player { VideoPlayer(player: player) }
            else if playback.failed {
                ContentUnavailableView {
                    Label("Video niet beschikbaar", systemImage: "icloud.slash")
                } description: { Text("Controleer je verbinding en probeer opnieuw.") }
                actions: { Button("Opnieuw proberen") { playback.load(asset, manager: manager) } }
            } else {
                VStack(spacing: 14) {
                    ProgressView().tint(.white)
                    Text(playback.progress > 0 ? "Video ophalen: \(Int(playback.progress * 100))%" : "Video voorbereiden…")
                        .foregroundStyle(.white)
                }
            }
        }
        .task(id: asset.localIdentifier) { playback.load(asset, manager: manager) }
        .onDisappear { playback.stop() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { playback.player?.pause() } }
    }
}

struct AlbumDestinationView: View {
    let asset: PHAsset
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var newAlbum = ""
    @State private var error: String?
    private var albums: [PhotoCategory] {
        library.categories.filter { $0.isAlbum && ($0.collection?.canPerform(.addContent) ?? false)
            && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section("Nieuw album") {
                    TextField("Naam van het album", text: $newAlbum)
                    Button("Maak album en voeg toe") { add(to: nil, newTitle: newAlbum) }
                        .disabled(newAlbum.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || library.mutating)
                }
                Section("Bestaand album") {
                    ForEach(albums) { album in
                        Button { add(to: album.collection, newTitle: nil) } label: {
                            Label(album.title, systemImage: "rectangle.stack")
                        }.disabled(library.mutating)
                    }
                    if albums.isEmpty { Text("Geen passend bewerkbaar album gevonden.").foregroundStyle(.secondary) }
                }
                if library.mutating { ProgressView("Toevoegen…") }
            }
            .searchable(text: $search, prompt: "Zoek een album")
            .navigationTitle("Voeg toe aan album").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Annuleren") { dismiss() }.disabled(library.mutating) } }
            .alert("Toevoegen niet gelukt", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") { error = nil }
            } message: { Text(error ?? "") }
            .interactiveDismissDisabled(library.mutating)
        }
    }
    private func add(to collection: PHAssetCollection?, newTitle: String?) {
        library.add(asset, to: collection, newTitle: newTitle) { message in
            if let message { error = message } else { dismiss() }
        }
    }
}
