import SwiftUI
import Photos
import StoreKit

struct ContentView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.scenePhase) private var scenePhase
    @State private var review = false
    @State private var info = false
    @State private var limitedPicker = false
    @State private var categoryPicker = false
    @State private var tool: MediaTool?
    @State private var comparing = false

    @State private var reviewAfterSession = false
    @State private var focus = false
    @State private var stacksOpen = false
    @State private var keepRestConfirm = false
    @State private var stats = false
    @State private var smartOpen = false
    @State private var whatsNew = false
    @AppStorage("fotoswipe.whatsNewSeen") private var whatsNewSeen = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                header
                if library.hasAccess { libraryContent }
                else if library.authorization == .notDetermined { OnboardingView(onAllow: { library.requestAccess() }, startPage: onboardingStartPage) }
                else { permissionContent }
            }
            .padding(.horizontal, 20).padding(.top, 8)
            .background(Palette.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $review) { ReviewView().environmentObject(library) }
            .sheet(isPresented: $info) { InfoView().environmentObject(library) }
            .sheet(isPresented: $stats) { StatsView().environmentObject(library) }
            .sheet(isPresented: $smartOpen) {
                SmartCleanView { id in
                    smartOpen = false
                    if let category = library.category(id) { library.selectCategory(category) }
                }.environmentObject(library)
            }
            .sheet(isPresented: $whatsNew, onDismiss: { whatsNewSeen = WhatsNewView.version }) {
                WhatsNewView { tryStacks in
                    whatsNewSeen = WhatsNewView.version
                    whatsNew = false
                    if tryStacks { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { smartOpen = true } }
                }
            }
            .confirmationDialog("De overige \(library.remainingInCategory) items in \(library.selectedCategory.title) bewaren?", isPresented: $keepRestConfirm, titleVisibility: .visible) {
                Button("Bewaar de rest") { library.keepRemaining() }
                Button("Annuleren", role: .cancel) {}
            } message: { Text("Er wordt niets verwijderd. Je kunt het per item terugdraaien in Bekijken.") }
            #if DEBUG
            .task { await openDebugScreen() }
            #endif
            .onAppear {
                // Only for people updating, not on a first install.
                if whatsNewSeen != WhatsNewView.version && library.hasAccess && !library.state.decisions.isEmpty {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { whatsNew = true }
                } else if whatsNewSeen.isEmpty { whatsNewSeen = WhatsNewView.version }
            }
            .onReceive(Reminders.shared.$openOnThisDay) { open in
                guard open else { return }
                Reminders.shared.openOnThisDay = false
                review = false; info = false; stacksOpen = false
                library.openOnThisDay()
                focus = true
            }
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
            .fullScreenCover(isPresented: $focus) { FocusSwipeView().environmentObject(library) }
            .fullScreenCover(isPresented: $stacksOpen) { StackReviewView().environmentObject(library) }
            .sheet(isPresented: Binding(get: { library.sessionFinished && !focus && !stacksOpen && !smartOpen }, set: { library.sessionFinished = $0 }), onDismiss: {
                library.startNewSession()
                if reviewAfterSession { reviewAfterSession = false; review = true }
            }) {
                SessionEndView { openReview in
                    reviewAfterSession = openReview
                    library.sessionFinished = false
                }.environmentObject(library)
            }
            .alert("Fotoswipe", isPresented: Binding(get: { library.message != nil && !review && !library.sessionFinished && !focus && !stacksOpen && !smartOpen }, set: { if !$0 { library.message = nil } })) {
                Button("OK") { library.message = nil }
            } message: { Text(library.message ?? "") }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { library.activate() }
                else { library.finishPendingWrites() }
            }
        }
    }
    private var header: some View {
        HStack(spacing: 10) {
            Text("fotoswipe").font(.system(size: 28, weight: .heavy, design: .rounded)).tracking(-1)
                .foregroundStyle(Palette.brand).lineLimit(1).minimumScaleFactor(0.7).layoutPriority(1)
            Spacer()
            if library.hasAccess {
                let days = library.streakDays
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill")
                    Text("\(days)").monospacedDigit()
                }
                .font(.subheadline.weight(.heavy)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .pop(radius: 18, fill: days > 0 ? Palette.reward : Palette.surface, shadow: 2)
                .contentShape(Rectangle())
                .onTapGesture { stats = true }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Reeks: \(days) dagen. Eén dag overslaan mag.")
                .accessibilityHint("Opent je overzicht")
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { stats = true }
            }
            if library.hasAccess {
                Button { focus = true } label: {
                    Label("Focus", systemImage: "arrow.up.left.and.arrow.down.right").font(.subheadline.weight(.heavy)).lineLimit(1)
                        .foregroundStyle(.white).padding(.horizontal, 12).frame(minHeight: 36)
                        .pop(radius: 18, fill: Palette.brand, shadow: 2)
                }
                .disabled(library.loading || library.current == nil)
                .accessibilityLabel("Focusmodus: alleen de foto, volledig scherm")
            }
            Button { info = true } label: { Image(systemName: "info.circle").font(.title3).frame(width: 44, height: 44) }
                .foregroundStyle(Palette.ink).accessibilityLabel("Over Fotoswipe")
        }
    }
    /// Scrolls instead of truncating: on an iPhone SE or with large text, every line stays readable.
    private var permissionContent: some View {
        GeometryReader { geometry in
        ScrollView(showsIndicators: false) {
        VStack(spacing: 18) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 22).fill(Palette.reward).frame(width: 120, height: 150)
                    .rotationEffect(.degrees(-8)).pop(radius: 22, fill: Palette.reward)
                RoundedRectangle(cornerRadius: 22).fill(Palette.brand).frame(width: 120, height: 150)
                    .rotationEffect(.degrees(6)).offset(x: 26, y: 6)
                    .overlay(Image(systemName: "photo").font(.system(size: 40, weight: .bold)).foregroundStyle(.white).offset(x: 26, y: 6))
            }.accessibilityHidden(true)
            Text("Bewaar het mooie.\nSwipe de rest.")
                .font(.system(size: 36, weight: .heavy, design: .rounded)).tracking(-1.2).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .minimumScaleFactor(0.75).fixedSize(horizontal: false, vertical: true).layoutPriority(1)
            Text("Een paar minuten per dag, en je bibliotheek blijft licht. Je foto's blijven in je eigen fotobibliotheek.")
                .foregroundStyle(Palette.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            if library.authorization == .notDetermined {
                Button("Kies toegang tot je foto's") { library.requestAccess() }.buttonStyle(PrimaryStyle())
                Text("Kies volledige toegang voor je hele bibliotheek, of geef alleen toegang tot geselecteerde foto's.")
                    .font(.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            } else if library.authorization == .restricted {
                Text("Fototoegang is beperkt op dit apparaat. Controleer Schermtijd of het apparaatbeheer.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Geef Fotoswipe toegang bij Instellingen om te beginnen.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                Button("Open Instellingen") { openSettings() }.buttonStyle(PrimaryStyle())
            }
            Spacer()
            Text("Geen reclame. Geen abonnement. Geen swipe-limiet.\nAlles blijft op je iPhone.").multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .font(.caption).foregroundStyle(Palette.muted).padding(.bottom, 20)
        }
        .foregroundStyle(Palette.ink)
        .frame(minHeight: geometry.size.height)
        }
        .scrollBounceBehavior(.basedOnSize)
        }
    }
    private var libraryContent: some View {
        VStack(spacing: 12) {
            quickChips
            if library.authorization == .limited {
                HStack {
                    Text("Alleen geselecteerde foto's").font(.caption.weight(.semibold))
                    Spacer()
                    Button("Wijzig") { limitedPicker = true }.font(.caption.bold()).foregroundStyle(Palette.brand)
                }.foregroundStyle(Palette.ink).padding(10).pop(radius: 12, fill: Palette.surface, shadow: 2)
            }
            if let warning = library.persistenceWarning {
                Text(warning).font(.caption).foregroundStyle(.red).accessibilityLabel("Waarschuwing: \(warning)")
            }
            sessionBar
            HStack(spacing: 14) {
                Text("\(library.reviewed) van \(library.assets.count) bekeken").font(.caption).foregroundStyle(Palette.muted)
                Spacer()
                Menu {
                    Picker("Volgorde", selection: Binding(get: { library.order }, set: { library.selectOrder($0) })) {
                        ForEach(PhotoOrder.allCases) { order in Text(order.title).tag(order) }
                    }
                } label: { Label(library.order.title, systemImage: "arrow.up.arrow.down").font(.caption.weight(.semibold)) }
                    .disabled(library.loading || library.deleting)
                Menu {
                    if let asset = library.current {
                        Button { library.deferCurrent() } label: { Label("Later beslissen", systemImage: "clock") }
                        Button { library.toggleFavorite() } label: {
                            Label(library.isFavorite(asset) ? "Verwijder favoriet in Foto's" : "Maak favoriet in Foto's", systemImage: "star")
                        }
                        Button { tool = .album(asset) } label: { Label("Voeg toe aan album", systemImage: "rectangle.stack.badge.plus") }
                        if asset.mediaType == .video {
                            Button { library.compressVideo(asset) } label: {
                                Label("Video verkleinen (\(ByteText.format(PhotoLibrary.fileSize(asset))))", systemImage: "arrow.down.right.and.arrow.up.left")
                            }
                        }
                        if asset.mediaSubtypes.contains(.photoLive) {
                            Button { library.convertLiveToStill(asset) } label: { Label("Bewaar als gewone foto (kleiner)", systemImage: "livephoto.slash") }
                        }
                        Button { tool = .preview(asset) } label: {
                            Label(asset.mediaType == .video ? "Video afspelen" : "Foto groter bekijken", systemImage: asset.mediaType == .video ? "play.circle" : "arrow.up.left.and.arrow.down.right")
                        }
                    }
                    Button { stacksOpen = true } label: { Label("Bijna dubbele foto's", systemImage: "square.stack.3d.up") }
                    if library.remainingInCategory > 1 {
                        Button { keepRestConfirm = true } label: {
                            Label("Bewaar de rest (\(library.remainingInCategory))", systemImage: "checkmark.circle")
                        }
                    }
                    Button { comparing = true } label: { Label("Vergelijkbare foto's (handmatig)", systemImage: "square.on.square") }
                } label: { Label("Meer", systemImage: "ellipsis.circle").font(.caption.weight(.semibold)) }
                    .disabled(library.deleting || library.loading || library.mutating)
            }.foregroundStyle(Palette.ink)
            if let converting = library.converting {
                HStack(spacing: 10) {
                    ProgressView().tint(Palette.brand)
                    Text(converting).font(.subheadline.weight(.bold))
                    Spacer()
                }
                .foregroundStyle(Palette.ink).padding(12).pop(radius: 14, fill: Palette.surface, shadow: 2)
                .accessibilityElement(children: .combine).accessibilityAddTraits(.updatesFrequently)
            }
            if let status = library.status { Text(status).font(.caption).foregroundStyle(Palette.muted).accessibilityAddTraits(.updatesFrequently) }
            if library.loading {
                Spacer()
                ProgressView("Je bibliotheek ophalen…").tint(Palette.brand).foregroundStyle(Palette.muted)
                Spacer()
            } else if library.selectedCategory.id == "clutter" && !library.smart.finished {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "wand.and.stars").font(.system(size: 46)).foregroundStyle(Palette.brand)
                    Text("Rommel zoeken").font(.system(.title2, design: .rounded).weight(.heavy))
                    ProgressView(value: Double(library.smart.processed), total: Double(max(1, library.smart.total))).tint(Palette.brand)
                    Text("\(library.smart.processed) van \(library.smart.total) recente foto's · alleen op je iPhone")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted).monospacedDigit()
                    Text("Wazige foto's, bonnetjes, notities en screenshots komen vooraan. Jij beslist.")
                        .font(.footnote).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                }.foregroundStyle(Palette.ink).padding(.horizontal, 12)
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
                            note: library.clutterReason(asset),
                            onOpen: { tool = .preview(asset) }
                        ) { choice, id, revision in library.decide(choice, expectedID: id, expectedRevision: revision) }
                    }
                }
                .id(library.deckRevision)
                .padding(.trailing, 6).padding(.bottom, 6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(minHeight: 160)
                if library.session.count < 3 {
                    Text("← wegleggen     ·     bewaren →").font(.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                }
                SwipeControls(pipeline: library.imagePipeline).environmentObject(library)
            } else {
                Spacer()
                Image(systemName: library.assets.isEmpty ? "photo" : "checkmark.seal.fill").font(.system(size: 52))
                    .foregroundStyle(library.assets.isEmpty ? Palette.muted : Palette.keep)
                Text(library.assets.isEmpty ? "Geen items in deze categorie" : "Alles bekeken.")
                    .font(.system(.largeTitle, design: .rounded).weight(.heavy)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                Text(library.assets.isEmpty ? "Kies een andere categorie of pas je fototoegang aan." : "Deze categorie is klaar. Kies een andere categorie of controleer je selectie.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                if library.canUndo { Button("Laatste keuze terugzetten") { library.undo() }.buttonStyle(SecondaryStyle()) }
                if library.keptInCategory > 0 {
                    Button("Bewaarde items opnieuw bekijken") { library.reviewKeptAgain() }.buttonStyle(SecondaryStyle())
                }
                Button("Ververs bibliotheek") { library.refresh() }.font(.caption.weight(.semibold)).foregroundStyle(Palette.brand)
                Spacer()
            }
            Button { review = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "tray.full.fill").foregroundStyle(Palette.trash)
                    Text("\(library.pending.count) weggelegd").fontWeight(.heavy)
                    if library.pendingBytes > 0 {
                        Text("· \(ByteText.format(library.pendingBytes))").foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Text("Bekijken").fontWeight(.heavy).foregroundStyle(Palette.brand)
                }.font(.subheadline).padding(.horizontal, 16).frame(minHeight: 52)
                    .pop(radius: 16, fill: Palette.surface, shadow: 3)
            }.foregroundStyle(Palette.ink).disabled(library.loading || library.deleting)
                .accessibilityLabel("\(library.pending.count) weggelegd, \(ByteText.format(library.pendingBytes)). Bekijken")
            Text("Een swipe verwijdert nog niets.").font(.caption2).foregroundStyle(Palette.muted)
                .padding(.bottom, 8)
        }
    }

    /// One tap to the categories with the biggest wins; the full list stays one tap away.
    private var quickChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { categoryPicker = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: library.selectedCategory.icon)
                        Text(library.selectedCategory.title).lineLimit(1)
                        Image(systemName: "chevron.down").font(.caption.bold())
                    }
                }.buttonStyle(ChipStyle(selected: true))
                    .disabled(library.deleting)
                    .accessibilityLabel("Categorie kiezen: \(library.selectedCategory.title)")
                Button { smartOpen = true } label: { Label("Slim opruimen", systemImage: "wand.and.stars").lineLimit(1) }
                    .buttonStyle(ChipStyle(selected: false, fill: Palette.reward))
                    .accessibilityHint("Bijna dubbel, burstfoto's, rommel en meer, grootste winst eerst")
                chip("Grootste eerst", icon: "arrow.down.circle", selected: library.order == .largest) {
                    library.selectOrder(library.order == .largest ? .newest : .largest)
                }
                ForEach(quickCategories) { category in
                    chip(category.title, icon: category.icon, selected: false) { library.selectCategory(category) }
                }
            }.padding(.vertical, 4).padding(.trailing, 4)
        }.disabled(library.loading || library.deleting || library.mutating)
    }
    private var quickCategories: [PhotoCategory] {
        let wanted = ["on-this-day", "Video's", "Screenshots", "random30", "later"]
        return wanted.compactMap { key in
            library.categories.first { ($0.id == key || ($0.title == key && !$0.isAlbum)) && $0.id != library.selectedCategory.id }
        }
    }
    private func chip(_ title: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(title, systemImage: icon).lineLimit(1) }
            .buttonStyle(ChipStyle(selected: selected))
            .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// A small goal of 30 per session; the bar fills toward it.
    private var sessionBar: some View {
        HStack(spacing: 10) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.surface)
                    Capsule().fill(Palette.reward)
                        .frame(width: max(0, geometry.size.width * library.session.progress))
                    Capsule().stroke(Palette.ink, lineWidth: 2)
                }
            }.frame(height: 14)
            Text("\(library.session.count)/\(ReviewSession.size)").font(.subheadline.weight(.heavy)).monospacedDigit()
                .foregroundStyle(Palette.ink)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.9), value: library.session.count)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sessie: \(library.session.count) van \(ReviewSession.size)")
    }
    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
    private var onboardingStartPage: Int {
        #if DEBUG
        let arguments = CommandLine.arguments
        if let index = arguments.firstIndex(of: "-FSOnboardingPage"), index + 1 < arguments.count { return Int(arguments[index + 1]) ?? 0 }
        #endif
        return 0
    }
    #if DEBUG
    /// Screenshot tooling only: `-FSScreen focus|stacks|review|end|whatsnew|info|clutter`.
    private func openDebugScreen() async {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "-FSScreen"), index + 1 < arguments.count else { return }
        let screen = arguments[index + 1]
        try? await Task.sleep(for: .seconds(3))
        switch screen {
        case "focus": focus = true
        case "stacks": stacksOpen = true
        case "review": library.debugSetAside(6); review = true
        case "end": library.debugSimulateSession()
        case "whatsnew": whatsNew = true
        case "info": info = true
        case "stats": stats = true
        case "smart": smartOpen = true
        case "clutter":
            if let category = library.categories.first(where: { $0.id == "clutter" }) { library.selectCategory(category) }
        default: break
        }
    }
    #endif
}

struct PrimaryStyle: ButtonStyle {
    var fill: Color = Palette.brand
    var text: Color = .white
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline.weight(.heavy)).padding(.vertical, 16).padding(.horizontal, 22)
            .frame(maxWidth: .infinity, minHeight: 54).foregroundStyle(text)
            .pop(radius: 27, fill: fill, shadow: configuration.isPressed ? 1 : 4)
            .offset(x: configuration.isPressed ? 3 : 0, y: configuration.isPressed ? 3 : 0)
    }
}

struct SecondaryStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.bold)).padding(.vertical, 12).padding(.horizontal, 18)
            .frame(minHeight: 44).foregroundStyle(Palette.ink)
            .pop(radius: 22, fill: Palette.surface, shadow: configuration.isPressed ? 1 : 3)
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
    }
}

struct ChipStyle: ButtonStyle {
    let selected: Bool
    var fill: Color? = nil
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.bold))
            .padding(.horizontal, 14).frame(minHeight: 40)
            .foregroundStyle(selected ? Color.white : Palette.ink)
            .pop(radius: 20, fill: selected ? Palette.brand : (fill ?? Palette.surface), shadow: configuration.isPressed ? 0 : 2)
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
            .padding(.vertical, 2)
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
    var note: String? = nil
    let onOpen: () -> Void
    let onCommit: (PhotoDecision, String, UUID) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var offset: CGFloat = 0
    @State private var exiting = false
    @State private var pastThreshold = false
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
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if favorite { Image(systemName: "heart.fill").foregroundStyle(Palette.trash) }
                        Text(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "Zonder datum")
                            .font(.headline.weight(.heavy))
                    }
                    Text(detail).font(.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                }
                .foregroundStyle(Palette.ink).padding(.horizontal, 12).padding(.vertical, 9)
                .pop(radius: 12, fill: Palette.surface, shadow: 2)
                .padding(14).allowsHitTesting(false)
                VStack {
                    HStack {
                        if offset < 0 { Spacer() }
                        Text(offset >= 0 ? "BEWAREN" : "WEGLEGGEN")
                            .font(.system(.title3, design: .rounded).weight(.heavy)).tracking(1)
                            .foregroundStyle(offset >= 0 ? Color.white : Palette.ink)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .pop(radius: 12, fill: offset >= 0 ? Palette.keep : Palette.trash, shadow: 3)
                            .rotationEffect(.degrees(offset >= 0 ? -10 : 10))
                            .scaleEffect(pastThreshold ? 1.08 : 1)
                            .opacity(isTop ? min(abs(offset) / 70, 1) : 0)
                        if offset >= 0 { Spacer() }
                    }
                    Spacer()
                }.padding(22).allowsHitTesting(false)
            }
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Palette.ink, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 24).fill(Palette.ink).offset(x: 6, y: 6).opacity(depth == 0 ? 1 : 0))
            .scaleEffect(1 - CGFloat(depth) * 0.025)
            .offset(x: isTop ? offset : 0, y: CGFloat(depth) * 5)
            .rotationEffect(.degrees(reduceMotion || !isTop ? Double(depth) * 2.5 : Double(offset / 22)))
            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.88), value: depth)
            .contentShape(Rectangle())
            .allowsHitTesting(isTop && !disabled && !exiting)
            .gesture(DragGesture(minimumDistance: 5)
                .onChanged { value in
                    guard isTop, !disabled, !exiting, pipeline.isReady(asset.localIdentifier) else { return }
                    offset = value.translation.width
                    let crossed = abs(offset) > max(65, geometry.size.width * 0.23)
                    if crossed != pastThreshold {
                        pastThreshold = crossed
                        if crossed { Haptics.threshold() }
                    }
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
                        pastThreshold = false
                        withAnimation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.85)) { offset = 0 }
                    }
                })
            .onChange(of: command?.id) { _, _ in
                guard isTop, let command, command.assetID == asset.localIdentifier else { return }
                commit(command.choice, width: geometry.size.width)
            }
            .onChange(of: isTop) { _, _ in offset = 0; exiting = false; pastThreshold = false }
            .accessibilityElement(children: .ignore)
            .accessibilityHidden(!isTop)
            .accessibilityLabel("Item van \(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "onbekende datum")\(favorite ? ", favoriet" : "")")
            .accessibilityAction(named: Text(asset.mediaType == .video ? "Video afspelen" : "Groter bekijken")) { onOpen() }
            .accessibilityAction(named: Text("Bewaren")) { commit(.keep, width: geometry.size.width) }
            .accessibilityAction(named: Text("Wegleggen")) { commit(.trash, width: geometry.size.width) }
        }.zIndex(Double(3 - depth))
    }
    private var detail: String {
        var parts: [String] = []
        if asset.mediaType == .video {
            parts.append("Video · \(Int(asset.duration) / 60):\(String(format: "%02d", Int(asset.duration) % 60))")
        } else { parts.append("Foto") }
        parts.append(ByteText.format(PhotoLibrary.fileSize(asset)))
        if let note { parts.append(note) }
        return parts.joined(separator: " · ")
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
/// The two main actions are large and sit in the thumb zone; secondary actions are smaller.
private struct SwipeControls: View {
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject var pipeline: SwipeImagePipeline
    private var ready: Bool { library.current.map { pipeline.isReady($0.localIdentifier) } ?? false }
    var body: some View {
        HStack(spacing: 18) {
            control("Wegleggen", icon: "xmark", fill: Palette.trash, tint: Palette.ink, size: 72) { library.requestSwipe(.trash) }
                .disabled(!ready || library.mutating)
            control("Laatste keuze terugzetten", icon: "arrow.uturn.backward", fill: Palette.surface, tint: Palette.ink, size: 50) { library.undo() }
                .disabled(!library.canUndo || library.mutating)
            control("Later beslissen", icon: "clock", fill: Palette.surface, tint: Palette.ink, size: 50) { library.deferCurrent() }
                .disabled(library.current == nil || library.mutating)
            control("Bewaren", icon: "checkmark", fill: Palette.keep, tint: .white, size: 72) { library.requestSwipe(.keep) }
                .disabled(!ready || library.mutating)
        }.disabled(library.deleting || library.loading)
    }
    private func control(_ title: String, icon: String, fill: Color, tint: Color, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size / 2.6, weight: .heavy))
                .foregroundStyle(tint).frame(width: size, height: size)
        }
        .buttonStyle(RoundPopStyle(fill: fill, size: size))
        .accessibilityLabel(title)
    }
}

private struct RoundPopStyle: ButtonStyle {
    let fill: Color
    let size: CGFloat
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        let shadow: CGFloat = size > 60 ? 4 : 3
        configuration.label
            .background(Circle().fill(fill))
            .overlay(Circle().stroke(Palette.ink, lineWidth: 3))
            .background(Circle().fill(Palette.ink).offset(x: configuration.isPressed ? 1 : shadow, y: configuration.isPressed ? 1 : shadow))
            .offset(x: configuration.isPressed ? shadow - 1 : 0, y: configuration.isPressed ? shadow - 1 : 0)
            .opacity(isEnabled ? 1 : 0.4)
    }
}

/// The last moment of a session is what people remember: show the win, the streak and a few kept highlights.
struct SessionEndView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.requestReview) private var requestReview
    let onClose: (_ openReview: Bool) -> Void
    @State private var duration: TimeInterval = 0
    var body: some View {
        let session = library.session
        let bytes = library.sessionTrashedBytes
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "checkmark").font(.system(size: 38, weight: .heavy)).foregroundStyle(Palette.ink)
                    .frame(width: 84, height: 84).background(Circle().fill(Palette.reward))
                    .overlay(Circle().stroke(Palette.ink, lineWidth: 3))
                    .padding(.top, 28).accessibilityHidden(true)
                Text("Sessie klaar!").font(.system(size: 34, weight: .heavy, design: .rounded)).tracking(-1)
                Text("\(session.count) items in \(durationText)").foregroundStyle(Palette.muted)
                VStack(spacing: 2) {
                    Text(session.trashed.isEmpty ? "JE BEWAARDE ALLES" : "KLAAR OM VRIJ TE MAKEN").font(.caption.weight(.heavy)).foregroundStyle(Palette.muted)
                    Text(session.trashed.isEmpty ? "\(session.kept.count) bewaard" : ByteText.format(bytes))
                        .font(.system(size: 44, weight: .heavy, design: .rounded)).tracking(-1)
                    if library.streak.freedBytes > 0 {
                        Text("Totaal al vrijgemaakt: \(ByteText.format(library.streak.freedBytes))").font(.footnote).foregroundStyle(Palette.muted)
                    }
                }.frame(maxWidth: .infinity).padding(.vertical, 18).pop(radius: 20, fill: Palette.reward, shadow: 4)
                HStack(spacing: 10) {
                    stat("\(session.kept.count)", "bewaard", Palette.keep)
                    stat("\(session.trashed.count)", "weggelegd", Palette.trash)
                    stat("\(session.later.count)", "later", Palette.surface)
                }
                weekRow
                let highlights = library.sessionHighlights
                if !highlights.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Mooi teruggevonden").font(.headline.weight(.heavy))
                        HStack(spacing: 8) {
                            ForEach(highlights, id: \.localIdentifier) { asset in
                                AssetImage(asset: asset, manager: library.images, thumbnail: true)
                                    .frame(height: 104).clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
                            }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                ReminderCard().environmentObject(library)
                if !library.pending.isEmpty {
                    Button("Controleer \(library.pending.count) items\(library.pendingBytes > 0 ? " · " + ByteText.format(library.pendingBytes) : "")") { onClose(true) }
                        .buttonStyle(PrimaryStyle(fill: Palette.trash, text: Palette.ink))
                }
                Button("Nog \(ReviewSession.size) doen") { onClose(false) }.buttonStyle(SecondaryStyle())
                    .padding(.bottom, 20)
            }.padding(.horizontal, 22).foregroundStyle(Palette.ink)
        }
        .background(Palette.background.ignoresSafeArea())
        .onAppear {
            duration = library.session.duration()
            askForReviewIfEarned()
        }
        .presentationDragIndicator(.visible)
    }
    /// Peak moment after a real win; rare, and at most once per version.
    private func askForReviewIfEarned() {
        let defaults = UserDefaults.standard
        let version = WhatsNewView.version
        guard ReviewPrompt.shouldAsk(completedSessions: library.completedSessions,
                                     setAsideThisSession: library.session.trashed.count,
                                     lastAsked: defaults.object(forKey: "fotoswipe.review.lastAsked") as? Date,
                                     lastAskedVersion: defaults.string(forKey: "fotoswipe.review.version"),
                                     version: version) else { return }
        defaults.set(Date(), forKey: "fotoswipe.review.lastAsked")
        defaults.set(version, forKey: "fotoswipe.review.version")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { requestReview() }
    }
    private var durationText: String {
        let seconds = max(1, Int(duration.rounded()))
        if seconds < 60 { return seconds == 1 ? "1 seconde" : "\(seconds) seconden" }
        let minutes = seconds / 60, rest = seconds % 60
        return rest == 0 ? "\(minutes) min" : "\(minutes) min \(rest) sec"
    }
    private func stat(_ value: String, _ label: String, _ fill: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title2.weight(.heavy)).foregroundStyle(fill == Palette.keep ? Color.white : Palette.ink)
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(fill == Palette.keep ? Color.white : Palette.ink)
        }.frame(maxWidth: .infinity).padding(.vertical, 12).pop(radius: 16, fill: fill, shadow: 3)
    }
    /// Last 7 days; one missed day does not break the streak.
    private var weekRow: some View {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0 - 6, to: today) }
        let streak = library.streakDays
        return VStack(spacing: 8) {
            HStack {
                Label(streak == 1 ? "1 dag op rij" : "\(streak) dagen op rij", systemImage: "flame.fill").font(.subheadline.weight(.heavy))
                Spacer()
                Text("Eén dag overslaan mag").font(.caption).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 6) {
                ForEach(days, id: \.self) { day in
                    let active = library.streak.isActive(day)
                    VStack(spacing: 4) {
                        Circle().fill(active ? Palette.reward : Palette.surface)
                            .overlay(Circle().stroke(Palette.ink, lineWidth: 2))
                            .frame(width: 30, height: 30)
                        Text(day.formatted(.dateTime.weekday(.narrow))).font(.caption2.weight(.bold)).foregroundStyle(Palette.muted)
                    }.frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(day.formatted(.dateTime.weekday(.wide))): \(active ? "actief" : "niet actief")")
                }
            }
        }
    }
}

/// Full-screen focus mode: only the photo, colour at the edge, controls on demand.
/// Gestures: right keep, left set aside, up later, down undo, double tap favourite, hold to zoom.
struct FocusSwipeView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var controlsVisible = false
    @State private var hideTask: Task<Void, Never>?
    @State private var review = false
    @State private var reviewAfterSession = false
    @State private var preview: PHAsset?
    @State private var guide = false
    @AppStorage("fotoswipe.focusGuideSeen") private var guideSeen = false

    var body: some View {
        ZStack {
            Palette.ink.ignoresSafeArea()
            if library.current != nil && !library.loading {
                ZStack {
                    ForEach(Array(library.deck.reversed()), id: \.localIdentifier) { asset in
                        FocusCard(
                            asset: asset, pipeline: library.imagePipeline,
                            depth: library.deck.firstIndex(where: { $0.localIdentifier == asset.localIdentifier }) ?? 0,
                            revision: library.deckRevision, command: library.swipeCommand,
                            disabled: library.deleting || library.loading || library.mutating,
                            onTap: { toggleControls() },
                            onDoubleTap: { library.toggleFavorite() },
                            onOpen: { preview = asset },
                            onUndo: { library.undo() }
                        ) { choice, id, revision in library.decide(choice, expectedID: id, expectedRevision: revision) }
                    }
                }
                .id(library.deckRevision)
                .ignoresSafeArea()
            } else if library.loading {
                ProgressView().tint(.white)
            } else {
                VStack(spacing: 14) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 52)).foregroundStyle(Palette.reward)
                    Text("Alles bekeken").font(.system(.title, design: .rounded).weight(.heavy)).foregroundStyle(.white)
                    Text("Kies een andere categorie op het hoofdscherm.").foregroundStyle(.white.opacity(0.8))
                    Button("Terug naar overzicht") { dismiss() }.buttonStyle(SecondaryStyle())
                }.padding(24)
            }
            overlay
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .sheet(isPresented: $review) { ReviewView().environmentObject(library) }
        .sheet(item: Binding(get: { preview.map(FocusPreview.init) }, set: { preview = $0?.asset })) { item in
            AssetPreviewView(asset: item.asset, manager: library.images)
        }
        .sheet(isPresented: $guide, onDismiss: { guideSeen = true }) { GestureGuideView() }
        .sheet(isPresented: $library.sessionFinished, onDismiss: {
            library.startNewSession()
            if reviewAfterSession { reviewAfterSession = false; review = true }
        }) {
            SessionEndView { openReview in
                reviewAfterSession = openReview
                library.sessionFinished = false
            }.environmentObject(library)
        }
        .onAppear { if !guideSeen { guide = true } }
        .onDisappear { hideTask?.cancel() }
    }

    private var overlay: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .heavy)).foregroundStyle(.white)
                        .frame(width: 44, height: 44).background(Circle().fill(Palette.ink.opacity(0.72)))
                }.accessibilityLabel("Focusmodus sluiten")
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.ink.opacity(0.45))
                        Capsule().fill(Palette.reward).frame(width: geometry.size.width * library.session.progress)
                    }
                }.frame(height: 6)
                Text("\(library.session.count)/\(ReviewSession.size)").font(.footnote.weight(.heavy)).monospacedDigit()
                    .foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(Palette.ink.opacity(0.72)))
            }
            .padding(.horizontal, 14).padding(.top, 6)
            .accessibilityElement(children: .contain)
            Spacer()
            if let asset = library.current {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 5) {
                            if library.isFavorite(asset) { Image(systemName: "heart.fill").foregroundStyle(Palette.trash) }
                            Text(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "Zonder datum").font(.subheadline.weight(.heavy))
                        }
                        Text((asset.mediaType == .video ? "Video · " : "Foto · ") + ByteText.format(PhotoLibrary.fileSize(asset)) + (library.clutterReason(asset).map { " · " + $0 } ?? ""))
                            .font(.caption.weight(.semibold)).opacity(0.85)
                    }
                    .foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Palette.ink.opacity(0.72)))
                    Spacer()
                }.padding(.horizontal, 14).padding(.bottom, 12).allowsHitTesting(false)
            }
            if controlsVisible {
                SwipeControls(pipeline: library.imagePipeline).environmentObject(library)
                    .padding(.bottom, 10)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .simultaneousGesture(TapGesture().onEnded { scheduleHide() })
            }
            Button { review = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "tray.full.fill").foregroundStyle(Palette.trash)
                    Text("\(library.pending.count) weg")
                    if library.pendingBytes > 0 { Text("· \(ByteText.format(library.pendingBytes))") }
                }
                .font(.subheadline.weight(.heavy)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .pop(radius: 22, fill: Palette.surface, shadow: 3)
            }
            .accessibilityLabel("\(library.pending.count) weggelegd. Bekijken")
            .padding(.bottom, 12)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.9), value: controlsVisible)
    }

    private func toggleControls() {
        controlsVisible.toggle()
        if controlsVisible { scheduleHide() } else { hideTask?.cancel() }
    }
    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { controlsVisible = false }
        }
    }
    private struct FocusPreview: Identifiable {
        let asset: PHAsset
        var id: String { asset.localIdentifier }
    }
}

/// One full-screen card. The photo follows the finger 1:1; the screen edge shows the outcome in peripheral vision.
private struct FocusCard: View {
    let asset: PHAsset
    @ObservedObject var pipeline: SwipeImagePipeline
    let depth: Int
    let revision: UUID
    let command: SwipeCommand?
    let disabled: Bool
    let onTap: () -> Void
    let onDoubleTap: () -> Void
    let onOpen: () -> Void
    let onUndo: () -> Void
    let onCommit: (PhotoDecision, String, UUID) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drag: CGSize = .zero
    @State private var exiting = false
    @State private var zoomed = false
    @State private var armed: FocusGesture = .none
    private var isTop: Bool { depth == 0 }

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let intent = isTop ? FocusGesture.preview(dx: drag.width, dy: drag.height, width: size.width, height: size.height) : .none
            ZStack {
                Palette.ink
                BufferedAssetImage(asset: asset, pipeline: pipeline)
                    .scaleEffect(zoomed ? 2.2 : 1)
                    .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: zoomed)
                if asset.mediaType == .video && isTop && pipeline.isReady(asset.localIdentifier) {
                    Button(action: onOpen) {
                        Image(systemName: "play.circle.fill").font(.system(size: 64)).foregroundStyle(.white)
                    }.accessibilityLabel("Video afspelen")
                }
                if isTop { stamp(for: intent).allowsHitTesting(false) }
            }
            .clipShape(RoundedRectangle(cornerRadius: isTop && drag != .zero ? 28 : 0))
            .offset(isTop ? drag : .zero)
            .rotationEffect(.degrees(reduceMotion || !isTop ? 0 : Double(drag.width / 26)), anchor: .bottom)
            .overlay(alignment: .leading) { edge(Palette.trash, active: isTop && drag.width < 0, strength: -drag.width / max(65, size.width * 0.23)) }
            .overlay(alignment: .trailing) { edge(Palette.keep, active: isTop && drag.width > 0, strength: drag.width / max(65, size.width * 0.23)) }
            .contentShape(Rectangle())
            .allowsHitTesting(isTop && !disabled && !exiting)
            .onTapGesture(count: 2) { if isTop { Haptics.threshold(); onDoubleTap() } }
            .onTapGesture { if isTop { onTap() } }
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.3, maximumDistance: 8)
                    .sequenced(before: DragGesture(minimumDistance: 0))
                    .onChanged { value in
                        if case .second(true, _) = value, isTop, drag == .zero, !zoomed { zoomed = true }
                    }
                    .onEnded { _ in zoomed = false })
            .gesture(DragGesture(minimumDistance: 8)
                .onChanged { value in
                    guard isTop, !disabled, !exiting else { return }
                    zoomed = false
                    drag = value.translation
                    let now = FocusGesture.preview(dx: drag.width, dy: drag.height, width: size.width, height: size.height)
                    if now != armed {
                        armed = now
                        if now != .none { Haptics.threshold() }
                    }
                }
                .onEnded { value in
                    guard isTop, !disabled, !exiting else { return }
                    let result = FocusGesture.classify(dx: value.translation.width, dy: value.translation.height,
                                                       predictedDX: value.predictedEndTranslation.width,
                                                       predictedDY: value.predictedEndTranslation.height,
                                                       width: size.width, height: size.height)
                    armed = .none
                    switch result {
                    case .keep: commit(.keep, size: size)
                    case .trash: commit(.trash, size: size)
                    case .later: commit(.later, size: size)
                    case .undo:
                        reset()
                        onUndo()
                    case .none: reset()
                    }
                })
            .onChange(of: command?.id) { _, _ in
                guard isTop, let command, command.assetID == asset.localIdentifier else { return }
                commit(command.choice, size: size)
            }
            .onChange(of: isTop) { _, _ in drag = .zero; exiting = false; zoomed = false; armed = .none }
            .accessibilityElement(children: .ignore)
            .accessibilityHidden(!isTop)
            .accessibilityLabel("Item van \(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "onbekende datum")")
            .accessibilityHint("Veeg naar rechts om te bewaren, naar links om weg te leggen, omhoog voor later.")
            .accessibilityAction(named: Text("Bewaren")) { commit(.keep, size: size) }
            .accessibilityAction(named: Text("Wegleggen")) { commit(.trash, size: size) }
            .accessibilityAction(named: Text("Later beslissen")) { commit(.later, size: size) }
            .accessibilityAction(named: Text("Vorige terug")) { onUndo() }
            .accessibilityAction(named: Text(asset.mediaType == .video ? "Video afspelen" : "Knoppen tonen")) {
                if asset.mediaType == .video { onOpen() } else { onTap() }
            }
        }
        .zIndex(Double(3 - depth))
    }

    @ViewBuilder private func stamp(for intent: FocusGesture) -> some View {
        let label: (String, Color, Color)? = {
            switch intent {
            case .keep: return ("BEWAREN", Palette.keep, .white)
            case .trash: return ("WEGLEGGEN", Palette.trash, Palette.ink)
            case .later: return ("LATER", Palette.reward, Palette.ink)
            case .undo: return ("VORIGE TERUG", Palette.surface, Palette.ink)
            case .none: return nil
            }
        }()
        if let label {
            Text(label.0)
                .font(.system(size: 30, weight: .heavy, design: .rounded)).tracking(1)
                .foregroundStyle(label.2)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .pop(radius: 14, fill: label.1, shadow: 4)
                .rotationEffect(.degrees(intent == .keep ? -10 : (intent == .trash ? 10 : 0)))
                .transition(.scale(scale: 0.8).combined(with: .opacity))
        }
    }

    private func edge(_ color: Color, active: Bool, strength: CGFloat) -> some View {
        Rectangle().fill(color)
            .frame(width: 22)
            .opacity(active ? Double(min(max(strength, 0), 1)) : 0)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }

    private func reset() {
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) { drag = .zero }
    }

    private func commit(_ choice: PhotoDecision, size: CGSize) {
        guard isTop, !disabled, !exiting else { return }
        guard choice == .later || pipeline.isReady(asset.localIdentifier) else { reset(); return }
        exiting = true
        let id = asset.localIdentifier
        if reduceMotion { onCommit(choice, id, revision); return }
        let target: CGSize
        switch choice {
        case .keep: target = CGSize(width: max(size.width * 1.6, 700), height: drag.height)
        case .trash: target = CGSize(width: -max(size.width * 1.6, 700), height: drag.height)
        case .later: target = CGSize(width: drag.width, height: -max(size.height * 1.3, 1000))
        }
        withAnimation(.easeOut(duration: 0.14), completionCriteria: .logicallyComplete) {
            drag = target
        } completion: {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { onCommit(choice, id, revision) }
        }
    }
}

/// Shown once on first use of focus mode; also reachable from the info screen.
struct GestureGuideView: View {
    @Environment(\.dismiss) private var dismiss
    private struct Row: Identifiable {
        let icon: String, gesture: String, result: String, fill: Color, tint: Color
        var id: String { gesture }
    }
    private let rows: [Row] = [
        Row(icon: "arrow.right", gesture: "Naar rechts", result: "Bewaren", fill: Palette.keep, tint: .white),
        Row(icon: "arrow.left", gesture: "Naar links", result: "Wegleggen voor controle", fill: Palette.trash, tint: Palette.ink),
        Row(icon: "arrow.up", gesture: "Omhoog", result: "Later beslissen", fill: Palette.reward, tint: Palette.ink),
        Row(icon: "arrow.down", gesture: "Omlaag", result: "Vorige terug", fill: Palette.surface, tint: Palette.ink),
        Row(icon: "heart", gesture: "Dubbeltik", result: "Favoriet in Foto's", fill: Palette.surface, tint: Palette.ink),
        Row(icon: "plus.magnifyingglass", gesture: "Vasthouden", result: "Inzoomen, loslaten is terug", fill: Palette.surface, tint: Palette.ink),
        Row(icon: "hand.tap", gesture: "Eén tik", result: "Knoppen tonen", fill: Palette.surface, tint: Palette.ink)
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Zo swipe je").font(.system(size: 32, weight: .heavy, design: .rounded)).padding(.top, 28)
                Text("Alles met één duim. Je vindt dit later ook onder het i-knopje.").foregroundStyle(Palette.muted)
                ForEach(rows) { row in
                    HStack(spacing: 14) {
                        Image(systemName: row.icon).font(.system(size: 20, weight: .heavy)).foregroundStyle(row.tint)
                            .frame(width: 46, height: 46)
                            .background(RoundedRectangle(cornerRadius: 12).fill(row.fill))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.gesture).font(.headline.weight(.heavy))
                            Text(row.result).font(.subheadline).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                    }
                    .padding(12).pop(radius: 16, fill: Palette.surface, shadow: 3)
                    .accessibilityElement(children: .combine)
                }
                Button("Begin met swipen") { dismiss() }.buttonStyle(PrimaryStyle()).padding(.top, 8).padding(.bottom, 24)
            }.padding(.horizontal, 22).foregroundStyle(Palette.ink)
        }
        .background(Palette.background.ignoresSafeArea())
    }
}


/// Asked at the peak moment (end of a session): pick your own moment for tomorrow.
struct ReminderCard: View {
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject private var reminders = Reminders.shared
    @State private var time = Reminders.shared.time
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if reminders.enabled {
                Label("Herinnering staat aan om \(reminders.timeText)", systemImage: "bell.fill")
                    .font(.subheadline.weight(.heavy))
                Text("Eén melding per dag, niet als je al klaar bent.").font(.caption).foregroundStyle(Palette.muted)
            } else {
                Text("Morgen weer even swipen?").font(.headline.weight(.heavy))
                Text("Kies je eigen moment, bijvoorbeeld na het eten. Eén melding per dag.").font(.footnote).foregroundStyle(Palette.muted)
                HStack {
                    DatePicker("Tijd", selection: $time, displayedComponents: .hourAndMinute).labelsHidden()
                    Spacer()
                    Button("Herinner me") {
                        reminders.setTime(time) { }
                        reminders.setEnabled(true) { library.rescheduleReminders() }
                    }.buttonStyle(SecondaryStyle())
                }
                if reminders.denied {
                    Text("Meldingen staan uit voor Fotoswipe. Zet ze aan in Instellingen.").font(.caption).foregroundStyle(Palette.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14).pop(radius: 16, fill: Palette.surface, shadow: 3)
    }
}


/// Shown once after an update: four short lines and one clear next step (curiosity, not a manual).
struct WhatsNewView: View {
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0" }
    let onClose: (_ tryStacks: Bool) -> Void
    private struct Item: Identifiable {
        let icon: String, title: String, text: String, fill: Color, tint: Color
        var id: String { title }
    }
    private let items: [Item] = [
        Item(icon: "wand.and.stars", title: "Slim opruimen", text: "Alle slimme groepen op één plek, met de grootste winst bovenaan.", fill: Palette.reward, tint: Palette.ink),
        Item(icon: "square.stack.fill", title: "Burstfoto's en kopieën", text: "iOS weet welke burstfoto de beste is. Kopieën vind je in één keer.", fill: Palette.brand, tint: .white),
        Item(icon: "eye.slash", title: "Per ongeluk en uit apps", text: "Zwarte foto's, minivideo's, oude screenshots en WhatsApp-plaatjes.", fill: Palette.surface, tint: Palette.ink),
        Item(icon: "arrow.down.right.and.arrow.up.left", title: "Kleiner zonder verwijderen", text: "Video verkleinen of een Live Photo als gewone foto bewaren, via Meer.", fill: Palette.keep, tint: .white)
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("NIEUW IN FOTOSWIPE").font(.caption.weight(.heavy)).foregroundStyle(Palette.muted).padding(.top, 28)
                Text("Slimmer opruimen,\nmeer ruimte.").font(.system(size: 32, weight: .heavy, design: .rounded)).tracking(-1)
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: 14) {
                        Image(systemName: item.icon).font(.system(size: 19, weight: .heavy)).foregroundStyle(item.tint)
                            .frame(width: 46, height: 46)
                            .background(RoundedRectangle(cornerRadius: 12).fill(item.fill))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(.headline.weight(.heavy))
                            Text(item.text).font(.subheadline).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12).pop(radius: 16, fill: Palette.surface, shadow: 3)
                    .accessibilityElement(children: .combine)
                }
                Text("Nog steeds: geen reclame, geen abonnement, geen limiet. Alles blijft op je iPhone.")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).padding(.top, 2)
                Button("Open Slim opruimen") { onClose(true) }.buttonStyle(PrimaryStyle()).padding(.top, 6)
                Button("Later") { onClose(false) }.font(.subheadline.weight(.bold)).foregroundStyle(Palette.brand)
                    .frame(maxWidth: .infinity, minHeight: 44).padding(.bottom, 20)
            }.padding(.horizontal, 22).foregroundStyle(Palette.ink)
        }
        .background(Palette.background.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Onboarding

/// Three short steps: the benefit, a practice card you swipe yourself (learning by doing), then the access request.
/// Apple's photo prompt appears only after the user taps the button on the last step.
struct OnboardingView: View {
    let onAllow: () -> Void
    @State private var page: Int
    @State private var step = 0          // 0: swipe right, 1: swipe left, 2: done
    @State private var drag: CGFloat = 0
    @State private var hint: String?
    /// Short screens (iPhone SE): smaller illustration and title so the main button stays visible.
    @State private var compact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(onAllow: @escaping () -> Void, startPage: Int = 0) {
        self.onAllow = onAllow
        _page = State(initialValue: startPage)
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 18) {
                    HStack(spacing: 6) {
                        ForEach(0..<3, id: \.self) { index in
                            Capsule().fill(index <= page ? Palette.brand : Palette.track)
                                .frame(width: index == page ? 26 : 10, height: 10)
                        }
                        Spacer()
                        if page < 2 {
                            Button("Overslaan") { withAnimation { page = 2 } }
                                .font(.subheadline.weight(.bold)).foregroundStyle(Palette.brand).frame(minHeight: 44)
                        }
                    }
                    .accessibilityElement(children: .contain)
                    Group {
                        switch page {
                        case 0: benefit
                        case 1: practice
                        default: access
                        }
                    }
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
                }
                .padding(.vertical, 8)
                .frame(minHeight: geometry.size.height)
                .foregroundStyle(Palette.ink)
            }
            .scrollBounceBehavior(.basedOnSize)
            .onAppear { compact = geometry.size.height < 640 }
            .onChange(of: geometry.size.height) { _, height in compact = height < 640 }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.9), value: page)
    }

    private var benefit: some View {
        VStack(spacing: compact ? 12 : 18) {
            Spacer(minLength: compact ? 0 : 8)
            StackIllustration().scaleEffect(compact ? 0.72 : 1).frame(height: compact ? 120 : 170).accessibilityHidden(true)
            Text("Bewaar het mooie.\nSwipe de rest.")
                .font(.system(size: compact ? 28 : 34, weight: .heavy, design: .rounded)).tracking(-1.1)
                .multilineTextAlignment(.center).minimumScaleFactor(0.75).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                row("timer", "Een paar minuten per dag houdt je bibliotheek licht.")
                row("checkmark.shield", "Niets is meteen weg: jij controleert eerst, iOS vraagt nog om bevestiging.")
                row("iphone", "Geen reclame, geen abonnement. Alles blijft op je iPhone.")
            }
            Spacer(minLength: 8)
            Button("Volgende") { withAnimation { page = 1 } }.buttonStyle(PrimaryStyle())
        }
    }

    private func row(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 17, weight: .heavy)).foregroundStyle(Palette.brand).frame(width: 26)
            Text(text).font(.body).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    private var instruction: String {
        switch step {
        case 0: return "Veeg de kaart naar rechts om te bewaren"
        case 1: return "Nu naar links om weg te leggen"
        default: return "Top! Zo simpel is het."
        }
    }

    private var practice: some View {
        VStack(spacing: 16) {
            Text("Probeer het even").font(.system(size: 30, weight: .heavy, design: .rounded)).tracking(-0.8)
            Text(hint ?? instruction).font(.headline).multilineTextAlignment(.center)
                .foregroundStyle(hint == nil ? Palette.ink : Palette.trash)
                .frame(minHeight: 44).accessibilityAddTraits(.updatesFrequently)
            ZStack {
                PracticeCard(variant: step == 0 ? 0 : 1)
                    .overlay(alignment: .top) {
                        if drag != 0 {
                            Text(drag > 0 ? "BEWAREN" : "WEGLEGGEN")
                                .font(.system(.title3, design: .rounded).weight(.heavy))
                                .foregroundStyle(drag > 0 ? Color.white : Palette.ink)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .pop(radius: 12, fill: drag > 0 ? Palette.keep : Palette.trash, shadow: 3)
                                .opacity(min(abs(drag) / 70, 1)).padding(.top, 18)
                        }
                    }
                    .offset(x: drag)
                    .rotationEffect(.degrees(reduceMotion ? 0 : Double(drag / 22)))
                    .gesture(DragGesture(minimumDistance: 6)
                        .onChanged { value in guard step < 2 else { return }; drag = value.translation.width; hint = nil }
                        .onEnded { value in finish(value.translation.width, predicted: value.predictedEndTranslation.width) })
                    .opacity(step == 2 ? 0.35 : 1)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Oefenkaart")
                    .accessibilityHint(instruction)
                    .accessibilityAction(named: Text("Bewaren")) { complete(.keep) }
                    .accessibilityAction(named: Text("Wegleggen")) { complete(.trash) }
            }
            .frame(height: compact ? 250 : 300)
            .scaleEffect(compact ? 0.86 : 1)
            if step == 2 {
                Button("Volgende") { withAnimation { page = 2 } }.buttonStyle(PrimaryStyle())
            } else {
                HStack(spacing: 18) {
                    Button { tap(.trash) } label: {
                        Image(systemName: "xmark").font(.system(size: 24, weight: .heavy)).foregroundStyle(Palette.ink)
                            .frame(width: 64, height: 64)
                    }.buttonStyle(RoundOnboardingStyle(fill: Palette.trash)).accessibilityLabel("Wegleggen")
                    Button { tap(.keep) } label: {
                        Image(systemName: "checkmark").font(.system(size: 26, weight: .heavy)).foregroundStyle(.white)
                            .frame(width: 64, height: 64)
                    }.buttonStyle(RoundOnboardingStyle(fill: Palette.keep)).accessibilityLabel("Bewaren")
                }
                Text("Of tik op de knoppen.").font(.caption).foregroundStyle(Palette.muted)
            }
        }
    }

    private func finish(_ distance: CGFloat, predicted: CGFloat) {
        guard step < 2 else { return }
        let travel = abs(distance) > 100 ? distance : (abs(predicted) > 260 && abs(distance) > 18 ? predicted : 0)
        if travel > 0 { complete(.keep) }
        else if travel < 0 { complete(.trash) }
        else { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 } }
    }
    private func tap(_ choice: PhotoDecision) { complete(choice) }
    private func complete(_ choice: PhotoDecision) {
        let expected: PhotoDecision = step == 0 ? .keep : .trash
        guard choice == expected else {
            hint = step == 0 ? "Andere kant op: naar rechts is bewaren" : "Andere kant op: naar links is wegleggen"
            Haptics.threshold()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { drag = 0 }
            return
        }
        Haptics.choice(choice)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { drag = choice == .keep ? 520 : -520 }
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0 : 0.2)) {
            drag = 0
            step += 1
            if step == 2 { Haptics.success() }
        }
    }

    private var access: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 8)
            Image(systemName: "photo.on.rectangle.angled").font(.system(size: 56, weight: .bold)).foregroundStyle(Palette.brand)
                .accessibilityHidden(true)
            Text("Fotoswipe heeft je foto's nodig").font(.system(size: 28, weight: .heavy, design: .rounded)).tracking(-0.8)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 10) {
                row("lock.shield", "Je foto's blijven op je iPhone. Er wordt niets geüpload.")
                row("hand.raised", "Alleen jij beslist wat weg mag.")
                row("square.grid.2x2", "Tip: kies volledige toegang om je hele bibliotheek op te ruimen. Een selectie kan ook.")
            }
            Spacer(minLength: 8)
            Button("Geef toegang tot mijn foto's") { onAllow() }.buttonStyle(PrimaryStyle())
            Text("Je kunt dit later altijd wijzigen in Instellingen.").font(.caption).foregroundStyle(Palette.muted)
        }
    }
}

private struct RoundOnboardingStyle: ButtonStyle {
    let fill: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Circle().fill(fill))
            .overlay(Circle().stroke(Palette.ink, lineWidth: 3))
            .background(Circle().fill(Palette.ink).offset(x: configuration.isPressed ? 1 : 4, y: configuration.isPressed ? 1 : 4))
            .offset(x: configuration.isPressed ? 3 : 0, y: configuration.isPressed ? 3 : 0)
    }
}

/// The two stacked cards from the app icon, drawn in code.
struct StackIllustration: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22).fill(Palette.reward).frame(width: 120, height: 150)
                .rotationEffect(.degrees(-8)).pop(radius: 22, fill: Palette.reward)
            RoundedRectangle(cornerRadius: 22).fill(Palette.brand).frame(width: 120, height: 150)
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(Palette.ink, lineWidth: 2))
                .overlay(Image(systemName: "photo").font(.system(size: 40, weight: .bold)).foregroundStyle(.white))
                .rotationEffect(.degrees(6)).offset(x: 26, y: 6)
        }
    }
}

/// A drawn practice "photo" (no real images in onboarding).
private struct PracticeCard: View {
    let variant: Int
    var body: some View {
        ZStack {
            Rectangle().fill(variant == 0 ? Color(hex: 0x7DB4D2) : Color(hex: 0xE3A574))
            Circle().fill(Color(hex: 0xFFE2A6)).frame(width: 64, height: 64).offset(x: 52, y: -70)
            HillShape(peak: 0.35).fill(variant == 0 ? Color(hex: 0x3F6B57) : Color(hex: 0x8C4F3A))
            HillShape(peak: 0.62).fill(variant == 0 ? Color(hex: 0x2C4F40) : Color(hex: 0x6B3A2B)).opacity(0.9)
        }
        .frame(width: 220, height: 290)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Palette.ink, lineWidth: 3))
        .background(RoundedRectangle(cornerRadius: 22).fill(Palette.ink).offset(x: 6, y: 6))
    }
}

private struct HillShape: Shape {
    let peak: Double
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.height * 0.72))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.height * 0.68),
                          control: CGPoint(x: rect.width * peak, y: rect.height * 0.4))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Stats

/// Overview for motivation, plus a share card without any personal photos.
struct StatsView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var shareImage: UIImage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(spacing: 2) {
                        Text("VRIJGEMAAKT").font(.caption.weight(.heavy)).foregroundStyle(Palette.ink)
                        Text(library.streak.freedBytes > 0 ? ByteText.format(library.streak.freedBytes) : "Nog niets")
                            .font(.system(size: 40, weight: .heavy, design: .rounded)).tracking(-1)
                            .minimumScaleFactor(0.6).lineLimit(1)
                        Text("na bevestigd verwijderen").font(.caption).foregroundStyle(Palette.ink)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 18).pop(radius: 20, fill: Palette.reward, shadow: 4)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        tile("\(library.totalReviewed)", "items bekeken")
                        tile("\(library.completedSessions)", library.completedSessions == 1 ? "sessie afgerond" : "sessies afgerond")
                        tile("\(library.streakDays)", "dagen reeks nu")
                        tile("\(library.streak.longest())", "langste reeks")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Bibliotheek bekeken").font(.headline.weight(.heavy))
                            Spacer()
                            Text("\(Int((library.libraryProgress * 100).rounded()))%").font(.headline.weight(.heavy)).monospacedDigit()
                        }
                        bar(library.libraryProgress, Palette.brand)
                        Text("\(library.totalReviewed) van \(library.libraryCount) items").font(.caption).foregroundStyle(Palette.muted)
                    }
                    .padding(14).pop(radius: 16, fill: Palette.surface, shadow: 3)
                    let months = library.recentMonths()
                    if !months.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Per maand").font(.headline.weight(.heavy))
                            ForEach(Array(months.enumerated()), id: \.offset) { _, month in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(month.title.capitalized).font(.subheadline.weight(.semibold))
                                        Spacer()
                                        Text("\(month.reviewed)/\(month.total)").font(.caption.weight(.bold)).monospacedDigit()
                                    }
                                    bar(month.total == 0 ? 0 : Double(month.reviewed) / Double(month.total),
                                        month.reviewed == month.total ? Palette.keep : Palette.reward)
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .padding(14).pop(radius: 16, fill: Palette.surface, shadow: 3)
                    }
                    if let shareImage {
                        let image = Image(uiImage: shareImage)
                        ShareLink(item: image, preview: SharePreview("Mijn Fotoswipe", image: image)) {
                            Label("Deel je resultaat", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(PrimaryStyle())
                        .padding(.top, 4)
                        Text("Het deelkaartje bevat alleen getallen, geen foto's.").font(.caption).foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(20).foregroundStyle(Palette.ink)
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Jouw overzicht").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
            .onAppear { renderShareCard() }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(.title, design: .rounded).weight(.heavy)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
            Text(label).font(.caption.weight(.semibold)).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .pop(radius: 16, fill: Palette.surface, shadow: 3)
        .accessibilityElement(children: .combine)
    }

    private func bar(_ value: Double, _ color: Color) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Capsule().fill(color).frame(width: geometry.size.width * min(max(value, 0), 1))
                Capsule().stroke(Palette.ink, lineWidth: 1.5)
            }
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }

    @MainActor private func renderShareCard() {
        let card = ShareCard(freed: library.streak.freedBytes, reviewed: library.totalReviewed,
                             streak: library.streak.longest(), sessions: library.completedSessions)
            .frame(width: 360, height: 450)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        shareImage = renderer.uiImage
    }
}

/// Numbers only; never a photo from the library.
private struct ShareCard: View {
    let freed: Int64
    let reviewed: Int
    let streak: Int
    let sessions: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("fotoswipe").font(.system(size: 26, weight: .heavy, design: .rounded)).foregroundStyle(Palette.brand)
            Text(freed > 0 ? "Ik heb \(ByteText.format(freed)) vrijgemaakt" : "Ik ruim mijn fotorol op")
                .font(.system(size: 30, weight: .heavy, design: .rounded)).tracking(-0.8).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                stat("\(reviewed)", "bekeken", Palette.surface)
                stat("\(streak)", "dagen reeks", Palette.reward)
                stat("\(sessions)", "sessies", Palette.surface)
            }
            Spacer()
            Text("Bewaar het mooie. Swipe de rest.").font(.system(size: 15, weight: .bold)).foregroundStyle(Palette.muted)
        }
        .padding(26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.background)
    }
    private func stat(_ value: String, _ label: String, _ fill: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 24, weight: .heavy, design: .rounded)).foregroundStyle(Palette.ink)
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .pop(radius: 14, fill: fill, shadow: 3)
    }
}
