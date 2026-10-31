import SwiftUI
import UIKit

/// Everyone is in the same room: the phone goes round, each person picks their own name,
/// scratches their lootje, and hides it again before passing it on.
struct PassPhoneView: View {
    let names: [String]
    var tint: Color = Theme.red
    @Binding var seen: Set<String>
    /// Returns the receiver's name for this person.
    let resolve: (String) async throws -> String

    @Environment(\.dismiss) private var dismiss
    @State private var current: String?
    @State private var receiver: String?
    @State private var confirmName: String?
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            Group {
                if let current, let receiver {
                    revealStage(person: current, receiver: receiver)
                } else {
                    pickStage
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle(current == nil ? "Geef de telefoon door" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if current == nil {
                    ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } }
                }
            }
        }
        .interactiveDismissDisabled(current != nil)
    }

    private var pickStage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("\(seen.count) van \(names.count) hebben gekeken")
                        .font(.headline)
                    Spacer()
                    ProgressView(value: Double(seen.count), total: Double(max(names.count, 1)))
                        .tint(tint)
                        .frame(width: 100)
                }
                .card()
                Text("Wie heeft de telefoon nu?")
                    .font(.title3.weight(.bold))
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                    ForEach(names, id: \.self) { n in
                        let done = seen.contains(n)
                        Button {
                            Haptics.tap()
                            confirmName = n
                        } label: {
                            HStack(spacing: 10) {
                                InitialsBadge(name: n, size: 36, tint: done ? .gray : tint)
                                Text(n).font(.body.weight(.semibold)).lineLimit(1)
                                Spacer(minLength: 0)
                                if done { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                            }
                            .padding(12)
                            .frame(minHeight: 60)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                            .opacity(done ? 0.55 : 1)
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityLabel(done ? "\(n), heeft al gekeken" : n)
                    }
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if seen.count == names.count && !names.isEmpty {
                    Label("Iedereen heeft zijn lootje gezien. Veel plezier!", systemImage: "party.popper.fill")
                        .font(.headline)
                        .foregroundStyle(tint)
                        .card()
                }
            }
            .padding(20)
        }
        .overlay { if loading { ProgressView().controlSize(.large) } }
        .confirmationDialog(confirmName.map { "Ben jij \($0)?" } ?? "", isPresented: Binding(get: { confirmName != nil }, set: { if !$0 { confirmName = nil } }), titleVisibility: .visible) {
            if let n = confirmName {
                Button("Ja, ik ben \(n)") { Task { await open(n) } }
                Button("Nee", role: .cancel) { confirmName = nil }
            }
        } message: {
            if let n = confirmName, seen.contains(n) {
                Text("\(n) heeft al gekeken. Alleen \(n) mag nog eens kijken.")
            } else {
                Text("Kijk alleen naar je eigen lootje.")
            }
        }
    }

    private func open(_ name: String) async {
        loading = true
        defer { loading = false }
        do {
            receiver = try await resolve(name)
            withAnimation { current = name }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func revealStage(person: String, receiver: String) -> some View {
        VStack(spacing: 24) {
            Text(person)
                .font(.title2.weight(.bold))
            RevealCard(receiverName: receiver, tint: tint, caption: "\(person), jij koopt een cadeau voor") {
                seen.insert(person)
            }
            Text("Onthoud de naam goed. Daarna verberg je hem weer.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .padding(20)
        .bottomBar {
            PrimaryButton(title: "Verberg en geef door", systemImage: "eye.slash.fill", tint: tint) {
                withAnimation {
                    current = nil
                    self.receiver = nil
                }
            }
        }
        .privacySensitive()
    }
}

/// UIKit share sheet with a completion callback (SwiftUI's ShareLink has none),
/// so we can mark a personal link as "sent".
enum Share {
    @MainActor
    static func present(text: String, completion: ((Bool) -> Void)? = nil) {
        let vc = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        vc.completionWithItemsHandler = { _, completed, _, _ in completion?(completed) }
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?.rootViewController else { return }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        vc.popoverPresentationController?.sourceView = top.view
        vc.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 80, width: 1, height: 1)
        top.present(vc, animated: true)
    }

    static func personalMessage(name: String, group: String, occasion: Occasion, url: URL) -> String {
        let what = occasion == .sinterklaas ? "Sinterklaas" : (occasion == .kerst ? "de kerst" : group)
        return "Hoi \(name)! Je lootje voor \(what) (\(group)) staat klaar. Deze link is alleen voor jou, dus stuur hem niet door: \(url.absoluteString)"
    }

    static func inviteMessage(group: String, url: URL, budget: Int?) -> String {
        var s = "Doe je mee met lootjes trekken voor \(group)? Meld je hier aan, het duurt 10 seconden: \(url.absoluteString)"
        if let budget { s += "\nBudget: \(budget.euroText)" }
        return s
    }
}
