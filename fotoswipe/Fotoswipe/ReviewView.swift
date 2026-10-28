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
                if selection == 0 && !library.pending.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(library.pending.count) items\(library.pendingBytes > 0 ? " · " + ByteText.format(library.pendingBytes) : "")")
                            .font(.system(size: 30, weight: .heavy, design: .rounded)).tracking(-0.8)
                        Text("Tik op een item om het te bekijken. Met Terug zet je het terug in de stapel.")
                            .font(.subheadline).foregroundStyle(Palette.muted)
                    }.frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(Palette.ink)
                } else {
                    Text("Je selectie uit alle categorieën. Tik op een item om het te bekijken of af te spelen.")
                        .font(.subheadline).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading)
                }
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
                                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.ink, lineWidth: 2))
                                    }.accessibilityLabel("Item bekijken")
                                    Button { library.restore(asset.localIdentifier) } label: {
                                        Label("Terug", systemImage: "arrow.uturn.backward").font(.caption.weight(.bold))
                                            .frame(minHeight: 32)
                                    }.foregroundStyle(Palette.brand).disabled(library.deleting).accessibilityLabel("Item terugzetten in de stapel")
                                }
                            }
                        }
                    }
                }
                if selection == 0 && !library.pending.isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "arrow.uturn.backward.circle.fill").font(.title3).foregroundStyle(Palette.keep)
                        Text("Niets is meteen weg: verwijderde items staan nog 30 dagen in 'Recent verwijderd' in Foto's. Bij iCloud geldt dit ook voor je andere apparaten.")
                            .font(.footnote).foregroundStyle(Palette.ink)
                    }.padding(12).frame(maxWidth: .infinity, alignment: .leading).pop(radius: 14, fill: Palette.surface, shadow: 2)
                    Button { confirm = true } label: {
                        HStack {
                            if library.deleting { ProgressView().tint(Palette.ink) }
                            Text(library.deleting ? "Verwijderen…" : "Verwijder \(library.pending.count) items\(library.pendingBytes > 0 ? " · " + ByteText.format(library.pendingBytes) : "")")
                        }
                    }.buttonStyle(PrimaryStyle(fill: Palette.trash, text: Palette.ink)).disabled(library.deleting || library.loading)
                }
            }.padding(20).background(Palette.background.ignoresSafeArea())
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
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject private var reminders = Reminders.shared
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle("Dagelijkse herinnering", isOn: Binding(get: { reminders.enabled }, set: { on in
                        reminders.setEnabled(on) { library.rescheduleReminders() }
                    }))
                    DatePicker("Tijd", selection: Binding(get: { reminders.time }, set: { date in
                        reminders.setTime(date) { library.rescheduleReminders() }
                    }), displayedComponents: .hourAndMinute)
                    .disabled(!reminders.enabled)
                } header: { Text("Herinnering") } footer: {
                    Text(reminders.denied ? "Meldingen staan uit voor Fotoswipe. Zet ze aan in Instellingen." : "Eén melding per dag op jouw moment, met foto's van die dag uit eerdere jaren. Geen melding als je al klaar bent.")
                }
                Section("Zo werkt Fotoswipe") {
                    Label("Links of kruisje: wegleggen voor controle", systemImage: "arrow.left")
                    Label("Rechts of vinkje: bewaren", systemImage: "arrow.right")
                    Label("Klokje: later beslissen", systemImage: "clock")
                    Label("Terugpijl: laatste keuze herstellen", systemImage: "arrow.uturn.backward")
                    Text("Een sessie is 30 items. Kies je elke dag minstens 10 items of maak je een sessie af, dan groeit je reeks. Eén dag overslaan mag.")
                    Text("Bijna dubbel zoekt foto's die vlak na elkaar zijn gemaakt en op elkaar lijken. De beste staat alvast aangevinkt; met één veeg naar rechts bewaar je die en gaan de andere naar Bekijken. Rommel zet wazige foto's, bonnetjes, notities en screenshots vooraan. Beide werken alleen op je iPhone.")
                    Text("Focus (rechtsboven) toont alleen de foto op het hele scherm. Veeg rechts om te bewaren, links om weg te leggen, omhoog voor later en omlaag om de vorige terug te zetten. Dubbeltik maakt favoriet, vasthouden zoomt in, één tik toont de knoppen.")
                    Text("Grootste eerst zet video's en grote foto's vooraan, zodat je snel veel ruimte wint. De volgorde is een schatting op basis van resolutie en duur.")
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
