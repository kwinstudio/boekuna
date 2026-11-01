import SwiftUI

// Festive layer on top of the calm layout: seasonal header with countdown and gently
// falling snow / stars, an envelope reveal, and a short "drawing" moment.
// All of it switches off with the setting "Feestelijke animaties" or iOS Reduce Motion.

enum Season: Equatable {
    case sint, kerst, neutral

    /// The season right now: Sinterklaas until 5 December, then Christmas until 6 January.
    static func current(_ now: Date = .now, calendar: Calendar = .current) -> Season {
        let m = calendar.component(.month, from: now)
        let d = calendar.component(.day, from: now)
        if m == 11 || (m == 12 && d <= 5) { return .sint }
        if (m == 12 && d > 5) || (m == 1 && d <= 6) { return .kerst }
        return .neutral
    }

    static func of(_ occasion: Occasion) -> Season {
        switch occasion {
        case .sinterklaas: .sint
        case .kerst: .kerst
        case .anders: current()
        }
    }

    var gradient: [Color] {
        switch self {
        case .sint: [Color(red: 0.70, green: 0.15, blue: 0.12), Color(red: 0.45, green: 0.07, blue: 0.08)]
        case .kerst: [Color(red: 0.12, green: 0.42, blue: 0.29), Color(red: 0.06, green: 0.24, blue: 0.17)]
        case .neutral: [Color(red: 0.70, green: 0.15, blue: 0.12), Color(red: 0.45, green: 0.07, blue: 0.08)]
        }
    }

    var symbol: String {
        switch self {
        case .sint: "gift.fill"
        case .kerst: "tree.fill"
        case .neutral: "sparkles"
        }
    }
}

enum Festive {
    /// Setting plus the system's Reduce Motion.
    static func enabled(reduceMotion: Bool) -> Bool {
        let on = UserDefaults.standard.object(forKey: "festive") as? Bool ?? true
        return on && !reduceMotion
    }
}

/// Gently falling snow (Christmas) or tiny gold stars (Sinterklaas). Cheap: one Canvas.
struct FestiveParticles: View {
    let season: Season
    var count = 26

    private struct P { let x: Double; let y: Double; let size: Double; let speed: Double; let sway: Double; let phase: Double }
    @State private var particles: [P]

    init(season: Season, count: Int = 26) {
        self.season = season
        self.count = count
        _particles = State(initialValue: (0..<count).map { _ in
            P(x: .random(in: 0...1), y: .random(in: 0...1), size: .random(in: 3...7),
              speed: .random(in: 8...22), sway: .random(in: 3...10), phase: .random(in: 0...6.28))
        })
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
            Canvas { ctx, size in
                let t = timeline.date.timeIntervalSinceReferenceDate
                for p in particles {
                    let y = (p.y * size.height + t * p.speed).truncatingRemainder(dividingBy: size.height + 20) - 10
                    let x = p.x * size.width + sin(t * 0.8 + p.phase) * p.sway
                    let r = CGRect(x: x, y: y, width: p.size, height: p.size)
                    if season == .kerst {
                        ctx.fill(Path(ellipseIn: r), with: .color(.white.opacity(0.45)))
                    } else {
                        ctx.fill(star(in: r), with: .color(Color(red: 1, green: 0.84, blue: 0.45).opacity(0.5)))
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func star(in r: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: r.midX, y: r.midY)
        let outer = r.width / 2, inner = outer * 0.45
        for i in 0..<10 {
            let a = Double(i) * .pi / 5 - .pi / 2
            let rad = i.isMultiple(of: 2) ? outer : inner
            let pt = CGPoint(x: c.x + cos(a) * rad, y: c.y + sin(a) * rad)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

/// Seasonal header with a live countdown. Clear information first, decoration second.
struct FestiveHeader: View {
    let season: Season
    let title: String
    var date: Date?
    var eventWord = "pakjesavond"
    var detail: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @ScaledMetric(relativeTo: .largeTitle) private var countSize: CGFloat = 40

    private var days: Int? {
        guard let date else { return nil }
        let cal = Calendar.current
        let d = cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: cal.startOfDay(for: date)).day ?? 0
        return d >= 0 ? d : nil
    }

    var body: some View {
        let festive = Festive.enabled(reduceMotion: reduceMotion)
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(2)
                if let date {
                    Text(DayFormat.long(date).capitalizedFirst)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.85))
                }
                if let detail {
                    Text(detail).font(.subheadline).foregroundStyle(.white.opacity(0.85))
                }
            }
            Spacer(minLength: 8)
            if let days, days == 0 {
                Text("Vandaag!")
                    .font(.title.weight(.bold))
                    .foregroundStyle(.white)
            } else if let days {
                VStack(spacing: 0) {
                    Text("\(appeared ? days : 0)")
                        .font(.system(size: min(countSize, 64), weight: .bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .contentTransition(.numericText(countsDown: false))
                    Text(days == 1 ? "dag tot \(eventWord)" : "dagen tot \(eventWord)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                }
                .frame(minWidth: 90)
                .accessibilityElement(children: .combine)
            } else {
                Image(systemName: season.symbol)
                    .font(.system(size: 34))
                    .foregroundStyle(.white)
                    .symbolEffect(.bounce, options: .nonRepeating, value: festive ? appeared : false)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 110, alignment: .leading)
        .background {
            ZStack {
                LinearGradient(colors: season.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                if festive { FestiveParticles(season: season) }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear {
            if festive {
                withAnimation(.snappy(duration: 0.9).delay(0.15)) { appeared = true }
            } else {
                appeared = true
            }
        }
    }
}

/// The envelope: seal pops, flap opens, the letter rises with the name.
struct EnvelopeReveal: View {
    let receiverName: String
    var caption = "Jij koopt een cadeau voor"
    var season: Season = .sint
    var onRevealed: () -> Void = {}
    /// Demo/screenshot only: open by itself after a moment.
    var autoOpen = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage = 0 // 0 closed, 1 seal gone, 2 flap open, 3 letter up
    @State private var sparkle = false

    var body: some View {
        let festive = Festive.enabled(reduceMotion: reduceMotion)
        VStack(spacing: 16) {
            ZStack {
                // Letter (inside the envelope until stage 3).
                VStack(spacing: 6) {
                    Text(caption).font(.subheadline).foregroundStyle(.secondary)
                    Text(receiverName)
                        .font(.largeTitle.weight(.bold))
                        .minimumScaleFactor(0.5)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .privacySensitive()
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 130)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .shadow(color: .black.opacity(stage >= 3 ? 0.12 : 0), radius: 12, y: 6)
                .padding(.horizontal, 14)
                .offset(y: stage >= 3 ? 0 : 30)
                .opacity(stage >= 2 ? 1 : 0)
                .zIndex(stage >= 3 ? 3 : 1)

                // Envelope body.
                EnvelopeShape()
                    .fill(LinearGradient(colors: season.gradient, startPoint: .top, endPoint: .bottom))
                    .frame(height: 150)
                    .offset(y: 40)
                    .opacity(stage >= 3 ? 0 : 1)
                    .zIndex(2)

                // Flap.
                FlapShape()
                    .fill(LinearGradient(colors: [season.gradient[0], season.gradient[0].opacity(0.85)], startPoint: .top, endPoint: .bottom))
                    .overlay(FlapShape().stroke(.white.opacity(0.18), lineWidth: 1))
                    .shadow(color: .black.opacity(0.28), radius: 4, y: 3)
                    .frame(height: 80)
                    .rotation3DEffect(.degrees(stage >= 2 ? 180 : 0), axis: (x: 1, y: 0, z: 0), anchor: .top, perspective: 0.6)
                    .offset(y: -15)
                    .opacity(stage >= 3 ? 0 : 1)
                    .zIndex(stage >= 2 ? 0 : 2.5)

                // Wax seal.
                Circle()
                    .fill(Color(red: 0.93, green: 0.76, blue: 0.33))
                    .frame(width: 52, height: 52)
                    .overlay(Image(systemName: season.symbol).foregroundStyle(season.gradient[1]))
                    .offset(y: 22)
                    .scaleEffect(stage >= 1 ? 0.01 : 1)
                    .opacity(stage >= 1 ? 0 : 1)
                    .zIndex(4)

                if sparkle { SparkleBurst(color: Color(red: 0.93, green: 0.76, blue: 0.33)).zIndex(5) }
            }
            .frame(height: stage >= 3 ? 150 : 210)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(stage >= 3 ? "\(caption) \(receiverName)" : "Je lootje, nog dicht")

            if stage == 0 {
                Text("Zorg dat niemand meekijkt.").font(.subheadline).foregroundStyle(.secondary)
                PrimaryButton(title: "Open mijn lootje", systemImage: "envelope.open", tint: Theme.red) { open(festive: festive) }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .task {
            guard autoOpen else { return }
            try? await Task.sleep(for: .seconds(2.5))
            open(festive: festive)
        }
    }

    private func open(festive: Bool) {
        guard stage == 0 else { return }
        Haptics.tap()
        guard festive else {
            withAnimation(.easeOut(duration: 0.2)) { stage = 3 }
            Haptics.success()
            onRevealed()
            return
        }
        Task { @MainActor in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { stage = 1 }
            try? await Task.sleep(for: .milliseconds(220))
            withAnimation(.easeInOut(duration: 0.45)) { stage = 2 }
            Haptics.soft(0.6)
            try? await Task.sleep(for: .milliseconds(380))
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) { stage = 3 }
            sparkle = true
            Haptics.success()
            onRevealed()
        }
    }
}

private struct EnvelopeShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path(roundedRect: r.insetBy(dx: 14, dy: 0), cornerRadius: 12)
        // Inner fold lines.
        p.move(to: CGPoint(x: r.minX + 14, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.midY + 10))
        p.addLine(to: CGPoint(x: r.maxX - 14, y: r.maxY))
        return p
    }
}

private struct FlapShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + 14, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - 14, y: r.minY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

/// A short, small burst of stars: festive, not a fireworks show.
struct SparkleBurst: View {
    let color: Color
    @State private var go = false
    private let angles: [Double] = (0..<12).map { Double($0) / 12 * 2 * .pi }

    var body: some View {
        ZStack {
            ForEach(angles.indices, id: \.self) { i in
                Image(systemName: "sparkle")
                    .font(.system(size: i.isMultiple(of: 2) ? 14 : 10))
                    .foregroundStyle(color)
                    .offset(x: go ? cos(angles[i]) * 120 : 0, y: go ? sin(angles[i]) * 80 - 30 : -30)
                    .opacity(go ? 0 : 1)
                    .scaleEffect(go ? 0.6 : 1.2)
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { go = true } }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Shown while the server draws: slips shuffle for a moment, then a check.
struct DrawingOverlay: View {
    let season: Season
    let done: Bool
    @State private var shuffle = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea()
            VStack(spacing: 22) {
                ZStack {
                    if done {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(Color.white, Color.green)
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        ForEach(0..<3) { i in
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(.white)
                                .frame(width: 56, height: 74)
                                .overlay(Image(systemName: "questionmark").font(.title2.weight(.bold)).foregroundStyle(season.gradient[0]))
                                .shadow(color: .black.opacity(0.2), radius: 6, y: 3)
                                .rotationEffect(.degrees(shuffle ? Double([-14, 0, 14][i]) : Double([10, -6, -12][i])))
                                .offset(x: shuffle ? CGFloat([-46, 0, 46][i]) : CGFloat([30, -30, 0][i]),
                                        y: shuffle ? CGFloat([6, -8, 6][i]) : CGFloat([-4, 6, 0][i]))
                                .zIndex(shuffle ? Double(i) : Double(2 - i))
                        }
                    }
                }
                .frame(height: 110)
                Text(done ? "Getrokken!" : "Lootjes worden getrokken…")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .contentTransition(.opacity)
            }
            .padding(30)
            .background(LinearGradient(colors: season.gradient, startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay { FestiveParticles(season: season, count: 14).clipShape(RoundedRectangle(cornerRadius: 20)) }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.32).repeatForever(autoreverses: true)) { shuffle = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(done ? "Getrokken" : "Lootjes worden getrokken")
    }
}
