import SwiftUI
import Photos

struct ContentView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.scenePhase) private var scenePhase
    @State private var review = false
    @State private var info = false
    @State private var limitedPicker = false
    @State private var categoryPicker = false
    @State private var tool: MediaTool?
    @State private var comparing = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                header
                if library.hasAccess { libraryContent }
                else { permissionContent }
            }
            .padding(.horizontal, 22).padding(.top, 10)
            .background(Palette.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $review) { ReviewView().environmentObject(library) }
            .sheet(isPresented: $info) { InfoView() }
            .sheet(item: $tool) { destination in
                switch destination {
                case .album(let asset): AlbumDestinationView(asset: asset).environmentObject(library)
                case .preview(let asset): AssetPreviewView(asset: asset, manager: library.images)
                }
            }
            .sheet(isPresented: $comparing) {
                SimilarPhotosView(assets: library.comparisonAssets, manager: library.images) { library.queueForReview($0) }
            }
            .sheet(isPresented: $categoryPicker) { CategoryPickerView().environmentObject(library) }
            .sheet(isPresented: $limitedPicker, onDismiss: { library.refresh() }) {
                LimitedLibraryPicker { limitedPicker = false; library.refresh() }
                    .ignoresSafeArea()
            }
            .alert("Fotoswipe", isPresented: Binding(get: { library.message != nil && !review }, set: { if !$0 { library.message = nil } })) {
                Button("OK") { library.message = nil }
            } message: { Text(library.message ?? "") }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { library.activate() }
                else { library.finishPendingWrites() }
            }
        }
    }
    private var header: some View {
        HStack {
            Image(systemName: "rectangle.on.rectangle.angled")
                .font(.title2).padding(10).background(Palette.sage, in: RoundedRectangle(cornerRadius: 12))
            Text("fotoswipe").font(.system(size: 27, weight: .bold, design: .rounded)).tracking(-1)
            Spacer()
            Button { info = true } label: { Image(systemName: "info.circle").font(.title3).frame(width: 44, height: 44) }
                .accessibilityLabel("Over Fotoswipe")
        }.foregroundStyle(Palette.ink)
    }
    private var permissionContent: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "photo.stack").font(.system(size: 64)).foregroundStyle(Palette.muted)
            Text("Bewaar het mooie.\nSwipe de rest.")
                .font(.system(size: 38, weight: .semibold, design: .rounded)).tracking(-1.5).multilineTextAlignment(.center)
            Text("Maak ruimte voor nieuwe herinneringen. Je foto's blijven in je eigen fotobibliotheek.")
                .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            if library.authorization == .notDetermined {
                Button("Kies toegang tot je foto's") { library.requestAccess() }.buttonStyle(PrimaryStyle())
                Text("Kies volledige toegang voor je hele bibliotheek, of geef alleen toegang tot geselecteerde foto's.")
                    .font(.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            } else if library.authorization == .restricted {
                Text("Fototoegang is beperkt op dit apparaat. Controleer Schermtijd of het apparaatbeheer.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            } else {
                Text("Geef Fotoswipe toegang bij Instellingen om te beginnen.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                Button("Open Instellingen") { openSettings() }.buttonStyle(PrimaryStyle())
            }
            Spacer()
            Text("Geen login. Geen abonnement. Geen eigen server.")
                .font(.caption).foregroundStyle(Palette.muted).padding(.bottom, 20)
        }.foregroundStyle(Palette.ink)
    }
    private var libraryContent: some View {
        VStack(spacing: 14) {
            Button { categoryPicker = true } label: {
                HStack(spacing: 12) {
                    Image(systemName: library.selectedCategory.icon).font(.title3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Categorie").font(.caption).foregroundStyle(Palette.muted)
                        Text(library.selectedCategory.title).font(.headline).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.down").font(.subheadline.bold())
                }.foregroundStyle(Palette.ink).padding(14)
                    .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
            }.disabled(library.deleting)
                .accessibilityLabel("Categorie kiezen: \(library.selectedCategory.title)")
            if library.authorization == .limited {
                HStack {
                    Text("Alleen geselecteerde foto's").font(.caption)
                    Spacer()
                    Button("Wijzig") { limitedPicker = true }.font(.caption.bold())
                }.padding(12).background(Palette.sage.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
            }
            if let warning = library.persistenceWarning {
                Text(warning).font(.caption).foregroundStyle(.red).accessibilityLabel("Waarschuwing: \(warning)")
            }
            HStack {
                Menu {
                    Picker("Volgorde", selection: Binding(get: { library.order }, set: { library.selectOrder($0) })) {
                        ForEach(PhotoOrder.allCases) { order in Text(order.title).tag(order) }
                    }
                } label: { Label(library.order.title, systemImage: "arrow.up.arrow.down").font(.caption) }
                    .disabled(library.loading || library.deleting)
                Spacer()
                Menu {
                    if let asset = library.current {
                        Button { library.deferCurrent() } label: { Label("Later beslissen", systemImage: "bookmark") }
                        Button { library.toggleFavorite() } label: {
                            Label(library.isFavorite(asset) ? "Verwijder favoriet in Foto's" : "Maak favoriet in Foto's", systemImage: "star")
                        }
                        Button { tool = .album(asset) } label: { Label("Voeg toe aan album", systemImage: "rectangle.stack.badge.plus") }
                        Button { tool = .preview(asset) } label: {
                            Label(asset.mediaType == .video ? "Video afspelen" : "Foto groter bekijken", systemImage: asset.mediaType == .video ? "play.circle" : "arrow.up.left.and.arrow.down.right")
                        }
                    }
                    Button { comparing = true } label: { Label("Vergelijkbare foto's", systemImage: "square.on.square") }
                } label: { Label("Meer", systemImage: "ellipsis.circle").font(.subheadline) }
                    .disabled(library.deleting || library.loading || library.mutating)
            }.foregroundStyle(Palette.muted)
            if let status = library.status { Text(status).font(.caption).foregroundStyle(Palette.muted).accessibilityAddTraits(.updatesFrequently) }
            HStack {
                Text("\(library.reviewed) van \(library.assets.count) bekeken")
                Spacer()
                Text("\(library.keptInCategory) bewaard")
            }.font(.caption).foregroundStyle(Palette.muted)
            ProgressView(value: Double(library.reviewed), total: Double(max(1, library.assets.count)))
                .tint(Palette.muted).accessibilityLabel("Voortgang")
            if library.loading {
                Spacer()
                ProgressView("Je bibliotheek ophalen…").tint(Palette.muted)
                Spacer()
            } else if library.current != nil {
                ZStack {
                    ForEach(Array(library.deck.reversed()), id: \.localIdentifier) { asset in
                        SmoothSwipeCard(
                            asset: asset, manager: library.images, pipeline: library.imagePipeline,
                            favorite: library.isFavorite(asset), revision: library.deckRevision,
                            depth: library.deck.firstIndex(where: { $0.localIdentifier == asset.localIdentifier }) ?? 0,
                            command: library.swipeCommand,
                            disabled: library.deleting || library.loading || library.mutating,
                            onOpen: { tool = .preview(asset) }
                        ) { choice, id, revision in library.decide(choice, expectedID: id, expectedRevision: revision) }
                    }
                }
                .id(library.deckRevision)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(minHeight: 160)
                Text("← wegleggen     ·     bewaren →").font(.caption).foregroundStyle(Palette.muted)
                SwipeControls(pipeline: library.imagePipeline).environmentObject(library)

            } else {
                Spacer()
                Image(systemName: library.assets.isEmpty ? "photo" : "sparkles").font(.system(size: 52)).foregroundStyle(Palette.muted)
                Text(library.assets.isEmpty ? "Geen items in deze categorie" : "Alles bekeken.")
                    .font(.largeTitle.bold()).foregroundStyle(Palette.ink)
                Text(library.assets.isEmpty ? "Kies een andere categorie of pas je fototoegang aan." : "Deze categorie is klaar. Kies een andere categorie of controleer je selectie.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                if library.canUndo { Button("Laatste keuze terugzetten") { library.undo() }.buttonStyle(.bordered) }
                if library.keptInCategory > 0 {
                    Button("Bewaarde items opnieuw bekijken") { library.reviewKeptAgain() }.buttonStyle(.bordered)
                }
                Button("Ververs bibliotheek") { library.refresh() }.font(.caption)
                Spacer()
            }
            Button { review = true } label: {
                HStack {
                    Image(systemName: "tray")
                    Text("\(library.pending.count) weggelegd · alle categorieën")
                    Spacer()
                    Text("Bekijken").fontWeight(.semibold)
                    Image(systemName: "arrow.up.right")
                }.font(.subheadline).padding(17)
                    .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.sage))
            }.foregroundStyle(Palette.ink).disabled(library.loading || library.deleting)
            Text("Een swipe verwijdert nog niets.").font(.caption2).foregroundStyle(Palette.muted)
                .padding(.bottom, 10)
        }
    }
    private func circleButton(_ title: String, icon: String, color: Color, size: CGFloat = 64, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size / 2.7, weight: .medium))
                .frame(width: size, height: size).background(color, in: Circle())
        }.foregroundStyle(Palette.ink).accessibilityLabel(title)
    }
    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

struct PrimaryStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).padding(.vertical, 17).padding(.horizontal, 24)
            .frame(maxWidth: .infinity).foregroundStyle(.white)
            .background(Palette.ink.opacity(configuration.isPressed ? 0.75 : 1), in: Capsule())
    }
}


/// Gesture state stays local: dragging never invalidates library lists or counters.
private struct SmoothSwipeCard: View {
    let asset: PHAsset
    let manager: PHCachingImageManager
    @ObservedObject var pipeline: SwipeImagePipeline
    let favorite: Bool
    let revision: UUID
    let depth: Int
    let command: SwipeCommand?
    let disabled: Bool
    let onOpen: () -> Void
    let onCommit: (PhotoDecision, String, UUID) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var offset: CGFloat = 0
    @State private var exiting = false
    private var isTop: Bool { depth == 0 }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                BufferedAssetImage(asset: asset, pipeline: pipeline)
                if asset.mediaType == .video && isTop && pipeline.isReady(asset.localIdentifier) {
                    Button(action: onOpen) {
                        Image(systemName: "play.circle.fill").font(.system(size: 60))
                            .foregroundStyle(.white).shadow(radius: 8)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                        .accessibilityLabel("Video afspelen")
                }
                LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom)
                    .allowsHitTesting(false)
                VStack(alignment: .leading, spacing: 5) {
                    if favorite { Label("Favoriet", systemImage: "heart.fill").font(.caption) }
                    Text(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "Zonder datum")
                        .font(.headline)
                    Text(asset.mediaType == .video ? "Video · \(Int(asset.duration) / 60):\(String(format: "%02d", Int(asset.duration) % 60))" : "\(asset.pixelWidth) × \(asset.pixelHeight)").font(.caption).opacity(0.8)
                }.foregroundStyle(.white).padding(22).allowsHitTesting(false)
                VStack {
                    Text(offset >= 0 ? "BEWAREN" : "WEGLEGGEN")
                        .font(.title2.bold()).padding(12)
                        .background(offset >= 0 ? Palette.sage : Palette.coral, in: RoundedRectangle(cornerRadius: 10))
                        .opacity(isTop ? min(abs(offset) / 90, 1) : 0)
                    Spacer()
                }.padding(24).allowsHitTesting(false)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26))
            .shadow(color: .black.opacity(0.1), radius: 12, y: 6)
            .scaleEffect(1 - CGFloat(depth) * 0.025)
            .offset(x: isTop ? offset : 0, y: CGFloat(depth) * 5)
            .rotationEffect(.degrees(reduceMotion || !isTop ? 0 : Double(offset / 24)))
            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.88), value: depth)
            .contentShape(Rectangle())
            .allowsHitTesting(isTop && !disabled && !exiting)
            .gesture(DragGesture(minimumDistance: 5)
                .onChanged { value in
                    guard isTop, !disabled, !exiting, pipeline.isReady(asset.localIdentifier) else { return }
                    offset = value.translation.width
                }
                .onEnded { value in
                    guard isTop, !disabled, !exiting, pipeline.isReady(asset.localIdentifier) else { return }
                    let distance = value.translation.width
                    let predicted = value.predictedEndTranslation.width
                    let threshold = max(65, geometry.size.width * 0.23)
                    if abs(distance) > threshold || (abs(distance) > 18 && abs(predicted) > geometry.size.width * 0.65) {
                        let travel = abs(distance) > threshold ? distance : predicted
                        commit(travel > 0 ? .keep : .trash, width: geometry.size.width)
                    } else {
                        withAnimation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.85)) { offset = 0 }
                    }
                })
            .onChange(of: command?.id) { _, _ in
                guard isTop, let command, command.assetID == asset.localIdentifier else { return }
                commit(command.choice, width: geometry.size.width)
            }
            .onChange(of: isTop) { _, _ in offset = 0; exiting = false }
            .accessibilityElement(children: .ignore)
            .accessibilityHidden(!isTop)
            .accessibilityLabel("Item van \(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "onbekende datum")\(favorite ? ", favoriet" : "")")
            .accessibilityAction(named: Text(asset.mediaType == .video ? "Video afspelen" : "Groter bekijken")) { onOpen() }
            .accessibilityAction(named: Text("Bewaren")) { commit(.keep, width: geometry.size.width) }
            .accessibilityAction(named: Text("Wegleggen")) { commit(.trash, width: geometry.size.width) }
        }.zIndex(Double(3 - depth))
    }
    private func commit(_ choice: PhotoDecision, width: CGFloat) {
        guard isTop, !disabled, !exiting, pipeline.isReady(asset.localIdentifier) else { return }
        exiting = true
        let id = asset.localIdentifier
        if reduceMotion { onCommit(choice, id, revision); return }
        withAnimation(.easeOut(duration: 0.12), completionCriteria: .logicallyComplete) {
            offset = (choice == .keep ? 1 : -1) * max(width * 1.6, 600)
        } completion: {
            // The next card is already mounted with its decoded image.
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { onCommit(choice, id, revision) }
        }
    }
}


private struct CategoryPickerView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    private var filtered: [PhotoCategory] {
        library.categories.filter { search.isEmpty || $0.title.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(filtered.filter { !$0.isAlbum && !$0.isMonth }) { category in row(category) }
                } header: { Text("Categorieën") }
                Section {
                    ForEach(filtered.filter(\.isAlbum)) { category in row(category) }
                } header: { Text("Je albums") } footer: {
                    Text(library.authorization == .limited
                         ? "Bij beperkte fototoegang zijn sommige categorieën en albums niet beschikbaar. Via Wijzig of Instellingen pas je de toegang aan."
                         : "Je albums komen uit Foto's. Je kunt foto's, Live Photos en video's beoordelen.")
                }
                Section("Per maand") {
                    ForEach(filtered.filter(\.isMonth)) { category in row(category) }
                }
                Section {
                    Text("Je keuzes blijven behouden als je wisselt. Weggelegde items uit alle categorieën controleer je samen in Bekijken.")
                        .font(.footnote).foregroundStyle(Palette.muted)
                }
            }
            .searchable(text: $search, prompt: "Zoek een categorie of album")
            .navigationTitle("Kies een categorie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
    }
    private func row(_ category: PhotoCategory) -> some View {
        Button {
            library.selectCategory(category)
            dismiss()
        } label: {
            HStack {
                Label(category.title, systemImage: category.icon)
                Spacer()
                if let progress = library.monthProgress[category.id] {
                    Text("\(progress.reviewed)/\(progress.total)").font(.caption).foregroundStyle(Palette.muted)
                    if progress.total == progress.reviewed { Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.muted) }
                }
                if category.id == library.selectedCategory.id {
                    Image(systemName: "checkmark").fontWeight(.semibold)
                }
            }.foregroundStyle(Palette.ink).padding(.vertical, 5)
        }.accessibilityAddTraits(category.id == library.selectedCategory.id ? .isSelected : [])
    }
}


private enum MediaTool: Identifiable {
    case album(PHAsset), preview(PHAsset)
    var id: String {
        switch self { case .album(let asset): return "album-" + asset.localIdentifier
        case .preview(let asset): return "preview-" + asset.localIdentifier }
    }
}

/// Only this child observes image-ready changes; no library-wide redraw on every decoded preview.
private struct SwipeControls: View {
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject var pipeline: SwipeImagePipeline
    private var ready: Bool { library.current.map { pipeline.isReady($0.localIdentifier) } ?? false }
    var body: some View {
        HStack(spacing: 28) {
            control("Laatste keuze ongedaan maken", icon: "arrow.uturn.backward", color: .gray.opacity(0.1), size: 46) { library.undo() }
                .disabled(!library.canUndo || library.mutating)
            control("Item wegleggen", icon: "xmark", color: Palette.coral, size: 64) { library.requestSwipe(.trash) }
                .disabled(!ready || library.mutating)
            control("Item bewaren", icon: "heart", color: Palette.sage, size: 64) { library.requestSwipe(.keep) }
                .disabled(!ready || library.mutating)
        }.disabled(library.deleting || library.loading)
    }
    private func control(_ title: String, icon: String, color: Color, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size / 2.7, weight: .medium))
                .frame(width: size, height: size).background(color, in: Circle())
        }.foregroundStyle(Palette.ink).accessibilityLabel(title)
    }
}
