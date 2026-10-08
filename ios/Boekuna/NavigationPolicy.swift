import Foundation

// The companion can open support/privacy links, but never an external purchase flow.
// Shared by normal navigation and window.open so redirects cannot bypass the policy.
enum NativeNavigationDecision: Equatable {
    case internalPage, externalPage, download, blocked
}

enum NativeNavigationPolicy {
    static func decide(_ url: URL, download: Bool = false) -> NativeNavigationDecision {
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if host == "stripe.com" || host.hasSuffix(".stripe.com") { return .blocked }
        if ["boekuna.nl", "www.boekuna.nl", "app.boekuna.nl"].contains(host),
           path == "/prijzen" || path.hasPrefix("/prijzen/") { return .blocked }
        if host == "app.boekuna.nl", query.contains(where: { ["plan", "billing", "session_id"].contains($0.name.lowercased()) }) {
            return .blocked
        }
        if scheme == "mailto" || scheme == "tel" { return .externalPage }
        if scheme == "about", url.absoluteString == "about:blank" { return .internalPage }
        if scheme == "blob" { return download ? .download : .internalPage }
        guard scheme == "https" else { return .blocked }
        if download { return .download }
        return host == "app.boekuna.nl" ? .internalPage : .externalPage
    }
}
