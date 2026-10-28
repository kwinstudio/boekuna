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
    @State private var queuedIDs: Set<String> = []
    @State private var hasScanned = false
    @State private var cancelled = false
    @State private var preview: Preview?
    @State private var readyIDs: Set<String> = []

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
                        selection = SimilarPhotoSelection(); submittedGroups = []; readyIDs = []
                        hasScanned = true; cancelled = false
                        service.start(assets.filter { !queuedIDs.contains($0.localIdentifier) })
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
                        .disabled(!selection.rejected.isSubset(of: readyIDs))
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
                            AssetImage(asset: asset, manager: manager, thumbnail: true, onReady: { ready in
                                if ready { readyIDs.insert(asset.localIdentifier) }
                                else { readyIDs.remove(asset.localIdentifier) }
                            })
                                .frame(height: 170).clipShape(RoundedRectangle(cornerRadius: 12))
                        }.accessibilityLabel("Foto groter bekijken")
                        if let date = asset.creationDate {
                            Text(date.formatted(date: .abbreviated, time: .standard)).font(.caption2)
                        }
                        Button {
                            selection.toggle(asset.localIdentifier, in: ids, ready: readyIDs)
                        } label: {
                            Label(selected ? "Wegleggen" : "Bewaren", systemImage: selected ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .tint(selected ? .orange : .green)
                        .disabled(!selected && (remaining <= 1 || !readyIDs.contains(asset.localIdentifier)))
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
            let rejects = group.assets.map(\.localIdentifier).filter { selection.rejected.contains($0) && readyIDs.contains($0) }
            guard !rejects.isEmpty, rejects.count < group.assets.count else { continue }
            ids.append(contentsOf: rejects)
            submittedGroups.insert(group.id)
        }
        guard !ids.isEmpty else { return }
        onTrash(ids)
        queuedIDs.formUnion(ids)
        queuedCount += ids.count
        selection = SimilarPhotoSelection()
    }

    private struct Preview: Identifiable {
        let asset: PHAsset
        var id: String { asset.localIdentifier }
    }
}

/// Near-duplicate stacks: the best shot is preselected (default effect), so one swipe settles the whole stack.
/// Big photo on top for the eyes, thumbnails in the thumb zone below for the hand.
struct StackReviewView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var skipped: Set<String> = []
    @State private var keep: Set<String> = []
    @State private var focused: String?
    @State private var currentID: String?
    @State private var drag: CGFloat = 0
    @State private var setAside = 0
    @State private var settled = 0
    @State private var review = false

    private var stacks: [[PHAsset]] {
        library.smart.stacks
            .map { ids in ids.compactMap { library.asset(id: $0) }.filter { library.state.decisions[$0.localIdentifier] == nil } }
            .filter { $0.count > 1 && !skipped.contains($0[0].localIdentifier) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .heavy)).foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44).pop(radius: 22, fill: Palette.surface, shadow: 2)
                    }.accessibilityLabel("Sluiten")
                    Spacer()
                    Text("Bijna dubbel").font(.system(.headline, design: .rounded).weight(.heavy))
                    Spacer()
                    Text(library.smart.finished ? "\(stacks.count) over" : " ").font(.subheadline.weight(.heavy)).monospacedDigit()
                        .frame(minWidth: 44)
                }
                if library.smart.scanning || !library.smart.finished {
                    scanningView
                } else if let group = stacks.first {
                    stackView(group)
                } else {
                    doneView
                }
            }
            .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 12)
            .foregroundStyle(Palette.ink)
            .background(Palette.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $review) { ReviewView().environmentObject(library) }
        }
        .onAppear { if !library.smart.finished && !library.smart.scanning { library.startSmartScan() } }
    }

    private var scanningView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "square.stack.3d.up.fill").font(.system(size: 54)).foregroundStyle(Palette.brand)
            Text("Bijna gelijke foto's zoeken").font(.system(.title2, design: .rounded).weight(.heavy))
            ProgressView(value: Double(library.smart.processed), total: Double(max(1, library.smart.total))).tint(Palette.brand)
            Text("\(library.smart.processed) van \(library.smart.total) recente foto's bekeken")
                .font(.subheadline.weight(.semibold)).monospacedDigit()
            Text("Dit gebeurt alleen op je iPhone, met kleine voorbeelden. Er wordt niets geüpload of verwijderd.")
                .font(.footnote).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Spacer()
        }
    }

    @ViewBuilder private func stackView(_ group: [PHAsset]) -> some View {
        let ids = group.map(\.localIdentifier)
        let best = library.bestInStack(ids) ?? ids[0]
        let shown = group.first { $0.localIdentifier == (focused ?? best) } ?? group[0]
        let trashCount = ids.filter { !keep.contains($0) }.count
        VStack(spacing: 12) {
            Text("\(group.count) bijna gelijke foto's").font(.system(size: 26, weight: .heavy, design: .rounded)).tracking(-0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
            ZStack(alignment: .topLeading) {
                AssetImage(asset: shown, manager: library.images)
                    .id(shown.localIdentifier)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.ink, lineWidth: 3))
                HStack(spacing: 6) {
                    if shown.localIdentifier == best {
                        Label(library.isFavorite(shown) ? "Favoriet" : "Beste keuze", systemImage: "star.fill")
                            .font(.caption.weight(.heavy)).padding(.horizontal, 10).padding(.vertical, 6)
                            .pop(radius: 10, fill: Palette.reward, shadow: 2)
                    }
                    Text(keep.contains(shown.localIdentifier) ? "Bewaren" : "Weg")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(keep.contains(shown.localIdentifier) ? Color.white : Palette.ink)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .pop(radius: 10, fill: keep.contains(shown.localIdentifier) ? Palette.keep : Palette.trash, shadow: 2)
                }.padding(12)
            }
            .frame(maxHeight: .infinity)
            .offset(x: drag)
            .rotationEffect(.degrees(reduceMotion ? 0 : Double(drag / 28)))
            .gesture(DragGesture(minimumDistance: 12)
                .onChanged { drag = $0.translation.width }
                .onEnded { value in
                    let width = value.translation.width
                    if width > 110 || value.predictedEndTranslation.width > 320 { confirm(ids) }
                    else if width < -110 || value.predictedEndTranslation.width < -320 { skip(ids) }
                    else { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 } }
                })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Foto \((ids.firstIndex(of: shown.localIdentifier) ?? 0) + 1) van \(ids.count)\(shown.localIdentifier == best ? ", beste keuze" : ""), \(keep.contains(shown.localIdentifier) ? "bewaren" : "weg")")
            .accessibilityAction(named: Text("Bevestigen")) { confirm(ids) }
            .accessibilityAction(named: Text("Overslaan")) { skip(ids) }

            Button {
                toggle(shown.localIdentifier, in: ids)
            } label: {
                Label(keep.contains(shown.localIdentifier) ? "Toch weg" : "Deze ook bewaren",
                      systemImage: keep.contains(shown.localIdentifier) ? "xmark" : "checkmark")
            }
            .buttonStyle(SecondaryStyle())
            .disabled(keep.contains(shown.localIdentifier) && keep.count == 1)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(group, id: \.localIdentifier) { asset in
                        let id = asset.localIdentifier
                        Button { focused = id } label: {
                            AssetImage(asset: asset, manager: library.images, thumbnail: true)
                                .frame(width: 68, height: 68)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12)
                                    .stroke(keep.contains(id) ? Palette.keep : Palette.ink, lineWidth: keep.contains(id) ? 4 : 2))
                                .overlay(alignment: .bottomTrailing) {
                                    Image(systemName: keep.contains(id) ? "checkmark.circle.fill" : "xmark.circle.fill")
                                        .font(.system(size: 20)).foregroundStyle(keep.contains(id) ? Palette.keep : Palette.trash)
                                        .background(Circle().fill(.white)).padding(3)
                                }
                                .opacity(focused == id || (focused == nil && id == best) ? 1 : 0.75)
                        }
                        .accessibilityLabel("Foto bekijken, \(keep.contains(id) ? "bewaren" : "weg")")
                    }
                }.padding(.vertical, 4).padding(.horizontal, 2)
            }

            Button("Hou \(keep.count), leg \(trashCount) weg") { confirm(ids) }
                .buttonStyle(PrimaryStyle(fill: Palette.keep, text: .white))
            HStack {
                Button("Sla over") { skip(ids) }.font(.subheadline.weight(.bold)).foregroundStyle(Palette.brand).frame(minHeight: 44)
                Spacer()
                Text("Weggelegd gaat eerst naar Bekijken").font(.caption).foregroundStyle(Palette.muted)
            }
        }
        .onAppear { reset(ids, best: best) }
        .onChange(of: ids.first) { _, _ in reset(ids, best: best) }
    }

    private var doneView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark").font(.system(size: 38, weight: .heavy))
                .frame(width: 84, height: 84).background(Circle().fill(Palette.reward))
                .overlay(Circle().stroke(Palette.ink, lineWidth: 3))
            Text(settled == 0 ? "Geen bijna-dubbele foto's gevonden" : "Alle stapels gedaan")
                .font(.system(.title2, design: .rounded).weight(.heavy)).multilineTextAlignment(.center)
            if setAside > 0 {
                Text("\(setAside) foto's weggelegd. Controleer ze in Bekijken voordat je iets verwijdert.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                Button("Bekijk selectie") { review = true }.buttonStyle(PrimaryStyle(fill: Palette.trash, text: Palette.ink))
            }
            Button("Opnieuw zoeken") { skipped = []; library.startSmartScan() }.font(.subheadline.weight(.bold)).foregroundStyle(Palette.brand)
            Button("Terug") { dismiss() }.buttonStyle(SecondaryStyle())
            Spacer()
        }
    }

    private func reset(_ ids: [String], best: String) {
        guard currentID != ids.first else { return }
        currentID = ids.first
        keep = [best]
        focused = best
        drag = 0
    }
    private func toggle(_ id: String, in ids: [String]) {
        if keep.contains(id) {
            guard keep.count > 1 else { return }
            keep.remove(id)
        } else { keep.insert(id) }
        Haptics.threshold()
    }
    private func confirm(_ ids: [String]) {
        let trashed = ids.filter { !keep.contains($0) }.count
        let keepers = keep
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { drag = 600 }
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0 : 0.15)) {
            library.applyStack(ids, keep: keepers)
            setAside += trashed
            settled += 1
            drag = 0
        }
    }
    private func skip(_ ids: [String]) {
        Haptics.choice(.later)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { drag = -600 }
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0 : 0.15)) {
            skipped.insert(ids[0])
            drag = 0
        }
    }
}
