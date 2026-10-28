import SwiftUI
import Photos

struct SimilarPhotosView: View {
    let assets: [PHAsset]
    let manager: PHCachingImageManager
    let onTrash: ([String]) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service: SimilarPhotoService
    @State private var selection = SimilarPhotoSelection()
    @State private var submittedGroups: Set<String> = []
    @State private var queuedCount = 0
    @State private var hasScanned = false
    @State private var cancelled = false
    @State private var preview: Preview?

    init(assets: [PHAsset], manager: PHCachingImageManager, onTrash: @escaping ([String]) -> Void) {
        self.assets = assets
        self.manager = manager
        self.onTrash = onTrash
        _service = StateObject(wrappedValue: SimilarPhotoService(manager: manager))
    }

    private var visibleGroups: [SimilarPhotoGroup] {
        service.groups.filter { !submittedGroups.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                Text("Vergelijkbare foto's zijn kandidaten, geen bewezen duplicaten. Vergelijk zelf en bewaar minstens één foto per groep.")
                    .font(.subheadline).foregroundStyle(Palette.muted)
                Text("De scan werkt op dit apparaat met kleine, lokaal beschikbare voorbeelden. Foto's die alleen in iCloud staan worden overgeslagen.")
                    .font(.caption).foregroundStyle(Palette.muted)
                if service.scanning {
                    ProgressView(value: service.progress)
                    HStack {
                        Text("\(service.processedCount) foto's bekeken").font(.caption)
                        Spacer()
                        Button("Stop scan") { service.cancel(); cancelled = true }
                    }
                } else {
                    Button(hasScanned ? "Opnieuw scannen" : "Zoek vergelijkbare foto's") {
                        selection = SimilarPhotoSelection(); submittedGroups = []; queuedCount = 0
                        hasScanned = true; cancelled = false
                        service.start(assets)
                    }.buttonStyle(.borderedProminent)
                }
                if service.skippedCount > 0 {
                    Text("\(service.skippedCount) foto's overgeslagen: voorbeeld niet lokaal beschikbaar of niet leesbaar.")
                        .font(.caption).foregroundStyle(Palette.muted)
                }
                if cancelled {
                    Text("Scan gestopt. Start opnieuw om groepen te zoeken.").font(.caption)
                }
                if queuedCount > 0 {
                    Text("\(queuedCount) foto's weggelegd. Controleer ze in Bekijken voordat je iets verwijdert.")
                        .font(.subheadline).accessibilityAddTraits(.updatesFrequently)
                }
                if !service.scanning && hasScanned && !cancelled && visibleGroups.isEmpty {
                    ContentUnavailableView(queuedCount > 0 ? "Selectie weggelegd" : "Geen kandidaten gevonden", systemImage: "photo.on.rectangle.angled",
                        description: Text("Er wordt alleen gezocht tussen foto's die binnen twee minuten van elkaar zijn gemaakt. De scan kan vergelijkbare foto's missen."))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 24) {
                            ForEach(visibleGroups) { group in
                                groupView(group)
                            }
                        }
                    }
                }
                if !selection.rejected.isEmpty {
                    Button("Leg \(selection.rejected.count) foto's weg voor controle") { submit() }
                        .buttonStyle(PrimaryStyle())
                    Text("Je selectie wordt nog niet verwijderd.").font(.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(20).background(Palette.background)
            .navigationTitle("Vergelijkbare foto's").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
            .onDisappear { service.cancel() }
            .sheet(item: $preview) { item in
                NavigationStack {
                    AssetImage(asset: item.asset, manager: manager).background(.black)
                        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Sluiten") { preview = nil } } }
                }
            }
        }
    }

    private func groupView(_ group: SimilarPhotoGroup) -> some View {
        let ids = group.assets.map(\.localIdentifier)
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(group.assets.count) kandidaten").font(.headline)
            Text("Tik op een foto om details te bekijken. Kies daarna welke je wilt wegleggen.")
                .font(.caption).foregroundStyle(Palette.muted)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(group.assets, id: \.localIdentifier) { asset in
                    let selected = selection.rejected.contains(asset.localIdentifier)
                    let remaining = ids.filter { !selection.rejected.contains($0) }.count
                    VStack(spacing: 8) {
                        Button { preview = Preview(asset: asset) } label: {
                            AssetImage(asset: asset, manager: manager, thumbnail: true)
                                .frame(height: 170).clipShape(RoundedRectangle(cornerRadius: 12))
                        }.accessibilityLabel("Foto groter bekijken")
                        if let date = asset.creationDate {
                            Text(date.formatted(date: .abbreviated, time: .standard)).font(.caption2)
                        }
                        Button {
                            selection.toggle(asset.localIdentifier, in: ids)
                        } label: {
                            Label(selected ? "Wegleggen" : "Bewaren", systemImage: selected ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .tint(selected ? .orange : .green)
                        .disabled(!selected && remaining <= 1)
                        .accessibilityLabel(selected ? "Weggelegd; tik om te bewaren" : "Bewaard; tik om weg te leggen")
                        .accessibilityHint(!selected && remaining <= 1 ? "Minstens één foto per groep blijft bewaard" : "")
                    }
                }
            }
            Text("\(ids.filter { !selection.rejected.contains($0) }.count) blijven bewaard")
                .font(.caption).foregroundStyle(Palette.muted)
        }
    }

    private func submit() {
        // Validate against the current groups again at the action boundary.
        var ids: [String] = []
        for group in visibleGroups {
            let rejects = group.assets.map(\.localIdentifier).filter { selection.rejected.contains($0) }
            guard !rejects.isEmpty, rejects.count < group.assets.count else { continue }
            ids.append(contentsOf: rejects)
            submittedGroups.insert(group.id)
        }
        guard !ids.isEmpty else { return }
        onTrash(ids)
        queuedCount += ids.count
        selection = SimilarPhotoSelection()
    }

    private struct Preview: Identifiable {
        let asset: PHAsset
        var id: String { asset.localIdentifier }
    }
}
