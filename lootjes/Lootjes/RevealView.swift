import SwiftUI

/// Shows the drawn name only after an explicit tap, so nobody reads along by accident.
/// Plain and calm: no animation beyond a short fade, one haptic confirmation.
struct RevealCard: View {
    let receiverName: String
    var tint: Color = Theme.red
    var caption = "Jij koopt een cadeau voor"
    var onRevealed: () -> Void = {}

    @State private var revealed = false

    var body: some View {
        VStack(spacing: 16) {
            if revealed {
                VStack(spacing: 6) {
                    Text(caption)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(receiverName)
                        .font(.largeTitle.weight(.bold))
                        .minimumScaleFactor(0.5)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .privacySensitive()
                }
                .transition(.opacity)
            } else {
                Image(systemName: "lock.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                VStack(spacing: 4) {
                    Text("Je lootje is verborgen").font(.headline)
                    Text("Zorg dat niemand meekijkt.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                PrimaryButton(title: "Toon mijn lootje", systemImage: "eye", tint: tint) { reveal() }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 200)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: revealed ? .combine : .contain)
    }

    private func reveal() {
        withAnimation(.easeOut(duration: 0.2)) { revealed = true }
        Haptics.success()
        onRevealed()
    }
}
