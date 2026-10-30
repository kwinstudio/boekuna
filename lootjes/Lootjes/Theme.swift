import SwiftUI
import UIKit

enum Theme {
    static let red = Color("BrandRed")
    static let gold = Color("BrandGold")
    static let green = Color("BrandGreen")
    static let paper = Color("Paper")
    static let card = Color("Card")
    static let ink = Color.primary

    static func accent(for occasion: Occasion) -> Color {
        occasion == .kerst ? green : red
    }
}

enum Haptics {
    static var enabled: Bool {
        UserDefaults.standard.object(forKey: "haptics") as? Bool ?? true
    }
    static func tap() {
        guard enabled else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func soft(_ intensity: CGFloat = 0.5) {
        guard enabled else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: intensity)
    }
    static func success() {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    static func warning() {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}

/// Big, thumb-reachable primary action (at least 54pt high).
struct PrimaryButton: View {
    let title: String
    var systemImage: String?
    var tint: Color = Theme.red
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView().tint(.white)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title).fontWeight(.semibold)
            }
            .font(.system(.headline, design: .rounded))
            .frame(maxWidth: .infinity, minHeight: 54)
            .foregroundStyle(.white)
            .background(isEnabled ? tint : Color.gray.opacity(0.45), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .disabled(!isEnabled || isLoading)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String?
    var tint: Color = Theme.red
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Label {
                Text(title).fontWeight(.semibold)
            } icon: {
                if let systemImage { Image(systemName: systemImage) }
            }
            .font(.system(.body, design: .rounded))
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
    }
}

extension View {
    func card() -> some View { modifier(CardBackground()) }

    /// Bottom action bar that stays in the thumb zone.
    func bottomBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) { bar() }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .background(.bar)
        }
    }
}

/// Small toast with an optional undo action (undo instead of "are you sure?").
struct ToastData: Equatable {
    let id = UUID()
    let message: String
    var undoTitle: String?
    static func == (lhs: ToastData, rhs: ToastData) -> Bool { lhs.id == rhs.id }
}

struct ToastModifier: ViewModifier {
    @Binding var toast: ToastData?
    var onUndo: (() -> Void)?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let toast {
                HStack(spacing: 12) {
                    Text(toast.message)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                    Spacer(minLength: 0)
                    if let undo = toast.undoTitle, let onUndo {
                        Button(undo) {
                            Haptics.tap()
                            onUndo()
                            self.toast = nil
                        }
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.gold)
                        .frame(minHeight: 44)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.85), in: Capsule())
                .padding(.horizontal, 20)
                .padding(.bottom, 96)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: toast.id) {
                    try? await Task.sleep(for: .seconds(toast.undoTitle == nil ? 2.5 : 5))
                    if self.toast?.id == toast.id {
                        withAnimation { self.toast = nil }
                    }
                }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: toast)
    }
}

extension View {
    func toast(_ toast: Binding<ToastData?>, onUndo: (() -> Void)? = nil) -> some View {
        modifier(ToastModifier(toast: toast, onUndo: onUndo))
    }
}

/// Step indicator for multi-step flows (goal-gradient: show how close you are).
struct StepIndicator: View {
    let current: Int
    let titles: [String]
    var tint: Color = Theme.red

    var body: some View {
        HStack(spacing: 6) {
            ForEach(titles.indices, id: \.self) { i in
                VStack(alignment: .leading, spacing: 4) {
                    Capsule()
                        .fill(i <= current ? tint : Color.secondary.opacity(0.2))
                        .frame(height: 5)
                    Text(titles[i])
                        .font(.caption2.weight(i == current ? .bold : .regular))
                        .foregroundStyle(i == current ? .primary : .secondary)
                        .lineLimit(1)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stap \(current + 1) van \(titles.count): \(titles[current])")
    }
}

struct InitialsBadge: View {
    let name: String
    var size: CGFloat = 40
    var tint: Color = Theme.red

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.14), in: Circle())
            .accessibilityHidden(true)
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}

extension Int {
    /// Cents to "€ 20" / "€ 12,50".
    var euroText: String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "EUR"
        f.locale = Locale(identifier: "nl_NL")
        f.maximumFractionDigits = self % 100 == 0 ? 0 : 2
        return f.string(from: NSNumber(value: Double(self) / 100)) ?? "€ \(self / 100)"
    }
}
