# Fast cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Remove avoidable swipe loading and add all approved review functions while keeping the primary interaction simple.
**Architecture:** Independent image-buffer and similar-image services; PhotoLibrary owns decisions, scopes and mutations. ContentView integrates services, secondary tools, playback and review sheets.
**Tech Stack:** SwiftUI, PhotoKit, UIKit, AVKit, Foundation; iOS 17+.
**Spec:** docs/superpowers/specs/2026-10-28-fast-cleanup-design.md

## Global Constraints
- Native SwiftUI + PhotoKit, iOS 17+, no login/backend/photo upload/analytics/paid dependency.
- Existing decisions remain readable; only dedicated Fotoswipe paths and branches change.
- Keep deletion user-confirmed in app and iOS; never decide on invisible image.

## Review Focus
- iCloud-only or unavailable preview: explicit wait/retry; never trash unseen content.
- Album/favorite PhotoKit observers: avoid invalidating swipes during mutation.
- Later data from older app versions: decode compatible defaults, undo correct previous value.
- Similarity: cancellation, non-overlapping groups, preserve one asset, do not auto-delete.
- Video playback: stop on dismissal/scope transition; never download video originals in preload loop.

### Task 1: Ready preview pipeline
Files: create Fotoswipe/SwipeImagePipeline.swift; integrate ContentView and PhotoLibrary; tests in FotoswipeTests.
- [ ] Add readiness/cache lifetime/scheduling tests and prove missing behavior before implementation.
- [ ] Implement bounded retained previews, priority, staged sharp image upgrade, cancellation/retry and child-local observation.
- [ ] Use readiness to guard swipe and button commits; remove duplicated preheat paths.
- [ ] Validate memory bound and stale completion behavior with simulator tests.

### Task 2: Review semantics and media sources
Files: DecisionStore.swift, PhotoLibrary.swift, tests.
- [ ] Add tests for legacy JSON, later/undo/reset, random session membership and last-kept comparison guard.
- [ ] Implement later choice, random order/session, photo/video collections and scoped review filtering.
- [ ] Implement favorite and album mutations with error presentation and stable current deck.
- [ ] Run native simulator suite.

### Task 3: Similarity and playback
Files: create SimilarPhotoService.swift, CleanupToolsView.swift; tests.
- [ ] Add synthetic image grouping/cancellation tests.
- [ ] Implement bounded on-device image descriptor scan, progress/cancellation and independent compare view.
- [ ] Add on-demand AVKit playback, existing/new album chooser, and More menu integration.
- [ ] Verify no scan or playback blocks swiping and no final-image deletion from group.

### Task 4: Verification and TestFlight
Files: project references, docs and existing dedicated workflow.
- [ ] Structural validation and full simulator suite; inspect all errors and warnings.
- [ ] Fresh code review of integrated source and resolve material findings.
- [ ] Archive/sign/upload on dedicated release branch; verify build enters Testing in Kwin test group.
- [ ] Report exact build, tested limits, and physical-device testing requirement.
