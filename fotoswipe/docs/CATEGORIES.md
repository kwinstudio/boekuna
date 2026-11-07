# Categories and albums

Use the iPhone's existing PhotoKit smart albums and accessible user albums as filters above the swipe deck. Keep all photos, favorites, screenshots, selfies, portraits, Live Photos, panoramas, RAW, and recently added where PhotoKit exposes those collections. Do not create a separate categorization database or infer image contents.

The existing image-only scope and photo permission rules remain. Hidden and deleted assets are excluded. Limited access can restrict albums and category contents. Choices are global per asset identifier across overlapping albums. The deck, progress, undo and review-kept-again are scoped to the selected category. The review tray remains global and is explicitly labeled as such before deletion. No upload of photo metadata or album names is introduced.

A category switch fetches its metadata off the main thread, keeps the existing three-card/rolling image cache, and invalidates delayed swipe completions from the previous deck. Removed albums fall back to All Photos. A refresh generation rejects stale asynchronous fetches.

Validation: category-scoped decision reset and undo, empty scope, overlapping albums and persistence; existing large-library and write-order tests; iPhone simulator suite, device archive, signing, TestFlight upload and existing internal-group distribution. Actual album contents and swipe performance need physical-device testing with the user's library.

## Follow-up: competitor research (2026-10-28)

Swipewipe's first-party feature page documents month-by-month review, saved progress, On This Day, random review, duplicates and statistics: https://swipewipe.com/features . Its help explains recoverable review and saved monthly progress: https://swipewipe.com/help .

Slidebox's current developer listing documents album organization, favorites, undo and comparison: https://apps.apple.com/us/app/slidebox-photo-cleaner-app/id984305203 . Listing claims and ratings establish availability, not measured usability for this user.

Inspected public MIT source: https://github.com/noluyorAbi/photoswipe-ios , specifically LICENSE, Models/PhotoSource.swift and Models/PhotoLibraryService.swift. Its source choices, metadata-based facets and standard PhotoKit collections fit this app. The source uses undocumented KVC fileSize access, which is excluded here. No third-party implementation is copied or dependency added; the new filters and date logic are implemented independently against Apple public APIs.

Selected additional functionality for this update: months with reviewed/total indicators, On This Day in earlier years, and newest/oldest ordering. These extend the user's category request without a full-library pixel scan, network service or photo uploads. Duplicate scanning, AI editing, compression, widgets and album mutations are separate future features, not implemented or claimed in this update.

Date-filter tests cover leap-day month boundaries, missing metadata, calendar-day anniversaries and deduplicated monthly grouping. Existing selections and file format remain compatible.
