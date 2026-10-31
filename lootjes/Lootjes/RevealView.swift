import SwiftUI

/// The peak moment: scratch the gold layer off your lootje.
/// Light haptic ticks while scratching, a success tap + confetti when it opens.
/// VoiceOver and Reduce Motion users get a single "reveal" action and a fade.
struct ScratchCard: View {
    let receiverName: String
    var tint: Color = Theme.red
    var caption = "Jij trekt"
    var onRevealed: () -> Void = {}

    @State private var points: [CGPoint] = []
    @State private var revealed = false
    @State private var touched = Set<Int>()
    @State private var ticks = 0
    @State private var confetti = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let gridSize = 12
    private let threshold = 0.5
    private let brush: CGFloat = 46

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // What's underneath.
                VStack(spacing: 10) {
                    Text(caption)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(.secondary)
                    Text(receiverName)
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .minimumScaleFactor(0.4)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(tint)
                        .padding(.horizontal, 16)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.card)

                // The scratch layer.
                if !revealed {
                    ScratchLayer(tint: tint)
                        .mask {
                            Canvas { ctx, size in
                                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.black))
                                ctx.blendMode = .clear
                                for p in points {
                                    ctx.fill(Path(ellipseIn: CGRect(x: p.x - brush / 2, y: p.y - brush / 2, width: brush, height: brush)), with: .color(.black))
                                }
                            }
                        }
                        .transition(.opacity)
                        .highPriorityGesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { v in scratch(at: v.location, in: geo.size) }
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(tint.opacity(0.25), lineWidth: 2))
            .shadow(color: tint.opacity(0.25), radius: 20, y: 10)
            .overlay { if confetti { ConfettiView() .allowsHitTesting(false) } }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(revealed ? "\(caption) \(receiverName)" : "Je lootje, nog dicht")
        .accessibilityHint(revealed ? "" : "Dubbeltik om je lootje te openen")
        .accessibilityAddTraits(revealed ? [] : .isButton)
        .accessibilityAction { reveal() }
    }

    private func scratch(at p: CGPoint, in size: CGSize) {
        guard !revealed, size.width > 0, size.height > 0 else { return }
        points.append(p)
        let cx = Int((p.x / size.width) * CGFloat(gridSize))
        let cy = Int((p.y / size.height) * CGFloat(gridSize))
        let r = 1
        for dx in -r...r { for dy in -r...r {
            let x = cx + dx, y = cy + dy
            if (0..<gridSize).contains(x) && (0..<gridSize).contains(y) { touched.insert(y * gridSize + x) }
        } }
        ticks += 1
        if ticks % 6 == 0 { Haptics.soft(0.35) }
        if Double(touched.count) / Double(gridSize * gridSize) >= threshold { reveal() }
    }

    func reveal() {
        guard !revealed else { return }
        withAnimation(reduceMotion ? .easeInOut(duration: 0.3) : .easeOut(duration: 0.45)) { revealed = true }
        Haptics.success()
        if !reduceMotion { confetti = true }
        onRevealed()
    }
}

private struct ScratchLayer: View {
    let tint: Color
    var body: some View {
        ZStack {
            // Fully opaque base: nothing underneath may shine through.
            Rectangle().fill(Theme.gold)
            LinearGradient(colors: [.clear, .white.opacity(0.22), .clear], startPoint: .topLeading, endPoint: .bottomTrailing)
            Canvas { ctx, size in
                // Subtle diagonal pattern.
                var x: CGFloat = -size.height
                while x < size.width {
                    var p = Path()
                    p.move(to: CGPoint(x: x, y: size.height))
                    p.addLine(to: CGPoint(x: x + size.height, y: 0))
                    ctx.stroke(p, with: .color(.white.opacity(0.12)), lineWidth: 6)
                    x += 22
                }
            }
            VStack(spacing: 8) {
                Image(systemName: "hand.draw.fill").font(.system(size: 34))
                Text("Kras je lootje open")
                    .font(.system(.title3, design: .rounded).weight(.bold))
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.15), radius: 2, y: 1)
        }
    }
}

/// Lightweight confetti burst (one-shot).
struct ConfettiView: View {
    @State private var go = false
    private let pieces: [(x: CGFloat, delay: Double, color: Color, size: CGFloat, spin: Double)] = (0..<40).map { _ in
        (CGFloat.random(in: -1...1), Double.random(in: 0...0.25),
         [Theme.red, Theme.gold, Theme.green, .white].randomElement()!,
         CGFloat.random(in: 6...11), Double.random(in: -360...360))
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(pieces.indices, id: \.self) { i in
                    let p = pieces[i]
                    RoundedRectangle(cornerRadius: 2)
                        .fill(p.color)
                        .frame(width: p.size, height: p.size * 1.6)
                        .rotationEffect(.degrees(go ? p.spin : 0))
                        .position(x: geo.size.width / 2 + (go ? p.x * geo.size.width * 0.6 : 0),
                                  y: go ? geo.size.height + 40 : geo.size.height * 0.35)
                        .opacity(go ? 0 : 1)
                        .animation(.easeOut(duration: 1.6).delay(p.delay), value: go)
                }
            }
        }
        .onAppear { go = true }
        .accessibilityHidden(true)
    }
}
