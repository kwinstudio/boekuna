import SwiftUI
import Photos

struct AssetImage: View {
    let asset: PHAsset
    let manager: PHCachingImageManager
    var thumbnail = false
    @State private var image: UIImage?
    @State private var failed = false
    @State private var requestID: PHImageRequestID = PHInvalidImageRequestID
    @State private var activeID: UUID?
    @State private var retry = 0

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(red: 0.16, green: 0.19, blue: 0.14)
                if let image {
                    if !thumbnail {
                        Image(uiImage: image).resizable().scaledToFill()
                            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                            .blur(radius: 25).opacity(0.5)
                    }
                    Image(uiImage: image).resizable()
                        .aspectRatio(contentMode: thumbnail ? .fill : .fit)
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                } else if failed {
                    VStack(spacing: 14) {
                        Image(systemName: "icloud.slash").font(.largeTitle)
                        if !thumbnail {
                            Text("Foto niet beschikbaar").font(.headline)
                            Text("Controleer je internet voor foto's in iCloud.")
                                .font(.caption).multilineTextAlignment(.center)
                            Button("Opnieuw proberen") { retry += 1 }.buttonStyle(.bordered)
                        }
                    }.foregroundStyle(.white).padding()
                } else {
                    ProgressView().tint(.white).accessibilityLabel("Foto laden")
                }
            }.clipped()
        }
        .task(id: "\(asset.localIdentifier)-\(retry)") { load() }
        .onDisappear { cancel() }
        .accessibilityLabel(asset.creationDate.map { "Foto van \($0.formatted(date: .long, time: .omitted))" } ?? "Foto")
    }
    private func cancel() {
        activeID = nil
        if requestID != PHInvalidImageRequestID { manager.cancelImageRequest(requestID) }
        requestID = PHInvalidImageRequestID
    }
    private func load() {
        cancel()
        image = nil
        failed = false
        let token = UUID()
        activeID = token
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        requestID = manager.requestImage(for: asset,
            targetSize: thumbnail ? CGSize(width: 360, height: 360) : CGSize(width: 1400, height: 1800),
            contentMode: thumbnail ? .aspectFill : .aspectFit, options: options) { result, info in
                DispatchQueue.main.async {
                    guard activeID == token else { return }
                    if let result { image = result; failed = false }
                    else if (info?[PHImageCancelledKey] as? Bool) != true,
                            (info?[PHImageResultIsDegradedKey] as? Bool) != true {
                        failed = true
                    }
                }
            }
    }
}
