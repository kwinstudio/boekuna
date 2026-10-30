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
                        Text(String(localized: "\(library.pending.count) items", bundle: .app) + (library.pendingBytes > 0 ? " · " + ByteText.format(library.pendingBytes) : ""))
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
                    ContentUnavailableView(selection == 0 ? String(localized: "Niets weggelegd", bundle: .app) : (selection == 1 ? String(localized: "Nog niets bewaard", bundle: .app) : String(localized: "Niets voor later", bundle: .app)), systemImage: "photo.on.rectangle")
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
                            Text(library.deleting ? String(localized: "Verwijderen…", bundle: .app) : String(localized: "Verwijder \(library.pending.count) items", bundle: .app) + (library.pendingBytes > 0 ? " · " + ByteText.format(library.pendingBytes) : ""))
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

/// Fixed public pages required by the App Store.
enum AppLinks {
    static let privacy = URL(string: "https://fotoswipe.onrender.com/privacy.html")!
    static let support = URL(string: "https://fotoswipe.onrender.com/support.html")!
}

/// Short on purpose (Hick's law): help first, then a few settings. Long explanations live in "Hoe werkt Fotoswipe?".
struct InfoView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var library: PhotoLibrary
    @ObservedObject private var reminders = Reminders.shared
    @ObservedObject private var languages = LanguageStore.shared
    @AppStorage("fotoswipe.sessionSize") private var sessionSize = 100
    @AppStorage("fotoswipe.haptics") private var haptics = true
    @State private var confirmResetKept = false
    @State private var confirmResetAll = false
    @State private var stats = false
    private var versionText: String {
        let info = Bundle.main.infoDictionary
        return "Fotoswipe \(info?["CFBundleShortVersionString"] as? String ?? "1.0") (\(info?["CFBundleVersion"] as? String ?? "1"))"
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink { HelpView().environmentObject(library) } label: { Label("Hoe werkt Fotoswipe?", systemImage: "questionmark.circle") }
                    Button { stats = true } label: { Label("Jouw overzicht", systemImage: "chart.bar.fill") }
                }
                Section {
                    Picker(selection: Binding(get: { languages.language }, set: { language in
                        languages.set(language)
                        library.refresh(showLoading: false)
                        library.rescheduleReminders()
                    })) {
                        ForEach(AppLanguage.allCases) { language in Text(verbatim: language.nativeName).tag(language) }
                    } label: { Label("Taal", systemImage: "globe") }
                    Picker("Items per sessie", selection: $sessionSize) {
                        ForEach(ReviewSession.sizes, id: \.self) { size in Text("\(size)").tag(size) }
                    }
                    Toggle("Dagelijkse herinnering", isOn: Binding(get: { reminders.enabled }, set: { on in
                        reminders.setEnabled(on) { library.rescheduleReminders() }
                    }))
                    if reminders.enabled {
                        DatePicker("Tijd", selection: Binding(get: { reminders.time }, set: { date in
                            reminders.setTime(date) { library.rescheduleReminders() }
                        }), displayedComponents: .hourAndMinute)
                    }
                    Toggle("Trillen bij keuzes", isOn: $haptics)
                } header: { Text("Instellingen") } footer: {
                    if reminders.denied { Text("Meldingen staan uit voor Fotoswipe. Zet ze aan in Instellingen.") }
                }
                Section {
                    Button("Bewaarde foto's opnieuw bekijken") { confirmResetKept = true }
                    Button("Alle keuzes wissen", role: .destructive) { confirmResetAll = true }
                } header: { Text("Opnieuw beginnen") } footer: {
                    Text("Alleen je keuzes in Fotoswipe veranderen. Je foto's blijven zoals ze zijn.")
                }
                Section {
                    Link(destination: AppLinks.support) { Label("Hulp en contact", systemImage: "envelope") }
                    Link(destination: AppLinks.privacy) { Label("Privacybeleid", systemImage: "hand.raised") }
                } footer: {
                    Text("\(versionText)\nGeen reclame, geen abonnement, geen limiet. Je foto's blijven op je iPhone.")
                }
            }
            .confirmationDialog("Alle bewaarde foto's opnieuw bekijken?", isPresented: $confirmResetKept, titleVisibility: .visible) {
                Button("Opnieuw bekijken") { library.resetAllKept() }
                Button("Annuleren", role: .cancel) {}
            } message: { Text("Ze komen terug in de stapels. Weggelegde items blijven weggelegd.") }
            .confirmationDialog("Alle keuzes wissen?", isPresented: $confirmResetAll, titleVisibility: .visible) {
                Button("Wis alle keuzes", role: .destructive) { library.resetAllChoices() }
                Button("Annuleren", role: .cancel) {}
            } message: { Text("Bewaard, weggelegd en later worden gewist. Er wordt niets uit Foto's verwijderd.") }
            .sheet(isPresented: $stats) { StatsView().environmentObject(library) }
            .navigationTitle("Fotoswipe").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
    }
}

/// "Hoe werkt het": four steps, the gestures, and the questions people actually ask.
struct HelpView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @State private var practice = false
    private let faq: [(String, String)] = [
        (String(localized: "Is een foto meteen weg als ik swipe?", bundle: .app), String(localized: "Nee. Naar links leggen zet een foto alleen opzij. Pas als je in Bekijken op Verwijder tikt en iOS dat bevestigt, gaat hij naar 'Recent verwijderd'. Daar staat hij nog 30 dagen.", bundle: .app)),
        (String(localized: "Waarom komt de ruimte niet direct vrij?", bundle: .app), String(localized: "Verwijderde foto's blijven 30 dagen in Foto's > Albums > Recent verwijderd. Wil je de ruimte meteen? Kies daar Verwijder alles. Een app mag dat album niet zelf legen.", bundle: .app)),
        (String(localized: "Hoe weet Fotoswipe wat rommel of bijna dubbel is?", bundle: .app), String(localized: "Fotoswipe bekijkt kleine voorbeelden van je recentste foto's, alleen op je iPhone. Het is een voorstel: jij beslist altijd zelf, en favorieten komen nooit in Rommel.", bundle: .app)),
        (String(localized: "Wat gebeurt er bij iCloud-foto's?", bundle: .app), String(localized: "Verwijderen geldt ook voor je andere apparaten met dezelfde iCloud-fotobibliotheek. Foto's die alleen in iCloud staan, worden even opgehaald om ze te tonen.", bundle: .app)),
        (String(localized: "Ik gaf alleen toegang tot een paar foto's", bundle: .app), String(localized: "Dan zie je alleen die foto's. Tik op 'Wijzig' boven de stapel om meer te kiezen, of geef volledige toegang in Instellingen > Privacy > Foto's.", bundle: .app)),
        (String(localized: "Raak ik mijn voortgang kwijt?", bundle: .app), String(localized: "Nee, je keuzes worden op je iPhone bewaard en gaan mee in je gewone iPhone-back-up. Als je de app verwijdert, is je voortgang weg; je foto's niet.", bundle: .app)),
        (String(localized: "Wat kost Fotoswipe?", bundle: .app), String(localized: "Niets. Geen reclame, geen abonnement en geen limiet op het aantal swipes.", bundle: .app))
    ]
    var body: some View {
        List {
            Section {
                step(1, String(localized: "Swipe", bundle: .app), String(localized: "Rechts is bewaren, links is wegleggen. Twijfel? Tik op het klokje voor later.", bundle: .app))
                step(2, String(localized: "Controleer", bundle: .app), String(localized: "Tik op 'Weggelegd' onderaan. Tik op een foto om hem toch te bewaren.", bundle: .app))
                step(3, String(localized: "Verwijder", bundle: .app), String(localized: "Tik op Verwijder en bevestig in het venster van iOS.", bundle: .app))
                step(4, String(localized: "Maak ruimte vrij", bundle: .app), String(localized: "Leeg 'Recent verwijderd' in Foto's, of wacht 30 dagen.", bundle: .app))
                Button { practice = true } label: { Label("Oefen het swipen", systemImage: "hand.draw") }
            } header: { Text("In 4 stappen") }
            Section {
                gesture("arrow.right", String(localized: "Naar rechts", bundle: .app), String(localized: "Bewaren", bundle: .app))
                gesture("arrow.left", String(localized: "Naar links", bundle: .app), String(localized: "Wegleggen", bundle: .app))
                gesture("arrow.up", String(localized: "Omhoog", bundle: .app), String(localized: "Later beslissen", bundle: .app))
                gesture("arrow.down", String(localized: "Omlaag", bundle: .app), String(localized: "Vorige terug", bundle: .app))
                gesture("hand.tap", String(localized: "Dubbeltik", bundle: .app), String(localized: "Favoriet in Foto's", bundle: .app))
                gesture("plus.magnifyingglass", String(localized: "Vasthouden", bundle: .app), String(localized: "Inzoomen", bundle: .app))
            } header: { Text("Gebaren in Focus") } footer: {
                Text("Focus (rechtsboven) toont alleen de foto op het hele scherm. Eén tik toont de knoppen.")
            }
            Section {
                ForEach(faq, id: \.0) { item in
                    DisclosureGroup {
                        Text(item.1).font(.subheadline).foregroundStyle(Palette.muted)
                    } label: { Text(item.0).font(.subheadline.weight(.semibold)) }
                }
            } header: { Text("Veelgestelde vragen") }
            Section {
                Link(destination: AppLinks.support) { Label("Andere vraag? Neem contact op", systemImage: "envelope") }
            }
        }
        .navigationTitle("Hoe werkt Fotoswipe?").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $practice) {
            OnboardingView(onAllow: { practice = false }, startPage: 1, replay: true)
                .padding(.horizontal, 20)
                .background(Palette.background.ignoresSafeArea())
        }
    }
    private func step(_ number: Int, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)").font(.headline.weight(.heavy)).foregroundStyle(Palette.ink)
                .frame(width: 30, height: 30).background(Circle().fill(Palette.reward))
                .overlay(Circle().stroke(Palette.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(text).font(.subheadline).foregroundStyle(Palette.muted)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
    private func gesture(_ icon: String, _ name: String, _ result: String) -> some View {
        HStack {
            Label(name, systemImage: icon)
            Spacer()
            Text(result).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }
}
