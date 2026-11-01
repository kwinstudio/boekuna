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
    var id: String { url }
    static let all: [Shop] = [
        Shop(name: "bol.com", url: "https://www.bol.com/nl/nl/"),
        Shop(name: "Coolblue", url: "https://www.coolblue.nl/"),
        Shop(name: "Amazon.nl", url: "https://www.amazon.nl/"),
        Shop(name: "Zalando", url: "https://www.zalando.nl/"),
        Shop(name: "IKEA", url: "https://www.ikea.com/nl/nl/"),
        Shop(name: "HEMA", url: "https://www.hema.nl/"),
        Shop(name: "Intertoys", url: "https://www.intertoys.nl/"),
        Shop(name: "Douglas", url: "https://www.douglas.nl/"),
        Shop(name: "Bruna", url: "https://www.bruna.nl/"),
        Shop(name: "Blokker", url: "https://www.blokker.nl/"),
        Shop(name: "Rituals", url: "https://www.rituals.com/nl-nl/"),
        Shop(name: "Google Shopping", url: "https://www.google.com/search?tbm=shop&q=cadeau"),
    ]
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

    var body: some View {
        NavigationStack {
            Group {
                if shop == nil {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Kies een winkel, zoek je cadeau en tik op een product. Daarna tik je op \"Zet op mijn lijstje\": de naam, foto en prijs gaan vanzelf mee.")
                                .font(.subheadline).foregroundStyle(.secondary)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                                ForEach(Shop.all) { s in
                                    Button {
                                        Haptics.tap()
                                        shop = s
                                        web.load(s.url)
                                    } label: {
                                        HStack {
                                            Image(systemName: "bag").foregroundStyle(tint)
                                            Text(s.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                                            Spacer(minLength: 0)
                                        }
                                        .padding(14)
                                        .frame(minHeight: 54)
                                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                                    }
                                    .buttonStyle(PressableStyle())
                                }
                            }
                        }
                        .padding(20)
                    }
                    .background(Theme.paper.ignoresSafeArea())
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
