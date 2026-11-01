import SwiftUI
import WebKit

// MARK: - Shared row

struct WishThumb: View {
    let url: String?
    var size: CGFloat = 52
    var body: some View {
        AsyncImage(url: url.flatMap(URL.init(string:))) { img in
            img.resizable().scaledToFit()
        } placeholder: {
            Image(systemName: "gift").foregroundStyle(.secondary)
        }
        .frame(width: size, height: size)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.primary.opacity(0.06)))
        .accessibilityHidden(true)
    }
}

struct WishItemRow: View {
    let item: WishItem
    var body: some View {
        HStack(spacing: 12) {
            WishThumb(url: item.imageUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.subheadline.weight(.medium)).lineLimit(2)
                HStack(spacing: 6) {
                    if let p = item.priceCents { Text(p.euroText).font(.caption.weight(.semibold)) }
                    if let host = item.url.flatMap(URL.init(string:))?.host() {
                        Text(host.replacingOccurrences(of: "www.", with: "")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let note = item.note, !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - My wishlist (items)

struct MyWishlistView: View {
    let token: String
    let budget: Int?
    let tint: Color
    @Binding var items: [WishItem]

    @Environment(\.dismiss) private var dismiss
    @State private var editing: WishDraft?
    @State private var editingId: String?
    @State private var showShops = false
    @State private var showIdeas = false
    @State private var toast: ToastData?
    @State private var busy = false
    private let api = API()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if items.isEmpty {
                        Text("Nog leeg. Kies hieronder een idee, zoek in een webshop of typ zelf iets.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(items) { item in
                        Button {
                            editingId = item.id
                            editing = WishDraft(title: item.title, url: item.url, imageUrl: item.imageUrl, priceCents: item.priceCents, note: item.note)
                        } label: { WishItemRow(item: item) }
                        .buttonStyle(.plain)
                    }
                    .onDelete(perform: delete)
                    .onMove(perform: move)
                } header: {
                    Text(budget.map { "Mijn wensen · budget \($0.euroText)" } ?? "Mijn wensen")
                } footer: {
                    if items.count > 1 { Text("Veeg naar links om te verwijderen. Met Wijzig zet je je liefste wens bovenaan.") }
                }

                Section("Toevoegen") {
                    AddRow(icon: "lightbulb", title: "Kies uit 100 cadeau-ideeën", subtitle: "Populair, per categorie, binnen je budget") { showIdeas = true }
                    AddRow(icon: "bag", title: "Winkelen in een webshop", subtitle: "Bol.com, Coolblue, Amazon, IKEA en meer") { showShops = true }
                    AddRow(icon: "square.and.pencil", title: "Zelf typen", subtitle: "Bijv. iets lekkers of een boek van een schrijver") {
                        editingId = nil
                        editing = WishDraft()
                    }
                    PasteButton(payloadType: String.self) { strings in
                        guard let text = strings.first else { return }
                        Task { @MainActor in await pasted(text) }
                    }
                    .buttonBorderShape(.capsule)
                    .tint(tint)
                }
            }
            .navigationTitle("Mijn verlanglijstje")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if items.count > 1 { ToolbarItem(placement: .topBarLeading) { EditButton().environment(\.locale, Locale(identifier: "nl_NL")) } }
                ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } }
            }
            .sheet(item: $editing) { draft in
                WishItemEditor(draft: draft, isNew: editingId == nil, tint: tint) { d in
                    await save(d)
                }
            }
            .sheet(isPresented: $showIdeas) {
                NavigationStack {
                    ScrollView {
                        GiftSearchSection(tint: tint, budgetCents: budget) { d in
                            Task { await save(d, id: nil) }
                        }
                        .padding(16)
                    }
                    .background(Theme.paper.ignoresSafeArea())
                    .navigationTitle("Cadeau-ideeën")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Klaar") { showIdeas = false } } }
                }
            }
            .fullScreenCover(isPresented: $showShops) {
                ShopBrowserView(tint: tint) { d in await save(d, id: nil) }
            }
            .toast($toast)
            .overlay { if busy { ProgressView() } }
        }
    }

    private func save(_ d: WishDraft) async { await save(d, id: editingId) }

    private func save(_ d: WishDraft, id: String?) async {
        do {
            if let id {
                let updated = try await api.wishUpdate(token, id: id, d)
                if let i = items.firstIndex(where: { $0.id == id }) { items[i] = updated }
            } else {
                let added = try await api.wishAdd(token, d)
                withAnimation { items.append(added) }
                toast = ToastData(message: "\(added.title) staat op je lijstje")
            }
            Haptics.success()
        } catch {
            toast = ToastData(message: error.localizedDescription)
        }
    }

    private func delete(_ offsets: IndexSet) {
        let removed = offsets.map { items[$0] }
        items.remove(atOffsets: offsets)
        Task {
            for r in removed { try? await api.wishDelete(token, id: r.id) }
        }
    }

    private func move(_ from: IndexSet, _ to: Int) {
        items.move(fromOffsets: from, toOffset: to)
        let ids = items.map(\.id)
        Task { try? await api.wishReorder(token, ids: ids) }
    }

    private func pasted(_ text: String) async {
        guard let url = WishLine.urls(in: text).first else {
            toast = ToastData(message: "Er staat geen link op het klembord.")
            return
        }
        busy = true
        defer { busy = false }
        var d = WishDraft(title: "", url: url.absoluteString)
        if let p = try? await api.linkPreview(url.absoluteString) {
            d.title = p.title ?? ""
            d.imageUrl = p.imageUrl
            d.priceCents = p.priceCents
        }
        if d.title.isEmpty { d.title = (url.host() ?? "").replacingOccurrences(of: "www.", with: "") }
        editingId = nil
        editing = d
    }
}

private struct AddRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void
    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.title3).foregroundStyle(Theme.red).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(.primary)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct WishItemEditor: View {
    @State var draft: WishDraft
    let isNew: Bool
    let tint: Color
    let save: (WishDraft) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var priceText = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if draft.imageUrl != nil || draft.url != nil {
                    Section {
                        HStack(spacing: 12) {
                            WishThumb(url: draft.imageUrl, size: 64)
                            Text(draft.url.flatMap(URL.init(string:))?.host()?.replacingOccurrences(of: "www.", with: "") ?? "")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("Wat wil je graag?") {
                    TextField("Bijv. warme sokken", text: $draft.title, axis: .vertical)
                        .lineLimit(1...3)
                }
                Section {
                    TextField("Prijs (mag leeg)", text: $priceText)
                        .keyboardType(.decimalPad)
                    TextField("Maat, kleur of andere tip (mag leeg)", text: Binding(get: { draft.note ?? "" }, set: { draft.note = $0.isEmpty ? nil : $0 }), axis: .vertical)
                        .lineLimit(1...3)
                } footer: {
                    Text("Een tip helpt je Sint: bijv. maat 42, liever blauw, geen drop.")
                }
            }
            .navigationTitle(isNew ? "Nieuwe wens" : "Wens aanpassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Zet op lijstje" : "Bewaar") {
                        Task {
                            busy = true
                            var d = draft
                            d.title = d.title.trimmed
                            d.priceCents = PriceParser.cents(priceText)
                            await save(d)
                            busy = false
                            dismiss()
                        }
                    }
                    .disabled(draft.title.trimmed.isEmpty || busy)
                }
            }
            .onAppear {
                if let p = draft.priceCents { priceText = String(format: "%.2f", Double(p) / 100).replacingOccurrences(of: ".", with: ",") }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

enum PriceParser {
    /// "12,50" / "€ 12.50" / "12" -> cents; nil when empty or invalid.
    static func cents(_ text: String) -> Int? {
        let cleaned = text.replacingOccurrences(of: "€", with: "").replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard !cleaned.isEmpty, let v = Double(cleaned), v >= 0, v < 10_000 else { return nil }
        return Int((v * 100).rounded())
    }
}

// MARK: - Shop browser: browse any shop and put the product on your list

struct Shop: Identifiable, Hashable {
    let name: String
    let url: String
    /// Brand colour for the letter tile shown while (or when) the shop's own icon can't load.
    let color: UInt32
    var id: String { url }
    var host: String { URL(string: url)?.host()?.replacingOccurrences(of: "www.", with: "") ?? name }
    /// The shop's own site icon, the same one Safari shows for a favourite.
    var iconURL: URL? { URL(string: "https://www.google.com/s2/favicons?sz=128&domain=\(host)") }

    struct Category: Identifiable {
        let name: String
        let icon: String
        let shops: [Shop]
        var id: String { name }
    }

    static let categories: [Category] = [
        Category(name: "Alles onder één dak", icon: "square.grid.2x2", shops: [
            Shop(name: "bol.com", url: "https://www.bol.com/nl/nl/", color: 0x0000A4),
            Shop(name: "Amazon.nl", url: "https://www.amazon.nl/", color: 0x232F3E),
            Shop(name: "HEMA", url: "https://www.hema.nl/", color: 0xE30613),
            Shop(name: "Wehkamp", url: "https://www.wehkamp.nl/", color: 0xFF4F00),
            Shop(name: "de Bijenkorf", url: "https://www.debijenkorf.nl/", color: 0x000000),
        ]),
        Category(name: "Speelgoed", icon: "teddybear", shops: [
            Shop(name: "Intertoys", url: "https://www.intertoys.nl/", color: 0xE2001A),
            Shop(name: "LEGO", url: "https://www.lego.com/nl-nl", color: 0xE3000B),
            Shop(name: "Lobbes", url: "https://www.lobbes.nl/", color: 0x00A3E0),
        ]),
        Category(name: "Elektronica en games", icon: "headphones", shops: [
            Shop(name: "Coolblue", url: "https://www.coolblue.nl/", color: 0x0090E3),
            Shop(name: "MediaMarkt", url: "https://www.mediamarkt.nl/", color: 0xDF0000),
            Shop(name: "Game Mania", url: "https://www.gamemania.nl/", color: 0xE4002B),
        ]),
        Category(name: "Mode en sport", icon: "tshirt", shops: [
            Shop(name: "Zalando", url: "https://www.zalando.nl/", color: 0xFF6900),
            Shop(name: "H&M", url: "https://www2.hm.com/nl_nl/index.html", color: 0xE50010),
            Shop(name: "Decathlon", url: "https://www.decathlon.nl/", color: 0x3643BA),
        ]),
        Category(name: "Verzorging en parfum", icon: "sparkles", shops: [
            Shop(name: "Douglas", url: "https://www.douglas.nl/", color: 0x9BDCD2),
            Shop(name: "Rituals", url: "https://www.rituals.com/nl-nl/", color: 0x3C3C3B),
            Shop(name: "ICI PARIS XL", url: "https://www.iciparisxl.nl/", color: 0x000000),
            Shop(name: "Kruidvat", url: "https://www.kruidvat.nl/", color: 0xE4003A),
            Shop(name: "Etos", url: "https://www.etos.nl/", color: 0x00843D),
        ]),
        Category(name: "Wonen en koken", icon: "house", shops: [
            Shop(name: "IKEA", url: "https://www.ikea.com/nl/nl/", color: 0x0058A3),
            Shop(name: "Blokker", url: "https://www.blokker.nl/", color: 0xE30613),
            Shop(name: "Dille & Kamille", url: "https://www.dille-kamille.nl/", color: 0x5A6E3C),
            Shop(name: "Xenos", url: "https://www.xenos.nl/", color: 0xE4007C),
        ]),
        Category(name: "Boeken", icon: "book", shops: [
            Shop(name: "Bruna", url: "https://www.bruna.nl/", color: 0x00A0DF),
            Shop(name: "Libris", url: "https://www.libris.nl/", color: 0x7A1F3D),
        ]),
        Category(name: "Belevenissen en persoonlijk", icon: "ticket", shops: [
            Shop(name: "Bongo", url: "https://www.bongo.nl/", color: 0xE6007E),
            Shop(name: "YourSurprise", url: "https://www.yoursurprise.nl/", color: 0xF0503C),
            Shop(name: "Tadaaz", url: "https://www.tadaaz.nl/", color: 0x00B3A6),
        ]),
    ]

    static var all: [Shop] { categories.flatMap(\.shops) }

    /// The in-app browser only shows these shops (so it is not an open web browser; keeps the 4+ age rating).
    /// Other sites open in Safari.
    static func isAllowed(_ url: URL) -> Bool {
        guard url.scheme == "https" || url.scheme == "http", let h = url.host()?.lowercased() else { return false }
        return all.contains { shop in
            let base = shop.host.lowercased().split(separator: ".").suffix(2).joined(separator: ".")
            return h == base || h.hasSuffix("." + base)
        }
    }

    /// "coolblue.nl", "www.x.nl/abc" or a full link -> an https URL. Plain words -> nil.
    static func websiteURL(from input: String) -> URL? {
        let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !t.contains(" ") else { return nil }
        let withScheme = t.lowercased().hasPrefix("http://") || t.lowercased().hasPrefix("https://") ? t : "https://\(t)"
        guard let u = URL(string: withScheme), let h = u.host(), h.contains("."),
              let tld = h.split(separator: ".").last, tld.count >= 2, tld.allSatisfy(\.isLetter) else { return nil }
        return u
    }

    static func googleShopping(_ query: String) -> URL? {
        var c = URLComponents(string: "https://www.google.com/search")
        c?.queryItems = [URLQueryItem(name: "tbm", value: "shop"), URLQueryItem(name: "q", value: query)]
        return c?.url
    }
}

/// Recently used shops, newest first (only on this device).
enum RecentShops {
    private static let key = "recentShops"
    static func load() -> [Shop] {
        let urls = UserDefaults.standard.stringArray(forKey: key) ?? []
        return urls.compactMap { u in Shop.all.first { $0.url == u } }
    }
    static func add(_ s: Shop) {
        var urls = UserDefaults.standard.stringArray(forKey: key) ?? []
        urls.removeAll { $0 == s.url }
        urls.insert(s.url, at: 0)
        UserDefaults.standard.set(Array(urls.prefix(4)), forKey: key)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Shop icon on a white rounded tile; falls back to the first letter in the brand colour.
struct ShopIcon: View {
    let shop: Shop
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).fill(Color(hex: shop.color))
            Text(String(shop.name.prefix(1)).uppercased())
                .font(.system(size: size * 0.48, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            AsyncImage(url: shop.iconURL, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                if case .success(let img) = phase {
                    ZStack {
                        RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).fill(.white)
                        img.resizable().interpolation(.high).scaledToFit().padding(size * 0.16)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .overlay(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).strokeBorder(.black.opacity(0.08)))
        .accessibilityHidden(true)
    }
}

/// Reads product name, photo and price from the open page (JSON-LD Product, Open Graph, page title).
enum ProductPageScript {
    static let js = """
    (function(){
      function first(a){return Array.isArray(a)?a[0]:a}
      var out={title:null,image:null,price:null,url:location.href};
      try{
        var nodes=document.querySelectorAll('script[type="application/ld+json"]');
        function walk(o){
          if(!o||typeof o!=='object')return;
          if(Array.isArray(o)){o.forEach(walk);return}
          var t=o['@type']; var isP=(t==='Product'||(Array.isArray(t)&&t.indexOf('Product')>=0));
          if(isP){
            if(!out.title&&o.name)out.title=String(o.name);
            var im=first(o.image); if(im&&typeof im==='object')im=im.url||im.contentUrl; if(!out.image&&im)out.image=String(im);
            var of=first(o.offers); if(of&&out.price==null){var p=of.price!=null?of.price:(of.lowPrice!=null?of.lowPrice:null); if(p!=null&&!isNaN(parseFloat(p)))out.price=parseFloat(String(p).replace(',','.'));}
          }
          for(var k in o){if(o[k]&&typeof o[k]==='object')walk(o[k])}
        }
        nodes.forEach(function(n){try{walk(JSON.parse(n.textContent))}catch(e){}});
      }catch(e){}
      function meta(n){var m=document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]');return m?m.getAttribute('content'):null}
      if(!out.title)out.title=meta('og:title')||document.title;
      if(!out.image)out.image=meta('og:image');
      if(out.price==null){var mp=meta('product:price:amount')||meta('og:price:amount'); if(mp&&!isNaN(parseFloat(mp.replace(',','.'))))out.price=parseFloat(mp.replace(',','.'));}
      if(out.image){try{out.image=new URL(out.image,location.href).href}catch(e){}}
      return JSON.stringify(out);
    })();
    """

    struct Result: Decodable { let title: String?; let image: String?; let price: Double?; let url: String }

    static func draft(from json: String) -> WishDraft? {
        guard let data = json.data(using: .utf8), let r = try? JSONDecoder().decode(Result.self, from: data) else { return nil }
        var title = (r.title ?? "").trimmed
        // Shops often append " | Shopname" to the page title.
        for sep in [" | ", " - ", " – "] where title.contains(sep) {
            if let first = title.components(separatedBy: sep).first, first.count >= 6 { title = first }
        }
        let image = r.image.flatMap { $0.hasPrefix("https://") ? $0 : nil }
        return WishDraft(title: String(title.prefix(160)), url: r.url, imageUrl: image,
                         priceCents: r.price.map { Int(($0 * 100).rounded()) })
    }
}

struct ShopBrowserView: View {
    let tint: Color
    let add: (WishDraft) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var shop: Shop?
    @StateObject private var web = WebState()
    @State private var draft: WishDraft?
    @State private var toast: ToastData?
    @State private var query = ""
    @State private var recent = RecentShops.load()

    private func open(_ s: Shop) {
        Haptics.tap()
        if Shop.all.contains(s) { RecentShops.add(s); recent = RecentShops.load() }
        if let u = URL(string: s.url), !Shop.isAllowed(u) { UIApplication.shared.open(u); return }
        shop = s
        web.load(s.url)
    }

    var body: some View {
        NavigationStack {
            Group {
                if shop == nil {
                    ShopPicker(tint: tint, query: $query, recent: recent) { s in open(s) } openURL: { u, name in
                        if Shop.isAllowed(u) { open(Shop(name: name, url: u.absoluteString, color: 0x8E8E93)) }
                        else { UIApplication.shared.open(u) }
                    }
                } else {
                    WebView(state: web)
                        .ignoresSafeArea(edges: .bottom)
                        .overlay(alignment: .top) {
                            if web.loading { ProgressView(value: web.progress).tint(tint) }
                        }
                        .safeAreaInset(edge: .bottom) {
                            VStack(spacing: 8) {
                                PrimaryButton(title: "Zet op mijn lijstje", systemImage: "plus", tint: tint, isLoading: web.reading) {
                                    Task {
                                        if let d = await web.readProduct() { draft = d } else {
                                            toast = ToastData(message: "Open eerst een productpagina.")
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.bar)
                        }
                }
            }
            .navigationTitle(shop?.name ?? "Winkelen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if shop != nil {
                        Button { if web.canGoBack { web.back() } else { shop = nil } } label: { Image(systemName: "chevron.backward") }
                            .accessibilityLabel("Terug")
                    }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } }
                if shop != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { shop = nil } label: { Image(systemName: "square.grid.2x2") }
                            .accessibilityLabel("Andere winkel")
                    }
                }
            }
            .sheet(item: $draft) { d in
                WishItemEditor(draft: d, isNew: true, tint: tint) { saved in
                    await add(saved)
                    toast = ToastData(message: "Op je lijstje gezet")
                }
            }
            .toast($toast)
        }
    }
}

/// The shop overview: search/any website on top, recently used, then shops per category.
private struct ShopPicker: View {
    let tint: Color
    @Binding var query: String
    let recent: [Shop]
    let open: (Shop) -> Void
    let openURL: (URL, String) -> Void

    private var q: String { query.trimmingCharacters(in: .whitespaces) }
    private var filtered: [Shop] {
        Shop.all.filter { $0.name.localizedCaseInsensitiveContains(q) || $0.host.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        TextField("Zoek een winkel of typ een webadres", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.webSearch)
                            .submitLabel(.go)
                            .onSubmit(submit)
                        if !q.isEmpty {
                            Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }
                                .accessibilityLabel("Wis")
                        }
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                    Text("Tik op een winkel, open een product en tik op \"Zet op mijn lijstje\". Naam, foto en prijs gaan vanzelf mee.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                if !q.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        if let u = Shop.websiteURL(from: q) {
                            wideButton(icon: "safari", title: "Open \(u.host() ?? q)", subtitle: Shop.isAllowed(u) ? "In de app" : "In Safari. Kopieer daar de link en plak hem in je lijstje.") {
                                openURL(u, u.host()?.replacingOccurrences(of: "www.", with: "") ?? q)
                            }
                        }
                        grid(filtered)
                        if let g = Shop.googleShopping(q) {
                            wideButton(icon: "magnifyingglass", title: "Zoek \"\(q)\" in alle winkels", subtitle: "Google Shopping in Safari") {
                                openURL(g, "Google Shopping")
                            }
                        }
                    }
                } else {
                    if !recent.isEmpty { section("Laatst gebruikt", icon: "clock", recent) }
                    ForEach(Shop.categories) { c in section(c.name, icon: c.icon, c.shops) }
                    Label("Staat je winkel er niet bij? Typ bovenin het webadres, bijvoorbeeld lucardi.nl. Die opent in Safari: kopieer daar de link van het product en tik in je lijstje op Plak.", systemImage: "globe")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
    }

    private func submit() {
        if let u = Shop.websiteURL(from: q) { openURL(u, u.host()?.replacingOccurrences(of: "www.", with: "") ?? q) }
        else if let one = filtered.first, filtered.count == 1 { open(one) }
        else if let g = Shop.googleShopping(q) { openURL(g, "Google Shopping") }
    }

    private func section(_ title: String, icon: String, _ shops: [Shop]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            grid(shops)
        }
    }

    private func grid(_ shops: [Shop]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
            ForEach(shops) { s in
                Button { open(s) } label: {
                    HStack(spacing: 12) {
                        ShopIcon(shop: s, size: 36)
                        Text(s.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 60)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("Open \(s.name)")
            }
        }
    }

    private func wideButton(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); action() } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.title3).foregroundStyle(tint).frame(width: 36, height: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(.primary).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 60)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(PressableStyle())
    }
}

@MainActor
final class WebState: NSObject, ObservableObject, WKNavigationDelegate {
    let view: WKWebView
    @Published var loading = false
    @Published var progress = 0.0
    @Published var reading = false
    @Published var canGoBack = false
    private var obs: [NSKeyValueObservation] = []

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .nonPersistent() // no shop cookies kept after closing
        view = WKWebView(frame: .zero, configuration: cfg)
        view.allowsBackForwardNavigationGestures = true
        super.init()
        view.navigationDelegate = self
        obs.append(view.observe(\.estimatedProgress) { [weak self] v, _ in Task { @MainActor in self?.progress = v.estimatedProgress } })
        obs.append(view.observe(\.isLoading) { [weak self] v, _ in Task { @MainActor in self?.loading = v.isLoading; self?.canGoBack = v.canGoBack } })
    }

    func load(_ s: String) { if let u = URL(string: s) { view.load(URLRequest(url: u)) } }

    /// Pages of other sites (not one of the listed shops) open in Safari instead of in the app.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return .allow }
        let mainFrame = action.targetFrame?.isMainFrame ?? true
        if !mainFrame || Shop.isAllowed(url) {
            if action.targetFrame == nil, Shop.isAllowed(url) { webView.load(URLRequest(url: url)); return .cancel } // target=_blank
            return .allow
        }
        if url.scheme == "https" || url.scheme == "http" || url.scheme == "mailto" || url.scheme == "tel" {
            await UIApplication.shared.open(url)
        }
        return .cancel
    }
    func back() { view.goBack() }

    func readProduct() async -> WishDraft? {
        reading = true
        defer { reading = false }
        guard let result = try? await view.evaluateJavaScript(ProductPageScript.js) as? String else { return nil }
        return ProductPageScript.draft(from: result)
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var state: WebState
    func makeUIView(context: Context) -> WKWebView { state.view }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

// MARK: - The receiver's wishlist, seen by the giver

struct ReceiverWishlist: View {
    let receiver: Receiver
    let shopItems: [ShopItem]
    let tint: Color
    let addToShop: (WishItem) -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Verlanglijstje van \(receiver.name)").font(.headline)
            let items = receiver.items ?? []
            if items.isEmpty && receiver.wishlist.trimmed.isEmpty {
                Text("\(receiver.name) heeft nog niets ingevuld. Stel anoniem een vraag om een hint te krijgen.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if !receiver.wishlist.trimmed.isEmpty {
                Text(Linkify.attributed(receiver.wishlist)).font(.body)
            }
            ForEach(items) { item in
                let onList = shopItems.contains { $0.wishItemId == item.id }
                VStack(alignment: .leading, spacing: 8) {
                    WishItemRow(item: item)
                    HStack(spacing: 8) {
                        if let u = item.url.flatMap(URL.init(string:)) {
                            Button { openURL(u) } label: {
                                Label("Bekijk", systemImage: "arrow.up.right").font(.footnote.weight(.semibold))
                                    .padding(.horizontal, 12).frame(minHeight: 36)
                                    .background(Theme.paper, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                        Button {
                            Haptics.tap()
                            addToShop(item)
                        } label: {
                            Label(onList ? "Op je boodschappenlijst" : "Ik koop dit", systemImage: onList ? "checkmark" : "cart.badge.plus")
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 12).frame(minHeight: 36)
                                .foregroundStyle(onList ? Color.green : .white)
                                .background(onList ? Color.green.opacity(0.12) : tint, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(onList)
                    }
                }
                .padding(.vertical, 4)
                Divider()
            }
            if let u = receiver.wishlistUpdatedAt, let date = ISO.parse(u), !items.isEmpty {
                Text("Bijgewerkt \(date.formatted(.relative(presentation: .named).locale(Locale(identifier: "nl_NL"))))")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .card()
    }
}

// MARK: - Private shopping list of the giver

struct ShoppingListCard: View {
    let token: String
    let budget: Int?
    let tint: Color
    @Binding var items: [ShopItem]
    var onChange: () -> Void = {}

    @State private var newTitle = ""
    @State private var newPrice = ""
    @FocusState private var focus: Bool
    private let api = API()
    private let quick = ["Inpakpapier", "Chocoladeletter", "Surprise-materiaal", "Kaartje"]

    private var total: Int { items.compactMap(\.priceCents).reduce(0, +) }
    private var done: Int { items.filter(\.bought).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Mijn boodschappen").font(.headline)
                Spacer()
                if !items.isEmpty {
                    Text("\(done) van \(items.count)").font(.subheadline).foregroundStyle(.secondary)
                        .contentTransition(.numericText())
                }
            }
            Text("Alleen jij ziet dit lijstje.").font(.caption).foregroundStyle(.secondary)
            if let budget {
                VStack(alignment: .leading, spacing: 4) {
                    ProgressView(value: Double(min(total, budget)), total: Double(max(budget, 1)))
                        .tint(total > budget ? .orange : tint)
                    Text("\(total.euroText) van \(budget.euroText)" + (total > budget ? " · boven budget" : ""))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(total > budget ? .orange : .secondary)
                        .contentTransition(.numericText())
                }
            }
            ForEach(items) { item in
                HStack(spacing: 12) {
                    Button { toggle(item) } label: {
                        Image(systemName: item.bought ? "checkmark.circle.fill" : "circle")
                            .font(.title2)
                            .foregroundStyle(item.bought ? Color.green : Color.secondary)
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(item.bought ? "\(item.title), gekocht" : "\(item.title), nog kopen")
                    Text(item.title)
                        .strikethrough(item.bought)
                        .foregroundStyle(item.bought ? .secondary : .primary)
                    Spacer()
                    if let p = item.priceCents { Text(p.euroText).font(.subheadline).foregroundStyle(.secondary) }
                    Button { remove(item) } label: {
                        Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.tertiary).frame(width: 32, height: 44)
                    }
                    .accessibilityLabel("Verwijder \(item.title)")
                }
            }
            HStack(spacing: 8) {
                TextField("Nog iets kopen…", text: $newTitle)
                    .focused($focus)
                    .submitLabel(.done)
                    .onSubmit { add(newTitle) }
                TextField("€", text: $newPrice)
                    .keyboardType(.decimalPad)
                    .frame(width: 64)
                Button { add(newTitle) } label: {
                    Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(tint).frame(width: 44, height: 44)
                }
                .disabled(newTitle.trimmed.isEmpty)
                .accessibilityLabel("Toevoegen")
            }
            .padding(.horizontal, 12)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 10))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(quick.filter { q in !items.contains { $0.title == q } }, id: \.self) { q in
                        Button { add(q) } label: {
                            Label(q, systemImage: "plus").font(.caption.weight(.semibold))
                                .padding(.horizontal, 10).frame(minHeight: 32)
                                .background(Theme.paper, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if !items.isEmpty && done == items.count {
                Label("Alles gekocht. Je cadeau staat op klaar.", systemImage: "gift.fill")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.green)
            }
        }
        .card()
    }

    private func add(_ title: String) {
        let t = title.trimmed
        guard !t.isEmpty else { return }
        let price = PriceParser.cents(newPrice)
        newTitle = ""; newPrice = ""
        Task {
            if let item = try? await api.shopAdd(token, title: t, priceCents: price, wishItemId: nil) {
                withAnimation { items.append(item) }
                Haptics.tap()
                onChange()
            }
        }
    }

    private func toggle(_ item: ShopItem) {
        guard let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        withAnimation(.snappy) { items[i].bought.toggle() }
        if items[i].bought { Haptics.success() } else { Haptics.tap() }
        let bought = items[i].bought
        Task {
            _ = try? await api.shopUpdate(token, id: item.id, bought: bought)
            onChange()
        }
    }

    private func remove(_ item: ShopItem) {
        withAnimation { items.removeAll { $0.id == item.id } }
        Task {
            try? await api.shopDelete(token, id: item.id)
            onChange()
        }
    }
}
