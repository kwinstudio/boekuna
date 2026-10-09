import SwiftUI

struct RootView: View {
    @StateObject private var browser = BrowserModel()

    var body: some View {
        ZStack {
            // Keep the web page below the status bar (like Safari); only the
            // bottom edge runs under the home indicator.
            BoekunaWebView(model: browser)
                .ignoresSafeArea(.container, edges: .bottom)

            if browser.isLoading {
                LoadingView()
                    .transition(.opacity)
            }

            if let failureMessage = browser.failureMessage {
                FailureView(message: failureMessage, retry: browser.retry)
                    .transition(.opacity)
            }
        }
        .background(browser.statusBarColor.ignoresSafeArea())
        .animation(.easeOut(duration: 0.18), value: browser.isLoading)
        .animation(.easeOut(duration: 0.18), value: browser.failureMessage)
    }
}

/// Plain background in the colour of the web welcome screen, so starting the app
/// shows one welcome screen instead of two. A spinner only appears when loading
/// takes a while.
private struct LoadingView: View {
    @State private var showSpinner = false

    var body: some View {
        ZStack {
            if showSpinner {
                ProgressView()
                    .controlSize(.large)
                    .tint(Color(red: 99 / 255, green: 212 / 255, blue: 113 / 255))
                    .accessibilityLabel("Boekuna laden")
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("LaunchBackground"))
        .task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            withAnimation(.easeOut(duration: 0.2)) { showSpinner = true }
        }
    }
}

private struct FailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .semibold))
                .accessibilityHidden(true)

            Text("Boekuna kan niet laden")
                .font(.title3.bold())

            Text(message)
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Opnieuw proberen", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 99 / 255, green: 212 / 255, blue: 113 / 255))
                .foregroundStyle(Color(red: 27 / 255, green: 31 / 255, blue: 35 / 255))
        }
        .padding(28)
        .frame(maxWidth: 420)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("LaunchBackground").opacity(0.98))
        .accessibilityElement(children: .contain)
    }
}
