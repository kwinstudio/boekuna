import SwiftUI

/// Offline poem starter and rhyme finder. The rhymes in the templates never depend on the
/// name or the hint, so every generated poem still rhymes.
enum PoemHelper {
    static func poems(name rawName: String, hint rawHint: String) -> [String] {
        let name = rawName.trimmed.isEmpty ? "jij" : rawName.trimmed
        let hint = rawHint.trimmed.isEmpty ? "lekker eten" : rawHint.trimmed
        let initial = name.first.map { String($0).uppercased() } ?? "?"
        let templates = [
            """
            Piet liep over het dak in de nacht,
            en heeft daarbij aan {naam} gedacht.
            Want iemand die zo van {hint} kan genieten,
            verdient een cadeau van de Sint en zijn Pieten!
            """,
            """
            Sint zat in Spanje met zijn boek op schoot,
            de bladzijden vol en de stapel was groot.
            Bij de letter {initiaal} bleef hij even staan:
            "Kijk eens aan, wat heeft {naam} gedaan?"
            De Pieten vertelden, met een knipoog erbij,
            dat {naam} gek is op {hint}. Daar werd de Sint blij.
            Dus pak het maar uit en lees het goed,
            want Sint weet precies wat jij hebben moet!
            """,
            """
            Lieve {naam}, Sint moet je iets vertellen,
            de Pieten bleven de hele week bellen:
            "Sint, over {hint} praat {naam} de hele dag door,
            we horen niets anders, we worden er gek van, hoor!"
            Sint moest lachen en streek door zijn baard:
            "Voor {naam} heb ik iets moois bewaard!"
            Hij stopte het snel in zijn grote zak,
            en bracht het naar jou, over menig dak.
            """,
        ]
        return templates.map {
            $0.replacingOccurrences(of: "{naam}", with: name)
                .replacingOccurrences(of: "{hint}", with: hint)
                .replacingOccurrences(of: "{initiaal}", with: initial)
        }
    }

    /// Rhyme part: from the last vowel group to the end ("pakjesavond" -> "ond", "Piet" -> "iet").
    static func rhymeKey(_ word: String) -> String {
        let w = word.lowercased().trimmed.filter(\.isLetter)
        guard !w.isEmpty else { return "" }
        let vowels = Set("aeiouyáéíóúëïöü")
        let chars = Array(w)
        var i = chars.count - 1
        while i >= 0 && !vowels.contains(chars[i]) { i -= 1 }   // trailing consonants
        guard i >= 0 else { return w }
        while i > 0 && vowels.contains(chars[i - 1]) { i -= 1 } // the whole vowel group
        // "ij" behaves like one vowel: include the i before a j-ending.
        if i > 0, chars[i - 1] == "i", i < chars.count, chars[i] == "j" { i -= 1 }
        if i == chars.count - 1, i > 0, chars[i] == "e" {
            // Weak final -e ("blije"): rhyme on the syllable before too.
            var j = i - 1
            while j >= 0 && !vowels.contains(chars[j]) { j -= 1 }
            while j > 0 && vowels.contains(chars[j - 1]) { j -= 1 }
            if j >= 0 { i = j }
        }
        return String(chars[i...])
    }

    static func rhymes(for word: String) -> [String] {
        let key = rhymeKey(word)
        guard key.count >= 2 else { return [] }
        let w = word.lowercased().trimmed
        var seen = Set<String>()
        return words.filter { $0 != w && rhymeKey($0) == key && seen.insert($0).inserted }
    }

    static let words: [String] = """
    baard bewaard aard paard staart kaart haard zwaard gespaard verklaard waard
    boek zoek hoek koek doek vloek broek kloek bezoek
    dak zak gemak pak tak lak vak strak hak opgelet
    nacht gedacht wacht lacht zacht pracht kracht macht bracht verwacht acht dacht
    Piet niet iet liet riet giet ziet geniet verdriet lied gebied
    Sint wint kind vindt lint begint bezint tint blind wind gezind
    schoen doen groen zoen toen fatsoen miljoen kampioen
    pakje takje zakje dakje hakje
    snoep roep stoep groep loep
    goed moet voet zoet bloed hoed spoed gemoed doet groet
    staan gaan gedaan aan baan maan traan
    blij erbij vrij bij mij zij wij hij klei rij partij voorbij
    vertellen bellen tellen snellen wellen knellen spellen
    hoor door voor oor koor spoor gehoor kantoor
    schoorsteen alleen heen been steen meen een geen
    pepernoot groot boot rood brood dood bloot schoot
    chocola cola paella ja na gauw
    taai fraai draai kraai zwaai haai saai
    snel wel spel fel bel hel vel
    cadeau zo ho stro
    lekker bakker wakker
    gedicht licht zicht gezicht plicht dicht bericht sticht
    hoofd beloofd gelooft gedoofd
    jaar klaar paar daar haar maar waar raar zwaar
    jas glas gras plas was pas tas ras
    kat wat dat gat nat plat schat stad pad
    fiets niets iets
    muts puts
    sok rok klok stok blok schok
    trui bui lui kruid
    film
    """.split(whereSeparator: \.isWhitespace).map { String($0).lowercased() }
}

struct PoemHelperView: View {
    let receiverName: String
    let wishlist: String
    let tint: Color

    @Environment(\.dismiss) private var dismiss
    @State private var hint = ""
    @State private var index = 0
    @State private var rhymeWord = ""
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Waar houdt \(receiverName) van?").font(.headline)
                        TextField("Bijv. voetbal, koken, z'n kat", text: $hint)
                            .padding(14)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                    }

                    let poems = PoemHelper.poems(name: receiverName, hint: hint)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(poems[index % poems.count])
                            .font(.system(.body, design: .serif))
                            .lineSpacing(4)
                            .textSelection(.enabled)
                        HStack {
                            Button {
                                Haptics.tap()
                                withAnimation { index += 1 }
                            } label: { Label("Ander opzetje", systemImage: "shuffle").frame(minHeight: 44) }
                            Spacer()
                            Button {
                                UIPasteboard.general.string = poems[index % poems.count]
                                Haptics.success()
                                copied = true
                            } label: { Label(copied ? "Gekopieerd" : "Kopieer", systemImage: copied ? "checkmark" : "doc.on.doc").frame(minHeight: 44) }
                        }
                        .font(.subheadline.weight(.semibold))
                    }
                    .card()
                    Text("Dit is een opzetje. Maak het persoonlijk met een grapje dat alleen jullie snappen.")
                        .font(.footnote).foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Rijmhulp").font(.headline)
                        TextField("Typ een woord, bijv. boek", text: $rhymeWord)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(14)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                        let r = PoemHelper.rhymes(for: rhymeWord)
                        if !rhymeWord.trimmed.isEmpty {
                            if r.isEmpty {
                                Text("Geen rijmwoorden gevonden. Probeer een ander woord.").font(.subheadline).foregroundStyle(.secondary)
                            } else {
                                FlowLayout(spacing: 6) {
                                    ForEach(r, id: \.self) { w in
                                        Text(w).font(.subheadline)
                                            .padding(.horizontal, 12).padding(.vertical, 6)
                                            .background(tint.opacity(0.12), in: Capsule())
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Gedicht")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } } }
            .onChange(of: hint) { _, _ in copied = false }
            .onChange(of: index) { _, _ in copied = false }
            .onAppear {
                // A first hint from the wishlist, if there is one.
                if hint.isEmpty, let first = wishlist.split(whereSeparator: \.isNewline).first {
                    hint = first.trimmingCharacters(in: CharacterSet(charactersIn: "-•* ").union(.whitespaces)).lowercased()
                        .split(separator: " ").prefix(4).joined(separator: " ")
                }
            }
        }
    }
}
