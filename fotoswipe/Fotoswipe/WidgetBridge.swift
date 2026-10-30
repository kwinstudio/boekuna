import UIKit
import Photos
import WidgetKit

extension PhotoLibrary {
    /// Writes what the home screen widget shows: streak, today's progress and one photo from this day in earlier years.
    /// Runs when the app goes to the background, so it never slows down swiping.
    func updateWidget() {
        guard hasAccess, WidgetSnapshot.defaults != nil else { return }
        let now = Date()
        var snapshot = WidgetSnapshot()
        snapshot.streak = streakDays
        snapshot.doneToday = streak.isActive(now)
        snapshot.swipedToday = streak.countDay == StreakStore.key(now) ? streak.countToday : 0
        snapshot.goal = StreakStore.dailyGoal
        snapshot.language = AppLocale.code
        snapshot.updated = now
        let filter = PhotoDateFilter.onThisDay
        let memories = allLibraryAssets.filter { $0.mediaType == .image && filter.includes($0.creationDate, now: now) }
        snapshot.onThisDayCount = memories.count
        guard let pick = memories.randomElement(), let url = WidgetSnapshot.photoURL else {
            snapshot.save()
            WidgetCenter.shared.reloadAllTimelines()
            return
        }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false
        options.isSynchronous = false
        PHImageManager.default().requestImage(for: pick, targetSize: CGSize(width: 500, height: 500), contentMode: .aspectFill, options: options) { image, info in
            if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
            if let data = image?.jpegData(compressionQuality: 0.8), (try? data.write(to: url, options: .atomic)) != nil {
                snapshot.hasPhoto = true
            }
            snapshot.save()
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
