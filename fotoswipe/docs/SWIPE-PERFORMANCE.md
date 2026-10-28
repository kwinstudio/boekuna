# Swipe performance update — 28 October 2026

The installed first build was reported to stutter while swiping. Source inspection found:

- Drag state lived in ContentView, causing repeated whole-library computed filters during gesture updates.
- Each decision synchronously encoded and atomically wrote the full decision history on the main actor.
- Every swipe cancelled all photo preparation; precache size (1000×1400) did not match displayed requests (1400×1800).
- Only the current image view was mounted. The next image had to be requested after advancing.
- A second full-size blurred image was composited behind each card.

This change keeps gesture state inside the top card, mounts three stable-identity cards in advance, preheats a moving window of eight assets using matching request parameters, and updates only the added/removed cache entries. A cursor advances through the remaining assets without scanning/shifting the whole library. Counts and review selections are updated on decisions rather than recalculated during drag rendering. JSON encoding and disk writes run on a serial background queue; app backgrounding flushes queued writes using an iOS background task. Storage format is unchanged.

A completed swipe animates outward for 180 ms before committing; an expected-photo-ID guard prevents delayed completion from applying to another photo after undo or a library refresh. Cancelled gestures spring back. Reduce Motion skips the outward animation. iCloud/network fetch latency can still affect photos that have not yet been downloaded.

Regression coverage adds a 100,000-item queue traversal, empty/last-item handling and off-main persistence ordering. Existing undo/deletion tests remain. Compilation and tests run on the macOS release workflow before signing or upload. No physical-device frame-time or Instruments measurements are available in this environment; user acceptance on iPhone is still required.
