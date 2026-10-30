import SwiftUI
import MapKit
import CoreLocation

/// A photo with a place and a time; only the location metadata Photos already has.
struct PlacePoint: Equatable {
    let id: String
    let latitude: Double
    let longitude: Double
    let date: Date
}

/// One trip or place: photos taken close together, without a long pause in between.
struct PlaceCluster: Identifiable, Equatable {
    let id: String
    let latitude: Double
    let longitude: Double
    let ids: [String]
    let start: Date
    let end: Date
    /// The place with by far the most photos is home; it stays one group instead of hundreds of small visits.
    let isHome: Bool
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

enum PlaceClustering {
    /// Groups photos per area of about 20 km, split into visits when there is a pause of more than `gapDays`.
    static func clusters(_ points: [PlacePoint], cellDegrees: Double = 0.2, gapDays: Double = 4, minimum: Int = 3) -> [PlaceCluster] {
        struct Cell: Hashable { let lat: Int; let lon: Int }
        var cells: [Cell: [PlacePoint]] = [:]
        for point in points where abs(point.latitude) > 0.0001 || abs(point.longitude) > 0.0001 {
            let cell = Cell(lat: Int((point.latitude / cellDegrees).rounded(.down)), lon: Int((point.longitude / cellDegrees).rounded(.down)))
            cells[cell, default: []].append(point)
        }
        let home = cells.max { $0.value.count < $1.value.count }?.key
        var result: [PlaceCluster] = []
        for (cell, list) in cells {
            let sorted = list.sorted { $0.date < $1.date }
            var visits: [[PlacePoint]] = []
            if cell == home {
                visits = [sorted]
            } else {
                for point in sorted {
                    if let last = visits.last?.last, point.date.timeIntervalSince(last.date) <= gapDays * 86_400 {
                        visits[visits.count - 1].append(point)
                    } else {
                        visits.append([point])
                    }
                }
            }
            for visit in visits where visit.count >= minimum {
                guard let first = visit.first, let last = visit.last else { continue }
                let lat = visit.map(\.latitude).reduce(0, +) / Double(visit.count)
                let lon = visit.map(\.longitude).reduce(0, +) / Double(visit.count)
                result.append(PlaceCluster(id: "place:\(cell.lat)_\(cell.lon)_\(Int(first.date.timeIntervalSince1970))",
                                           latitude: lat, longitude: lon, ids: visit.map(\.id),
                                           start: first.date, end: last.date, isHome: cell == home))
            }
        }
        // Trips first, newest on top; home last.
        return result.sorted { lhs, rhs in
            if lhs.isHome != rhs.isHome { return !lhs.isHome }
            return lhs.end > rhs.end
        }
    }
}

/// "Reiskaart": your photos per place and trip. Tap a place to swipe only those photos.
struct PlacesView: View {
    @EnvironmentObject private var library: PhotoLibrary
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void
    @State private var position: MapCameraPosition = .automatic
    @State private var selected: PlaceCluster.ID?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if library.placesLoading && library.places.isEmpty {
                    Spacer()
                    ProgressView("Plekken zoeken…").tint(Palette.brand)
                    Spacer()
                } else if library.places.isEmpty {
                    ContentUnavailableView("Geen plekken gevonden", systemImage: "map",
                                           description: Text("Foto's zonder locatie verschijnen hier niet. Zet locatie aan in de Camera-instellingen voor nieuwe foto's."))
                } else {
                    Map(position: $position, selection: $selected) {
                        ForEach(library.places) { place in
                            Annotation(library.placeName(place), coordinate: place.coordinate) {
                                Text("\(place.ids.count)")
                                    .font(.caption.weight(.heavy)).monospacedDigit()
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .foregroundStyle(place.isHome ? Palette.ink : .white)
                                    .pop(radius: 10, fill: place.isHome ? Palette.reward : Palette.brand, shadow: 2)
                            }
                            .tag(place.id)
                        }
                    }
                    .frame(height: 280)
                    .onChange(of: selected) { _, id in
                        if let id, let place = library.places.first(where: { $0.id == id }) { open(place) }
                    }
                    List(library.places) { place in
                        Button { open(place) } label: { row(place) }
                            .listRowBackground(Palette.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Reiskaart").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Klaar") { dismiss() } } }
        }
        .onAppear { library.loadPlaces() }
    }

    private func row(_ place: PlaceCluster) -> some View {
        let open = library.undecidedCount(place.ids)
        return HStack(spacing: 12) {
            Image(systemName: place.isHome ? "house.fill" : "airplane")
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(place.isHome ? Palette.ink : .white)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 10).fill(place.isHome ? Palette.reward : Palette.brand))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: library.placeName(place)).font(.headline.weight(.heavy)).foregroundStyle(Palette.ink)
                Text(verbatim: dateText(place)).font(.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(place.ids.count) items").font(.subheadline.weight(.heavy)).monospacedDigit().foregroundStyle(Palette.ink)
                Text(open == 0 ? String(localized: "Klaar", bundle: .app) : String(localized: "\(open) te doen", bundle: .app))
                    .font(.caption.weight(.semibold)).foregroundStyle(open == 0 ? Palette.keep : Palette.muted)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func dateText(_ place: PlaceCluster) -> String {
        if place.isHome { return String(localized: "Thuis en omgeving", bundle: .app) }
        let style = Date.FormatStyle(locale: AppLocale.locale).day().month(.abbreviated).year()
        let from = place.start.formatted(style), to = place.end.formatted(style)
        return from == to ? from : "\(from) – \(to)"
    }

    private func open(_ place: PlaceCluster) {
        let id = library.preparePlace(place)
        dismiss()
        onOpen(id)
    }
}
