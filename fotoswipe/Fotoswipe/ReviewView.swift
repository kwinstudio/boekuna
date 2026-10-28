import SwiftUI
import Photos

struct ReviewView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var selection = 0
    @State private var confirm = false
    @State private var preview: PreviewItem?
    private var visible: [PHAsset] { selection == 0 ? library.pending : (selection == 1 ? library.kept : library.deferred) }
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Dit is je selectie uit alle categorieën. Tik op een foto om die groter te bekijken. Met Herstel zet je die terug.")
                    .font(.subheadline).foregroundStyle(Palette.muted)
                Picker("Selectie", selection: $selection) {
                    Text("Weggelegd (\(library.pending.count))").tag(0)
                    Text("Bewaard (\(library.kept.count))").tag(1)
                    Text("Later (\(library.deferred.count))").tag(2)
                }.pickerStyle(.segmented).disabled(library.deleting)
                if visible.isEmpty {
                    ContentUnavailableView(selection == 0 ? "Niets weggelegd" : (selection == 1 ? "Nog niets bewaard" : "Niets voor later"), systemImage: "photo.on.rectangle")
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 95))], spacing: 12) {
                            ForEach(visible, id: \.localIdentifier) { asset in
                                VStack(spacing: 6) {
                                    Button { preview = PreviewItem(asset: asset) } label: {
                                        AssetImage(asset: asset, manager: library.images, thumbnail: true)
                                            .id(asset.localIdentifier).frame(height: 135)
                                            .clipShape(RoundedRectangle(cornerRadius: 12))
                                    }.accessibilityLabel("Item bekijken")
                                    Button { library.restore(asset.localIdentifier) } label: {
                                        Label("Herstel", systemImage: "arrow.uturn.backward").font(.caption)
                                    }.disabled(library.deleting).accessibilityLabel("Item terugzetten in de stapel")
                                }
                            }
                        }
                    }
                }
                if selection == 0 && !library.pending.isEmpty {
                    Text("Bij iCloud-items wordt de verwijdering gesynchroniseerd met je andere apparaten. Verwijderde items staan normaal nog 30 dagen in 'Recent verwijderd'.")
                        .font(.caption).foregroundStyle(Palette.muted)
                    Button { confirm = true } label: {
                        HStack {
                            if library.deleting { ProgressView().tint(.white) }
                            Text(library.deleting ? "Verwijderen…" : "Verwijder \(library.pending.count) items")
                        }
                    }.buttonStyle(PrimaryStyle()).disabled(library.deleting || library.loading)
                }
            }.padding(20).background(Palette.background)
                .navigationTitle("Jouw selectie").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() }.disabled(library.deleting) } }
                .confirmationDialog("\(library.pending.count) items verwijderen uit Foto's?", isPresented: $confirm, titleVisibility: .visible) {
                    Button("Verwijder uit Foto's", role: .destructive) { library.deletePending() }
                    Button("Annuleren", role: .cancel) {}
                } message: { Text("Apple vraagt hierna nog om bevestiging. Controleer je selectie eerst.") }
                .sheet(item: $preview) { item in
                    AssetPreviewView(asset: item.asset, manager: library.images)
                }
                .alert("Fotoswipe", isPresented: Binding(get: { library.message != nil }, set: { if !$0 { library.message = nil } })) {
                    Button("OK") { library.message = nil }
                } message: { Text(library.message ?? "") }
        }.interactiveDismissDisabled(library.deleting)
    }
    private struct PreviewItem: Identifiable {
        let asset: PHAsset
        var id: String { asset.localIdentifier }
    }
}

struct InfoView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("Zo werkt Fotoswipe") {
                    Label("Links: wegleggen voor controle", systemImage: "arrow.left")
                    Label("Rechts: bewaren", systemImage: "arrow.right")
                    Label("Terugpijl: laatste keuze herstellen", systemImage: "arrow.uturn.backward")
                    Text("Open 'Bekijken' om je selectie te controleren. Er wordt pas iets verwijderd nadat je dit bevestigt, ook in het venster van Apple.")
                }
                Section("Privacy") {
                    Text("Geen login, advertenties, analytics of eigen server. Fotoswipe bewaart alleen fotokenmerken (lokale identifiers) en je keuzes op dit apparaat. Er worden door Fotoswipe geen items geüpload.")
                    Text("Een foto die alleen in iCloud staat, kan door Apple's Foto's-framework worden opgehaald om die te tonen. Daarvoor kan internet nodig zijn.")
                    Text("Je voortgang blijft bewaard als je de app sluit. Deze gegevens kunnen deel uitmaken van de normale apparaatback-up. Verwijderen van de app verwijdert ook je lokale voortgang.")
                }
                Section("Categorieën en volgorde") {
                    Text("Kies boven de stapel Favorieten, Screenshots, een ander fototype, je eigen album of een maand. De maandlijst toont hoeveel items je al hebt bekeken. Op deze dag toont items van dezelfde datum uit eerdere jaren.")
                    Text("Met Nieuwste eerst of Oudste eerst verander je de volgorde. Bewaren is een keuze in Fotoswipe; via Meer kun je een item ook echt favoriet maken in Foto's, aan een album toevoegen of voor later bewaren. Weggelegde items uit alle categorieën staan samen in Bekijken.")
                }
                Section("Meer mogelijkheden") {
                    Text("Later beslissen bewaart twijfelgevallen voor de categorie Later. Kies 30 willekeurige items voor een korte sessie, of zet de volgorde op Willekeurig.")
                    Text("Vergelijkbare foto's zoeken start je zelf via Meer. Alleen lokaal beschikbare voorbeeldbeelden worden bekeken, zonder foto's te uploaden. Kandidaten zijn niet gegarandeerd identiek; je kiest zelf wat weg mag en houdt minstens één item per groep.")
                }
                Section("Goed om te weten") {
                    Text("Bij beperkte toegang zie je alleen de items die je hebt toegestaan. Via 'Wijzig' kun je die selectie aanpassen; volledige toegang regel je via Instellingen.")
                    Text("Je kunt foto's, Live Photos en video's beoordelen. Video's spelen pas af wanneer je dat kiest. Een Live Photo wordt als volledig item verwijderd, inclusief het bewegende deel.")
                    Text("Als je iCloud-items gebruikt, geldt verwijderen ook voor je andere gekoppelde apparaten.")
                    Text("Verwijder nooit items die je nog nodig hebt zonder een eigen back-up.")
                }
                Section { Text("Fotoswipe 1.0 · testversie").foregroundStyle(Palette.muted) }
            }.navigationTitle("Over Fotoswipe").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
    }
}
