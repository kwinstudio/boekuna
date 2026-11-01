import WidgetKit
import SwiftUI
import UIKit

struct FotoswipeEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let photo: UIImage?
}

struct FotoswipeProvider: TimelineProvider {
    func placeholder(in context: Context) -> FotoswipeEntry {
        FotoswipeEntry(date: Date(), snapshot: WidgetSnapshot(streak: 4, swipedToday: 6, onThisDayCount: 12), photo: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (FotoswipeEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : current())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<FotoswipeEntry>) -> Void) {
        // The app refreshes the widget after each session; past midnight the day starts over.
        let midnight = Calendar.current.nextDate(after: Date(), matching: DateComponents(hour: 0, minute: 5), matchingPolicy: .nextTime) ?? Date().addingTimeInterval(3600 * 6)
        completion(Timeline(entries: [current()], policy: .after(midnight)))
    }
    private func current() -> FotoswipeEntry {
        var snapshot = WidgetSnapshot.load()
        // A snapshot from an earlier day: today's progress starts at zero.
        if let saved = snapshot, !Calendar.current.isDateInToday(saved.updated) {
            snapshot?.swipedToday = 0
            snapshot?.doneToday = false
            snapshot?.onThisDayCount = 0
            snapshot?.hasPhoto = false
        }
        let photo = (snapshot?.hasPhoto == true) ? WidgetSnapshot.photoURL.flatMap { UIImage(contentsOfFile: $0.path) } : nil
        return FotoswipeEntry(date: Date(), snapshot: snapshot, photo: photo)
    }
}

private enum WidgetPalette {
    static let background = Color(red: 0.965, green: 0.957, blue: 0.945)
    static let ink = Color(red: 0.09, green: 0.082, blue: 0.122)
    static let muted = Color(red: 0.4, green: 0.384, blue: 0.435)
    static let brand = Color(red: 0.357, green: 0.239, blue: 0.961)
    static let reward = Color(red: 1, green: 0.784, blue: 0.239)
    static let keep = Color(red: 0.082, green: 0.498, blue: 0.349)
}

struct FotoswipeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FotoswipeEntry

    var body: some View {
        content
            .environment(\.locale, Locale(identifier: entry.snapshot?.language ?? "en"))
            .widgetURL(WidgetSnapshot.deepLink)
            .containerBackground(for: .widget) { background }
    }

    @ViewBuilder private var background: some View {
        if let photo = entry.photo {
            ZStack {
                Image(uiImage: photo).resizable().scaledToFill()
                LinearGradient(colors: [.clear, WidgetPalette.ink.opacity(0.75)], startPoint: .center, endPoint: .bottom)
            }
        } else {
            WidgetPalette.background
        }
    }

    @ViewBuilder private var content: some View {
        let snapshot = entry.snapshot
        let onPhoto = entry.photo != nil
        let text = onPhoto ? Color.white : WidgetPalette.ink
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "flame.fill").foregroundStyle(WidgetPalette.reward)
                Text("\(snapshot?.streak ?? 0)").font(.headline.weight(.semibold)).monospacedDigit()
                Spacer()
                if snapshot?.doneToday == true {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(onPhoto ? .white : WidgetPalette.keep)
                }
            }
            .foregroundStyle(text)
            Spacer(minLength: 0)
            if let snapshot, snapshot.onThisDayCount > 0 {
                Text("Op deze dag").font(.caption2.weight(.semibold)).textCase(.uppercase).foregroundStyle(onPhoto ? .white.opacity(0.85) : WidgetPalette.muted)
                Text("\(snapshot.onThisDayCount) herinneringen").font(.subheadline.weight(.semibold)).foregroundStyle(text).lineLimit(2)
            } else if snapshot == nil {
                Text("Open Fotoswipe om te beginnen").font(.subheadline.weight(.semibold)).foregroundStyle(text)
            } else {
                Text("Vandaag").font(.caption2.weight(.semibold)).textCase(.uppercase).foregroundStyle(WidgetPalette.muted)
                Text("\(min(snapshot?.swipedToday ?? 0, snapshot?.goal ?? 10))/\(snapshot?.goal ?? 10) bekeken")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(text).monospacedDigit()
            }
            if family == .systemMedium {
                ProgressView(value: Double(min(snapshot?.swipedToday ?? 0, snapshot?.goal ?? 10)), total: Double(snapshot?.goal ?? 10))
                    .tint(WidgetPalette.reward)
            }
        }
    }
}

@main
struct FotoswipeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FotoswipeWidget", provider: FotoswipeProvider()) { entry in
            FotoswipeWidgetView(entry: entry)
        }
        .configurationDisplayName("Fotoswipe")
        .description("Je reeks en de foto's van vandaag in eerdere jaren.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
