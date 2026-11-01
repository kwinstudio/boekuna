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
    let onAdd: (String) -> Void

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

            if searching { ProgressView().frame(maxWidth: .infinity) }

            if !results.isEmpty {
                VStack(spacing: 0) {
                    ForEach(results) { p in
                        ProductRow(product: p, tint: tint, added: added.contains(p.id)) {
                            onAdd(WishLine.line(title: p.title, priceCents: p.price, url: p.url))
                            added.insert(p.id)
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

            if inAppAvailable == false || !query.trimmed.isEmpty && results.isEmpty && !searching && inAppAvailable != nil {
                HStack(spacing: 8) {
                    SecondaryButton(title: "Zoek bij bol.com", systemImage: "bag", tint: tint) {
                        safariURL = WishLine.searchURL(query.trimmed.isEmpty ? "cadeau" : query.trimmed, shop: .bol)
                    }
                    SecondaryButton(title: "Op internet", systemImage: "globe", tint: tint) {
                        safariURL = WishLine.searchURL(query.trimmed.isEmpty ? "cadeau" : query.trimmed, shop: .web)
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
        if inAppAvailable == false {
            safariURL = WishLine.searchURL(q, shop: .bol)
            return
        }
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
        onAdd(title.isEmpty || title.count > 120 ? "- \(url.absoluteString)" : "- \(title)\n  \(url.absoluteString)")
        message = "Link toegevoegd."
        Haptics.success()
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
                    .foregroundStyle(added ? Color.green : tint)
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
