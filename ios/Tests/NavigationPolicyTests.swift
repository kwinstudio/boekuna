import Foundation

@main
struct NavigationPolicyTests {
    static func main() {
        let cases: [(String, Bool, NativeNavigationDecision)] = [
            ("https://app.boekuna.nl/?login=1&app=1", false, .internalPage),
            ("https://app.boekuna.nl/?billing=success", false, .blocked),
            ("https://app.boekuna.nl/?plan=zzp", false, .blocked),
            ("https://checkout.stripe.com/c/pay/test", false, .blocked),
            ("https://billing.stripe.com/p/session/test", false, .blocked),
            ("https://boekuna.nl/prijzen/", false, .blocked),
            ("https://www.boekuna.nl/prijzen", false, .blocked),
            ("https://boekuna.nl/privacy/", false, .externalPage),
            ("https://boekuna.nl/support/", false, .externalPage),
            ("mailto:support@boekuna.nl", false, .externalPage),
            ("tel:+31101234567", false, .externalPage),
            ("http://app.boekuna.nl/", false, .blocked),
            ("javascript:alert(1)", false, .blocked),
            ("file:///private/document.pdf", false, .blocked),
            ("blob:https://app.boekuna.nl/document", true, .download),
            ("https://app.boekuna.nl/document.pdf", true, .download),
            ("https://checkout.stripe.com/file", true, .blocked),
            ("about:blank", false, .internalPage)
        ]
        for (text, download, expected) in cases {
            let result = NativeNavigationPolicy.decide(URL(string: text)!, download: download)
            precondition(result == expected, "\(text): expected \(expected), got \(result)")
        }
        let srcdoc = URL(string: "about:srcdoc")!
        precondition(NativeNavigationPolicy.decide(srcdoc, isMainFrame: false) == .internalPage,
                     "Existing iframe.srcdoc A4 previews must remain available")
        precondition(NativeNavigationPolicy.decide(srcdoc) == .blocked,
                     "Main-frame about:srcdoc must remain blocked")
        precondition(NativeNavigationPolicy.decide(srcdoc, download: true, isMainFrame: false) == .blocked,
                     "The srcdoc preview exception must not permit downloads")
        precondition(NativeNavigationPolicy.decide(URL(string: "https://checkout.stripe.com/c/pay/test")!, isMainFrame: false) == .blocked,
                     "Subframes must not bypass purchase blocking")
        precondition(NativeNavigationPolicy.decide(URL(string: "javascript:alert(1)")!, isMainFrame: false) == .blocked,
                     "Subframes must not bypass scheme blocking")
        print("PASS native navigation policy: \(cases.count + 5) cases")
    }
}
