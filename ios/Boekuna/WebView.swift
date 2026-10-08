import SwiftUI
import UIKit
import WebKit

final class BrowserModel: ObservableObject {
    @Published var isLoading = true
    @Published var failureMessage: String?

    fileprivate weak var webView: WKWebView?
    fileprivate let startURL = URL(string: "https://app.boekuna.nl/?login=1&app=1")!

    fileprivate func attach(_ webView: WKWebView) {
        self.webView = webView
        guard webView.url == nil else { return }
        loadStartPage(in: webView)
    }

    fileprivate func loadStartPage(in webView: WKWebView) {
        failureMessage = nil
        isLoading = true
        webView.load(URLRequest(url: startURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    func retry() {
        guard let webView else { return }
        failureMessage = nil
        isLoading = true
        if webView.url == nil {
            loadStartPage(in: webView)
        } else {
            webView.reloadFromOrigin()
        }
    }
}

struct BoekunaWebView: UIViewRepresentable {
    @ObservedObject var model: BrowserModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController.add(context.coordinator, name: "boekunaPrint")

        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        configuration.applicationNameForUserAgent = "BoekunaNative/\(version) Boekuna-iOS/\(version)"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 246 / 255, green: 247 / 255, blue: 248 / 255, alpha: 1)

#if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
#endif

        model.attach(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
        private let model: BrowserModel
        private var downloadURLs: [ObjectIdentifier: URL] = [:]

        init(model: BrowserModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.failureMessage = nil
            model.isLoading = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.failureMessage = nil
            model.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        private func report(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            model.isLoading = false
            model.failureMessage = "Controleer je internetverbinding en probeer het opnieuw."
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let decision = NativeNavigationPolicy.decide(url, download: navigationAction.shouldPerformDownload)
            // Reject purchases/prohibited schemes in every frame before permitting
            // HTTPS document previews (for example an authenticated storage URL).
            if decision == .blocked {
                decisionHandler(.cancel)
                return
            }
            if navigationAction.targetFrame?.isMainFrame == false,
               url.scheme?.lowercased() == "https", !navigationAction.shouldPerformDownload {
                decisionHandler(.allow)
                return
            }
            switch decision {
            case .blocked:
                decisionHandler(.cancel)
            case .externalPage:
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            case .download:
                decisionHandler(.download)
            case .internalPage:
                decisionHandler(.allow)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            model.isLoading = false
            model.failureMessage = "Boekuna is onderbroken. Probeer opnieuw te laden."
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            switch NativeNavigationPolicy.decide(url, download: navigationAction.shouldPerformDownload) {
            case .externalPage:
                UIApplication.shared.open(url)
            case .internalPage, .download:
                if url.absoluteString != "about:blank" {
                    webView.load(navigationAction.request)
                }
            case .blocked:
                break
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            presentAlert(title: "Boekuna", message: message, actions: [
                UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }
            ], fallback: completionHandler)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            guard let presenter = topViewController() else {
                completionHandler(false)
                return
            }
            let alert = UIAlertController(title: "Boekuna", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Annuleren", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            guard let presenter = topViewController() else {
                completionHandler(nil)
                return
            }
            let alert = UIAlertController(title: "Boekuna", message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Annuleren", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
            presenter.present(alert, animated: true)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            // Render the existing report locally; no document content leaves this bridge.
            guard message.name == "boekunaPrint", message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == "app.boekuna.nl",
                  message.frameInfo.securityOrigin.protocol == "https",
                  let body = message.body as? [String: Any],
                  let html = body["html"] as? String, !html.isEmpty,
                  topViewController() != nil else { return }
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = "Boekuna rapport"
            info.outputType = .general
            controller.printInfo = info
            controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
            controller.present(animated: true) { _, _, _ in }
        }

        private func presentAlert(title: String, message: String, actions: [UIAlertAction], fallback: @escaping () -> Void) {
            guard let presenter = topViewController() else {
                fallback()
                return
            }
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            actions.forEach(alert.addAction)
            presenter.present(alert, animated: true)
        }

        private func topViewController() -> UIViewController? {
            let root = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: { $0.isKeyWindow })?
                .rootViewController

            var current = root
            while let presented = current?.presentedViewController {
                current = presented
            }
            if let navigation = current as? UINavigationController { return navigation.visibleViewController ?? navigation }
            if let tabs = current as? UITabBarController { return tabs.selectedViewController ?? tabs }
            return current
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            model.isLoading = false
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            model.isLoading = false
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let filename = (suggestedFilename as NSString).lastPathComponent
            let safeName = filename.isEmpty || filename == "." || filename == ".." ? "Boekuna-bestand" : filename
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
                .appendingPathComponent(safeName)
            do {
                try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                downloadURLs[ObjectIdentifier(download)] = destination
                completionHandler(destination)
            } catch {
                downloadURLs.removeValue(forKey: ObjectIdentifier(download))
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) else { return }
            guard let presenter = topViewController() else {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
                return
            }
            let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            share.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            }
            presenter.present(share, animated: true)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            if let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            }
            model.isLoading = false
            model.failureMessage = "Het bestand kon niet worden gedownload. Probeer het opnieuw."
        }
    }
}
