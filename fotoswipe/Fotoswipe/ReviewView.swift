import SwiftUI
import Photos

struct ReviewView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var showingKept = false
    @State private var confirm = false
    @State private var preview: PreviewItem?
    private var visible: [PHAsset] { showingKept ? library.kept : library.pending }
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Tik op een foto om die groter te bekijken. Met de terugpijl zet je die terug in de stapel.")
                    .font(.subheadline).foregroundStyle(Palette.muted)
                Picker("Selectie", selection: $showingKept) {
                    Text("Weggelegd (\(library.pending.count))").tag(false)
                    Text("Bewaard (\(library.kept.count))").tag(true)
                }.pickerStyle(.segmented).disabled(library.deleting)
                if visible.isEmpty {
                    ContentUnavailableView(showingKept ? "Nog niets bewaard" : "Niets weggelegd", systemImage: "photo.on.rectangle")
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 95))], spacing: 12) {
                            ForEach(visible, id: \.localIdentifier) { asset in
                                VStack(spacing: 6) {
                                    Button { preview = PreviewItem(asset: asset) } label: {
                                        AssetImage(asset: asset, manager: library.images, thumbnail: true)
                                            .id(asset.localIdentifier).frame(height: 135)
                                            .clipShape(RoundedRectangle(cornerRadius: 12))
                                    }.accessibilityLabel("Foto bekijken")
                                    Button { library.restore(asset.localIdentifier) } label: {
                                        Label("Herstel", systemImage: "arrow.uturn.backward").font(.caption)
                                    }.disabled(library.deleting).accessibilityLabel("Foto terugzetten in de stapel")
                                }
                            }
                        }
                    }
                }
                if !showingKept && !library.pending.isEmpty {
                    Text("Bij iCloud-foto's wordt de verwijdering gesynchroniseerd met je andere apparaten. Verwijderde foto's staan normaal nog 30 dagen in 'Recent verwijderd'.")
                        .font(.caption).foregroundStyle(Palette.muted)
                    Button { confirm = true } label: {
                        HStack {
                            if library.deleting { ProgressView().tint(.white) }
                            Text(library.deleting ? "Verwijderen…" : "Verwijder \(library.pending.count) foto's")
                        }
                    }.buttonStyle(PrimaryStyle()).disabled(library.deleting || library.loading)
                }
            }.padding(20).background(Palette.background)
                .navigationTitle("Jouw selectie").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() }.disabled(library.deleting) } }
                .confirmationDialog("\(library.pending.count) foto's verwijderen uit Foto's?", isPresented: $confirm, titleVisibility: .visible) {
                    Button("Verwijder uit Foto's", role: .destructive) { library.deletePending() }
                    Button("Annuleren", role: .cancel) {}
                } message: { Text("Apple vraagt hierna nog om bevestiging. Controleer je selectie eerst.") }
                .sheet(item: $preview) { item in
                    NavigationStack {
                        AssetImage(asset: item.asset, manager: library.images).background(.black)
                            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Sluiten") { preview = nil } } }
                    }
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
                    Text("Geen login, advertenties, analytics of eigen server. Fotoswipe bewaart alleen fotokenmerken (lokale identifiers) en je keuzes op dit apparaat. Er worden door Fotoswipe geen foto's geüpload.")
                    Text("Een foto die alleen in iCloud staat, kan door Apple's Foto's-framework worden opgehaald om die te tonen. Daarvoor kan internet nodig zijn.")
                    Text("Je voortgang blijft bewaard als je de app sluit. Deze gegevens kunnen deel uitmaken van de normale apparaatback-up. Verwijderen van de app verwijdert ook je lokale voortgang.")
                }
                Section("Goed om te weten") {
                    Text("Bij beperkte toegang zie je alleen de foto's die je hebt toegestaan. Via 'Wijzig' kun je die selectie aanpassen; volledige toegang regel je via Instellingen.")
                    Text("Deze versie sorteert foto's en Live Photos; video's worden niet getoond. Een Live Photo wordt als volledig item verwijderd, inclusief het bewegende deel.")
                    Text("Als je iCloud-foto's gebruikt, geldt verwijderen ook voor je andere gekoppelde apparaten.")
                    Text("Verwijder nooit foto's die je nog nodig hebt zonder een eigen back-up.")
                }
                Section { Text("Fotoswipe 1.0 · testversie").foregroundStyle(Palette.muted) }
            }.navigationTitle("Over Fotoswipe").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
    }
}
