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
                    Button(hasScanned ? String(localized: "Opnieuw scannen", bundle: .app) : String(localized: "Zoek vergelijkbare foto's", bundle: .app)) {
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
                    ContentUnavailableView(queuedCount > 0 ? String(localized: "Selectie weggelegd", bundle: .app) : String(localized: "Geen kandidaten gevonden", bundle: .app), systemImage: "photo.on.rectangle.angled",
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
                            Text(date.formatted(Date.FormatStyle(date: .abbreviated, time: .standard, locale: AppLocale.locale))).font(.caption2)
                        }
                        Button {
                            selection.toggle(asset.localIdentifier, in: ids, ready: readyIDs)
                        } label: {
                            Label(selected ? String(localized: "Wegleggen", bundle: .app) : String(localized: "Bewaren", bundle: .app), systemImage: selected ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .tint(selected ? .orange : .green)
                        .disabled(!selected && (remaining <= 1 || !readyIDs.contains(asset.localIdentifier)))
                        .accessibilityLabel(selected ? String(localized: "Weggelegd; tik om te bewaren", bundle: .app) : String(localized: "Bewaard; tik om weg te leggen", bundle: .app))
                        .accessibilityHint(!selected && remaining <= 1 ? String(localized: "Minstens één foto per groep blijft bewaard", bundle: .app) : "")
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
    var group: SmartGroup = .similar
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

    private var loadingGroup: Bool {
        group == .bursts ? !library.burstsLoaded : (library.smart.scanning || !library.smart.finished)
    }
    private var stacks: [[PHAsset]] {
        library.stacks(for: group)
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
                    Text(group.title).font(.system(.headline, design: .rounded).weight(.heavy))
                    Spacer()
                    Text(!loadingGroup ? String(localized: "\(stacks.count) over", bundle: .app) : " ").font(.subheadline.weight(.heavy)).monospacedDigit()
                        .frame(minWidth: 44)
                }
                if !library.hasAccess {
                    Spacer()
                    Text("Geef Fotoswipe eerst toegang tot je foto's.").font(.headline).multilineTextAlignment(.center)
                    Spacer()
                } else if loadingGroup {
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
        .onAppear {
            if group == .bursts { library.loadBursts() }
            else if !library.smart.finished && !library.smart.scanning { library.startSmartScan() }
        }
    }

    private var scanningView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: group.icon).font(.system(size: 54)).foregroundStyle(Palette.brand)
            Text(group == .bursts ? String(localized: "Burstfoto's ophalen", bundle: .app) : String(localized: "\(group.title) zoeken", bundle: .app)).font(.system(.title2, design: .rounded).weight(.heavy))
            if group == .bursts {
                ProgressView().tint(Palette.brand)
            } else {
                ProgressView(value: Double(library.smart.processed), total: Double(max(1, library.smart.total))).tint(Palette.brand)
                Text("\(library.smart.processed) van \(library.smart.total) recente foto's bekeken")
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
            }
            Text("Dit gebeurt alleen op je iPhone, met kleine voorbeelden. Er wordt niets geüpload of verwijderd.")
                .font(.footnote).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Spacer()
        }
    }

    @ViewBuilder private func stackView(_ group: [PHAsset]) -> some View {
        let ids = group.map(\.localIdentifier)
        let suggested = library.defaultKeep(for: ids, in: self.group)
        let best = ids.first { suggested.contains($0) } ?? ids[0]
        let shown = group.first { $0.localIdentifier == (focused ?? best) } ?? group[0]
        let trashCount = ids.filter { !keep.contains($0) }.count
        VStack(spacing: 12) {
            Text(headline(group.count)).font(.system(size: 26, weight: .heavy, design: .rounded)).tracking(-0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
            ZStack(alignment: .topLeading) {
                AssetImage(asset: shown, manager: library.images)
                    .id(shown.localIdentifier)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.ink, lineWidth: 3))
                HStack(spacing: 6) {
                    if suggested.contains(shown.localIdentifier) {
                        Label(library.isFavorite(shown) ? String(localized: "Favoriet", bundle: .app) : (self.group == .bursts ? String(localized: "Gekozen door iOS", bundle: .app) : String(localized: "Beste keuze", bundle: .app)), systemImage: "star.fill")
                            .font(.caption.weight(.heavy)).padding(.horizontal, 10).padding(.vertical, 6)
                            .pop(radius: 10, fill: Palette.reward, shadow: 2)
                    }
                    Text(keep.contains(shown.localIdentifier) ? String(localized: "Bewaren", bundle: .app) : String(localized: "Weg", bundle: .app))
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
            .accessibilityLabel(String(localized: "Foto \((ids.firstIndex(of: shown.localIdentifier) ?? 0) + 1) van \(ids.count)", bundle: .app) + (shown.localIdentifier == best ? String(localized: ", beste keuze", bundle: .app) : "") + ", " + (keep.contains(shown.localIdentifier) ? String(localized: "bewaren", bundle: .app) : String(localized: "weg", bundle: .app)))
            .accessibilityAction(named: Text("Bevestigen")) { confirm(ids) }
            .accessibilityAction(named: Text("Overslaan")) { skip(ids) }

            Button {
                toggle(shown.localIdentifier, in: ids)
            } label: {
                Label(keep.contains(shown.localIdentifier) ? String(localized: "Toch weg", bundle: .app) : String(localized: "Deze ook bewaren", bundle: .app),
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
        .onAppear { reset(ids, keep: suggested) }
        .onChange(of: ids.first) { _, _ in reset(ids, keep: suggested) }
    }

    private var doneView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark").font(.system(size: 38, weight: .heavy))
                .frame(width: 84, height: 84).background(Circle().fill(Palette.reward))
                .overlay(Circle().stroke(Palette.ink, lineWidth: 3))
            Text(settled == 0 ? String(localized: "Niets gevonden in \(group.title)", bundle: .app) : String(localized: "Alle stapels gedaan", bundle: .app))
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

    private func headline(_ count: Int) -> String {
        switch group {
        case .bursts: return String(localized: "\(count) foto's in deze burst", bundle: .app)
        case .copies: return String(localized: "\(count) keer dezelfde foto", bundle: .app)
        default: return String(localized: "\(count) bijna gelijke foto's", bundle: .app)
        }
    }
    private func reset(_ ids: [String], keep suggested: Set<String>) {
        guard currentID != ids.first else { return }
        currentID = ids.first
        keep = suggested.isEmpty ? [ids[0]] : suggested
        focused = ids.first { keep.contains($0) }
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

/// "Slim opruimen": every smart group with its count and estimated size, biggest win first.
/// One tap opens a group; stack groups open stacks, the rest open as a normal swipe category.
struct SmartCleanView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    let onOpenCategory: (String) -> Void
    @State private var stackGroup: SmartGroup?
    @State private var placesOpen = false
    @State private var contactsOpen = false

    private var ordered: [SmartGroup] {
        SmartGroup.allCases.sorted { lhs, rhs in
            let l = library.smartSummary[lhs]?.bytes ?? -1, r = library.smartSummary[rhs]?.bytes ?? -1
            return l == r ? lhs.rawValue < rhs.rawValue : l > r
        }
    }
    private var totalBytes: Int64 { library.smartSummary.values.reduce(0) { $0 + $1.bytes } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Grootste winst eerst. Alles gebeurt op je iPhone, en jij beslist per foto of per stapel.")
                        .font(.subheadline).foregroundStyle(Palette.muted)
                    if library.smart.scanning {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Foto's analyseren…").font(.subheadline.weight(.heavy))
                            ProgressView(value: Double(library.smart.processed), total: Double(max(1, library.smart.total))).tint(Palette.brand)
                            Text("\(library.smart.processed) van \(library.smart.total)").font(.caption).foregroundStyle(Palette.muted).monospacedDigit()
                        }
                        .padding(12).pop(radius: 14, fill: Palette.surface, shadow: 2)
                    } else if totalBytes > 0 {
                        Text("Samen ongeveer \(ByteText.plain(totalBytes)) te winnen")
                            .font(.headline.weight(.heavy))
                    }
                    ForEach(ordered) { group in
                        let entry = library.smartSummary[group]
                        let pendingScan = group.needsScan && !library.smart.finished
                        let pendingBursts = group == .bursts && !library.burstsLoaded
                        let empty = !(pendingScan || pendingBursts) && (entry?.count ?? 0) == 0
                        Button { open(group) } label: { card(group, entry: entry, waiting: pendingScan || pendingBursts, empty: empty) }
                            .buttonStyle(.plain)
                            .disabled(empty || pendingScan || pendingBursts)
                    }
                    Text("Meer opruimen").font(.headline.weight(.heavy)).padding(.top, 8)
                    Button { placesOpen = true } label: {
                        extraCard("map.fill", String(localized: "Reiskaart", bundle: .app), String(localized: "Je foto's per plek en reis. Ruim één reis tegelijk op.", bundle: .app))
                    }.buttonStyle(.plain)
                    Button { contactsOpen = true } label: {
                        extraCard("person.2.fill", String(localized: "Dubbele contacten", bundle: .app), String(localized: "Contacten die er twee keer in staan samenvoegen.", bundle: .app))
                    }.buttonStyle(.plain)
                    tips
                }
                .padding(20).foregroundStyle(Palette.ink)
                .frame(maxWidth: 640).frame(maxWidth: .infinity)
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Slim opruimen").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
            .sheet(isPresented: $placesOpen) { PlacesView(onOpen: onOpenCategory).environmentObject(library) }
            .sheet(isPresented: $contactsOpen) { DuplicateContactsView() }
            .fullScreenCover(item: $stackGroup, onDismiss: { library.updateSmartSummary() }) { group in
                StackReviewView(group: group).environmentObject(library)
            }
        }
        .onAppear {
            library.loadBursts()
            if !library.smart.finished && !library.smart.scanning { library.startSmartScan() }
            library.updateSmartSummary()
        }
    }

    private func open(_ group: SmartGroup) {
        if group.isStack { stackGroup = group }
        else { onOpenCategory(group.rawValue) }
    }

    private func card(_ group: SmartGroup, entry: (count: Int, bytes: Int64)?, waiting: Bool, empty: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: group.icon).font(.system(size: 18, weight: .heavy))
                .foregroundStyle(group.isStack ? Color.white : Palette.ink)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(group.isStack ? Palette.brand : Palette.reward))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.title).font(.headline.weight(.heavy))
                Text(group.detail).font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                if waiting {
                    ProgressView().tint(Palette.brand)
                } else if empty {
                    Text("Niets").font(.subheadline.weight(.bold)).foregroundStyle(Palette.muted)
                } else if let entry {
                    Text("\(entry.count)").font(.headline.weight(.heavy)).monospacedDigit()
                    Text(ByteText.format(entry.bytes)).font(.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                }
            }
            if !empty && !waiting { Image(systemName: "chevron.right").font(.caption.weight(.heavy)).foregroundStyle(Palette.muted) }
        }
        .padding(12)
        .pop(radius: 16, fill: Palette.surface, shadow: empty ? 0 : 3)
        .opacity(empty ? 0.55 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityHint(empty ? String(localized: "Niets gevonden", bundle: .app) : String(localized: "Openen", bundle: .app))
    }

    private func extraCard(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 18, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(Palette.keep))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline.weight(.heavy))
                Text(detail).font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            Image(systemName: "chevron.right").font(.caption.weight(.heavy)).foregroundStyle(Palette.muted)
        }
        .padding(12)
        .pop(radius: 16, fill: Palette.surface, shadow: 3)
        .accessibilityElement(children: .combine)
    }

    private var tips: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Goed om te weten").font(.headline.weight(.heavy)).padding(.top, 8)
            tip("trash.slash", String(localized: "Ruimte komt pas vrij na 'Recent verwijderd'", bundle: .app), String(localized: "Verwijderde foto's blijven 30 dagen in Foto's > Albums > Recent verwijderd. Wil je de ruimte meteen? Kies daar Verwijder alles. Een app mag dat album niet zelf legen.", bundle: .app))
            tip("square.on.square", String(localized: "Exacte duplicaten samenvoegen", bundle: .app), String(localized: "Ook de Foto's-app vindt exacte duplicaten: Albums > Duplicaten > Voeg samen.", bundle: .app))
            tip("film", String(localized: "Video's en Live Photos", bundle: .app), String(localized: "Open een video of Live Photo en kies via Meer 'Video verkleinen' of 'Bewaar als gewone foto'. Het origineel gaat eerst naar Weggelegd.", bundle: .app))
        }
    }
    private func tip(_ icon: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 16, weight: .heavy)).foregroundStyle(Palette.brand).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.heavy))
                Text(text).font(.footnote).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
