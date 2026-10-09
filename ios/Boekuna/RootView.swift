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

/// Plain background in the colour of the web intro, so starting the app shows one
/// brand intro instead of two (the page draws the animated Boekuna intro itself).
/// Only when the page is slow to arrive does a calm breathing green dot appear,
/// in the middle of the screen; never a generic spinner.
private struct LoadingView: View {
    @State private var showDot = false
    @State private var dimmed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if showDot {
                Circle()
                    .fill(Color(red: 99 / 255, green: 212 / 255, blue: 113 / 255))
                    .frame(width: 10, height: 10)
                    .opacity(dimmed ? 0.4 : 1)
                    .accessibilityLabel("Boekuna laden")
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("LaunchBackground"))
        .ignoresSafeArea(.container, edges: .bottom)
        .task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            withAnimation(.easeOut(duration: 0.3)) { showDot = true }
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { dimmed = true }
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
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("LaunchBackground").opacity(0.98))
        .accessibilityElement(children: .contain)
    }
}
