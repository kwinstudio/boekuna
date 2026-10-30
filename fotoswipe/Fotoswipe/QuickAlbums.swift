import SwiftUI
import Photos

/// Up to three albums pinned under the photo: one tap files the photo there and keeps it (as in Slidebox).
@MainActor final class QuickAlbumStore: ObservableObject {
    static let shared = QuickAlbumStore()
    static let limit = 3
    private static let key = "fotoswipe.quickAlbums"
    @Published private(set) var ids: [String] = UserDefaults.standard.stringArray(forKey: key) ?? []

    func contains(_ id: String) -> Bool { ids.contains(id) }
    func toggle(_ id: String) {
        if let index = ids.firstIndex(of: id) { ids.remove(at: index) }
        else if ids.count < Self.limit { ids.append(id) }
        UserDefaults.standard.set(ids, forKey: Self.key)
    }
    /// Pinned albums that still exist and accept new items, in the order they were pinned.
    func albums(in categories: [PhotoCategory]) -> [PhotoCategory] {
        let lookup = Dictionary(categories.filter(\.isAlbum).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return ids.compactMap { lookup[$0] }.filter { $0.collection?.canPerform(.addContent) == true }
    }
}

enum QuickAlbumRules {
    /// Pure helper for tests: toggling keeps order and never exceeds the limit.
    static func toggled(_ ids: [String], _ id: String, limit: Int = QuickAlbumStore.limit) -> [String] {
        if let index = ids.firstIndex(of: id) { var copy = ids; copy.remove(at: index); return copy }
        return ids.count < limit ? ids + [id] : ids
    }
}

/// The row of pinned album buttons above the swipe controls. Hidden when nothing is pinned.
struct QuickAlbumBar: View {
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject private var store = QuickAlbumStore.shared
    @State private var busy = false
    var body: some View {
        let albums = store.albums(in: library.categories)
        if !albums.isEmpty, let asset = library.current {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(albums) { album in
                        Button {
                            busy = true
                            Haptics.threshold()
                            library.add(asset, to: album.collection, newTitle: nil) { error in
                                busy = false
                                if error == nil { library.requestSwipe(.keep) }
                            }
                        } label: {
                            Label(album.title, systemImage: "rectangle.stack.badge.plus").lineLimit(1)
                        }
                        .buttonStyle(ChipStyle(selected: false))
                        .accessibilityLabel(String(localized: "Zet in album \(album.title) en bewaar", bundle: .app))
                    }
                }.padding(.horizontal, 2)
            }
            .disabled(busy || library.mutating || library.deleting)
        }
    }
}

/// Settings: pick the albums to pin. Only albums you made yourself can receive photos.
struct QuickAlbumSettingsView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject private var store = QuickAlbumStore.shared
    @State private var newName = ""
    @State private var creating = false
    private var editable: [PhotoCategory] {
        library.categories.filter { $0.isAlbum && $0.collection?.canPerform(.addContent) == true }
    }
    var body: some View {
        List {
            Section {
                if editable.isEmpty {
                    Text("Je hebt nog geen eigen albums. Maak er hieronder een.").foregroundStyle(Palette.muted)
                }
                ForEach(editable) { album in
                    Button { store.toggle(album.id) } label: {
                        HStack {
                            Text(verbatim: album.title).foregroundStyle(Palette.ink)
                            Spacer()
                            if store.contains(album.id) {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.brand)
                            }
                        }
                    }
                    .disabled(!store.contains(album.id) && store.ids.count >= QuickAlbumStore.limit)
                }
            } header: { Text("Kies tot 3 albums") } footer: {
                Text("Ze staan als knoppen onder de foto. Eén tik zet de foto in dat album en gaat door naar de volgende.")
            }
            Section("Nieuw album") {
                TextField("Naam van het album", text: $newName)
                Button("Maak album") {
                    let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    creating = true
                    library.createAlbum(named: name) { id in
                        creating = false
                        newName = ""
                        if let id, !store.contains(id) { store.toggle(id) }
                    }
                }.disabled(creating || newName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle("Snelle albums")
    }
}
