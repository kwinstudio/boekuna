import SwiftUI
import Photos

struct ContentView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var review = false
    @State private var info = false
    @State private var limitedPicker = false
    @State private var offset: CGSize = .zero

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
            .sheet(isPresented: $limitedPicker, onDismiss: { library.refresh() }) {
                LimitedLibraryPicker { limitedPicker = false; library.refresh() }
                    .ignoresSafeArea()
            }
            .alert("Fotoswipe", isPresented: Binding(get: { library.message != nil && !review }, set: { if !$0 { library.message = nil } })) {
                Button("OK") { library.message = nil }
            } message: { Text(library.message ?? "") }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { library.refresh() }
            }
            .onChange(of: library.current?.localIdentifier) { _, _ in offset = .zero }
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
                Text("\(library.reviewed) van \(library.assets.count) bekeken")
                Spacer()
                Text("\(library.kept.count) bewaard")
            }.font(.caption).foregroundStyle(Palette.muted)
            ProgressView(value: Double(library.reviewed), total: Double(max(1, library.assets.count)))
                .tint(Palette.muted).accessibilityLabel("Voortgang")
            if library.loading {
                Spacer()
                ProgressView("Je foto's ophalen…").tint(Palette.muted)
                Spacer()
            } else if let asset = library.current {
                card(asset)
                Text("← wegleggen     ·     bewaren →").font(.caption).foregroundStyle(Palette.muted)
                HStack(spacing: 28) {
                    circleButton("Laatste keuze ongedaan maken", icon: "arrow.uturn.backward", color: .gray.opacity(0.1), size: 46) { library.undo() }
                        .disabled(!library.canUndo)
                    circleButton("Foto wegleggen", icon: "xmark", color: Palette.coral) { decide(.trash) }
                    circleButton("Foto bewaren", icon: "heart", color: Palette.sage) { decide(.keep) }
                }.disabled(library.deleting)
            } else {
                Spacer()
                Image(systemName: library.assets.isEmpty ? "photo" : "sparkles").font(.system(size: 52)).foregroundStyle(Palette.muted)
                Text(library.assets.isEmpty ? "Nog geen foto's" : "Alles bekeken.")
                    .font(.largeTitle.bold()).foregroundStyle(Palette.ink)
                Text(library.assets.isEmpty ? "Voeg foto's toe of pas je fototoegang aan." : "Controleer je weggelegde foto's voordat je ze verwijdert.")
                    .foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                if library.canUndo { Button("Laatste keuze terugzetten") { library.undo() }.buttonStyle(.bordered) }
                if !library.kept.isEmpty {
                    Button("Bewaarde foto's opnieuw bekijken") { library.reviewKeptAgain() }.buttonStyle(.bordered)
                }
                Button("Ververs bibliotheek") { library.refresh() }.font(.caption)
                Spacer()
            }
            Button { review = true } label: {
                HStack {
                    Image(systemName: "tray")
                    Text("\(library.pending.count) foto's weggelegd")
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
    private func card(_ asset: PHAsset) -> some View {
        ZStack(alignment: .bottomLeading) {
            AssetImage(asset: asset, manager: library.images).id(asset.localIdentifier)
            LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom)
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 5) {
                if asset.isFavorite { Label("Favoriet", systemImage: "heart.fill").font(.caption) }
                Text(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "Zonder datum")
                    .font(.headline)
                Text("\(asset.pixelWidth) × \(asset.pixelHeight)").font(.caption).opacity(0.8)
            }.foregroundStyle(.white).padding(22).allowsHitTesting(false)
            VStack {
                Text(offset.width >= 0 ? "BEWAREN" : "WEGLEGGEN")
                    .font(.title2.bold()).padding(12)
                    .background(offset.width >= 0 ? Palette.sage : Palette.coral, in: RoundedRectangle(cornerRadius: 10))
                    .opacity(min(abs(offset.width) / 90, 1))
                Spacer()
            }.padding(24).allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26))
        .shadow(color: .black.opacity(0.1), radius: 15, y: 8)
        .offset(x: offset.width)
        .rotationEffect(.degrees(reduceMotion ? 0 : Double(offset.width / 24)))
        .frame(maxWidth: .infinity, maxHeight: .infinity).frame(minHeight: 160)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 15)
            .onChanged { value in
                guard !library.deleting else { return }
                offset = CGSize(width: value.translation.width, height: 0)
            }
            .onEnded { value in
                if abs(value.translation.width) > 85 { decide(value.translation.width > 0 ? .keep : .trash) }
                else { withAnimation(reduceMotion ? nil : .spring(response: 0.3)) { offset = .zero } }
            })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Foto van \(asset.creationDate?.formatted(date: .long, time: .omitted) ?? "onbekende datum")\(asset.isFavorite ? ", favoriet" : "")")
        .accessibilityAction(named: Text("Bewaren")) { decide(.keep) }
        .accessibilityAction(named: Text("Wegleggen")) { decide(.trash) }
    }
    private func decide(_ decision: PhotoDecision) {
        library.decide(decision)
        offset = .zero
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
