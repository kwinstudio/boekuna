import SwiftUI
import SafariServices
import LinkPresentation

struct ProductResult: Codable, Identifiable, Equatable {
    let ean: String?
    let title: String
    let url: String
    let imageUrl: String?
    let price: Int?
    var id: String { url }
}

struct ProductSearchResponse: Codable {
    let results: [ProductResult]
    let partnerLinks: Bool
    let shop: String
}

enum WishLine {
    /// One wishlist line for a product: readable for people and with a tappable link.
    static func line(title: String, priceCents: Int?, url: String) -> String {
        let price = priceCents.map { " (\($0.euroText))" } ?? ""
        return "- \(title)\(price)\n  \(url)"
    }

    static func append(_ line: String, to text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? line : trimmed + "\n" + line
    }

    /// Web links in a wishlist (max 6, in order, no duplicates).
    static func urls(in text: String) -> [URL] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return [] }
        var seen = Set<String>()
        return detector.matches(in: text, range: NSRange(text.startIndex..., in: text))
            .compactMap(\.url)
            .filter { ($0.scheme == "https" || $0.scheme == "http") && seen.insert($0.absoluteString).inserted }
            .prefix(6)
            .map { $0 }
    }

    static func searchURL(_ query: String, shop: Shop) -> URL {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        switch shop {
        case .bol: return URL(string: "https://www.bol.com/nl/nl/s/?searchtext=\(q)")!
        case .web: return URL(string: "https://www.google.com/search?tbm=shop&q=\(q)")!
        }
    }

    enum Shop { case bol, web }
}

/// "Zoek een cadeau": products with photo and price when search is set up,
/// otherwise search in Safari and paste the link back.
struct GiftSearchSection: View {
    let tint: Color
    var budgetCents: Int? = nil
    /// Returns true when the wish was saved (only then the row shows a check mark).
    let onAdd: (WishDraft) async -> Bool

    private let catalog = GiftCatalog.shared
    @State private var category: String? = nil
    @State private var showAll = false

    @State private var query = ""
    @State private var results: [ProductResult] = []
    @State private var searching = false
    @State private var inAppAvailable: Bool?
    @State private var partnerLinks = false
    @State private var message: String?
    @State private var safariURL: URL?
    @State private var added = Set<String>()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Zoek een cadeau").font(.headline)
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Bijv. warme sokken, puzzel, boek", text: $query)
                        .submitLabel(.search)
                        .focused($focused)
                        .onSubmit { Task { await search() } }
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Theme.paper, in: RoundedRectangle(cornerRadius: 10))
                if !query.trimmed.isEmpty {
                    Button("Zoek") { Task { await search() } }
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                }
            }

            ideasBlock

            if searching { ProgressView().frame(maxWidth: .infinity) }

            if !results.isEmpty {
                VStack(spacing: 0) {
                    ForEach(results) { p in
                        ProductRow(product: p, tint: tint, added: added.contains(p.id)) {
                            Task { if await onAdd(WishDraft(title: p.title, url: p.url, imageUrl: p.imageUrl, priceCents: p.price)) { added.insert(p.id) } }
                            Haptics.success()
                        }
                        Divider()
                    }
                }
                if partnerLinks {
                    Text("Links naar bol.com zijn partnerlinks: de maker van deze app krijgt een kleine vergoeding, jij betaalt niets extra.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            if let message {
                Text(message).font(.footnote).foregroundStyle(.secondary)
            }

            if !query.trimmed.isEmpty {
                Text("Iets specifieks zoeken?").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    SecondaryButton(title: inAppAvailable == true ? "Producten" : "Bij bol.com", systemImage: "bag", tint: tint) {
                        if inAppAvailable == true { Task { await search() } } else {
                            safariURL = WishLine.searchURL(query.trimmed, shop: .bol)
                        }
                    }
                    SecondaryButton(title: "Op internet", systemImage: "globe", tint: tint) {
                        safariURL = WishLine.searchURL(query.trimmed, shop: .web)
                    }
                }
            }

            HStack(spacing: 8) {
                PasteButton(payloadType: String.self) { strings in
                    guard let text = strings.first else { return }
                    Task { @MainActor in pasted(text) }
                }
                .buttonBorderShape(.capsule)
                .tint(tint)
                .labelStyle(.titleAndIcon)
                Text("Product gevonden? Kopieer de link en plak hem hier.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .card()
        .sheet(item: $safariURL) { url in
            SafariView(url: url).ignoresSafeArea()
        }
        .task { await loadStatus() }
    }

    @ViewBuilder
    private var ideasBlock: some View {
        let typing = query.trimmed.count >= 2
        let list: [GiftIdea] = typing
            ? catalog.search(query, budgetCents: budgetCents)
            : (category.map { catalog.ideas(in: $0, budgetCents: budgetCents) } ?? catalog.popular(budgetCents: budgetCents))
        if !typing {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip(nil, "Populair", "star")
                    ForEach(catalog.categories) { c in chip(c.id, c.name, c.symbol) }
                }
            }
        }
        if typing && list.isEmpty {
            Text("Geen idee gevonden in onze lijst. Zoek hieronder in een winkel.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        let shown = showAll || typing ? list : Array(list.prefix(6))
        VStack(spacing: 0) {
            ForEach(shown) { idea in
                IdeaRow(idea: idea, symbol: catalog.category(idea.category)?.symbol ?? "gift", tint: tint,
                        fits: budgetCents.map { idea.minEuro * 100 <= $0 } ?? true,
                        added: added.contains("idea:\(idea.id)")) {
                    Task { if await onAdd(WishDraft(title: idea.name)) { added.insert("idea:\(idea.id)") } }
                    Haptics.success()
                } look: {
                    safariURL = WishLine.searchURL(idea.name, shop: .bol)
                }
                Divider()
            }
        }
        .animation(.snappy, value: shown)
        if !typing && list.count > 6 {
            Button(showAll ? "Minder tonen" : "Toon alle \(list.count)") { withAnimation(.snappy) { showAll.toggle() } }
                .font(.subheadline.weight(.semibold))
                .frame(minHeight: 40)
        }
    }

    private func chip(_ id: String?, _ title: String, _ symbol: String) -> some View {
        let on = category == id
        return Button {
            Haptics.tap()
            withAnimation(.snappy) { category = id; showAll = false }
        } label: {
            Label(title, systemImage: symbol)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .foregroundStyle(on ? .white : .primary)
                .background(on ? tint : Theme.paper, in: Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func loadStatus() async {
        guard inAppAvailable == nil else { return }
        if let s = try? await API().searchStatus() {
            inAppAvailable = s.available
            partnerLinks = s.partnerLinks
        } else {
            inAppAvailable = false
        }
    }

    private func search() async {
        let q = query.trimmed
        guard q.count >= 2 else { return }
        focused = false
        message = nil
        if inAppAvailable != true { return } // the built-in ideas already show while typing
        searching = true
        defer { searching = false }
        do {
            let r = try await API().searchProducts(q)
            withAnimation(.snappy) { results = r.results }
            partnerLinks = r.partnerLinks
            if r.results.isEmpty { message = "Niets gevonden. Probeer een ander woord of zoek op internet." }
        } catch let e as APIError where e.code == "search_unavailable" {
            inAppAvailable = false
            safariURL = WishLine.searchURL(q, shop: .bol)
        } catch {
            message = error.localizedDescription
        }
    }

    private func pasted(_ text: String) {
        let urls = WishLine.urls(in: text)
        guard let url = urls.first else {
            message = "Er staat geen link op het klembord."
            Haptics.warning()
            return
        }
        // Keep any product name that came along with the link.
        let title = text.replacingOccurrences(of: url.absoluteString, with: "").trimmed
        let name = title.isEmpty || title.count > 120 ? (url.host() ?? url.absoluteString).replacingOccurrences(of: "www.", with: "") : title
        Task {
            if await onAdd(WishDraft(title: name, url: url.absoluteString)) {
                message = "Link toegevoegd."
                Haptics.success()
            } else {
                message = "Niet opgeslagen. Controleer je internet en probeer het opnieuw."
            }
        }
    }
}

private struct IdeaRow: View {
    let idea: GiftIdea
    let symbol: String
    let tint: Color
    let fits: Bool
    let added: Bool
    let add: () -> Void
    let look: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.body)
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(idea.name).font(.subheadline)
                Text(idea.priceText + (fits ? "" : " · boven budget"))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            Button(action: look) {
                Image(systemName: "magnifyingglass").font(.subheadline).foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Bekijk \(idea.name) in een winkel")
            Button(action: add) {
                Image(systemName: added ? "checkmark.circle.fill" : "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(added ? Theme.green : tint)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
            }
            .disabled(added)
            .accessibilityLabel(added ? "Toegevoegd" : "Zet \(idea.name) op je lijstje")
        }
        .padding(.vertical, 4)
    }
}

private struct ProductRow: View {
    let product: ProductResult
    let tint: Color
    let added: Bool
    let add: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: product.imageUrl.flatMap(URL.init(string:))) { img in
                img.resizable().scaledToFit()
            } placeholder: {
                Color.secondary.opacity(0.1)
            }
            .frame(width: 56, height: 56)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 3) {
                Text(product.title).font(.subheadline).lineLimit(2)
                if let p = product.price { Text(p.euroText).font(.subheadline.weight(.semibold)) }
            }
            Spacer(minLength: 4)
            Button(action: add) {
                Image(systemName: added ? "checkmark.circle.fill" : "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(added ? Theme.green : tint)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
            }
            .disabled(added)
            .accessibilityLabel(added ? "Toegevoegd" : "Voeg \(product.title) toe")
        }
        .padding(.vertical, 6)
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

// MARK: - Link previews (photo + title), fetched on the device

@MainActor
final class LinkPreviewCache: ObservableObject {
    static let shared = LinkPreviewCache()
    struct Preview { let title: String?; let image: UIImage?; let host: String }
    @Published private(set) var previews: [URL: Preview] = [:]
    private var loading = Set<URL>()
    private var providers: [URL: LPMetadataProvider] = [:]

    func load(_ url: URL) {
        guard previews[url] == nil, !loading.contains(url) else { return }
        loading.insert(url)
        let provider = LPMetadataProvider()
        providers[url] = provider // keep alive while fetching
        provider.timeout = 8
        provider.startFetchingMetadata(for: url) { meta, _ in
            let host = (url.host() ?? "").replacingOccurrences(of: "www.", with: "")
            let title = meta?.title
            guard let imageProvider = meta?.imageProvider ?? meta?.iconProvider else {
                Task { @MainActor in self.previews[url] = Preview(title: title, image: nil, host: host); self.providers[url] = nil }
                return
            }
            imageProvider.loadObject(ofClass: UIImage.self) { obj, _ in
                let img = obj as? UIImage
                Task { @MainActor in self.previews[url] = Preview(title: title, image: img, host: host); self.providers[url] = nil }
            }
        }
    }
}

/// Cards with photo and title for the links in a wishlist.
struct LinkPreviewList: View {
    let text: String
    @ObservedObject private var cache = LinkPreviewCache.shared
    @Environment(\.openURL) private var openURL

    var body: some View {
        let urls = WishLine.urls(in: text)
        if !urls.isEmpty {
            VStack(spacing: 8) {
                ForEach(urls, id: \.self) { url in
                    let p = cache.previews[url]
                    Button { openURL(url) } label: {
                        HStack(spacing: 12) {
                            Group {
                                if let img = p?.image {
                                    Image(uiImage: img).resizable().scaledToFill()
                                } else {
                                    Image(systemName: "link").foregroundStyle(.secondary)
                                }
                            }
                            .frame(width: 52, height: 52)
                            .background(Color.secondary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p?.title ?? url.absoluteString)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                Text(p?.host ?? (url.host() ?? "")).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                        }
                        .padding(8)
                        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .task { cache.load(url) }
                }
            }
        }
    }
}
