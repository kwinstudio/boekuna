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
        print("PASS native navigation policy: \(cases.count) cases")
    }
}
