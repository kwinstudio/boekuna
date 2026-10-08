# Boekuna Android-app

Android-project (Capacitor 8) dat de live app `https://app.boekuna.nl` in een native schil opent.
Package: `nl.boekuna.app`, naam **Boekuna**, icoon **Bonnetje**. Target SDK 36 (Android 16).

## Openen in Android Studio

1. `npm install` in deze map (haalt `@capacitor/android` op; Gradle heeft dat nodig). In de kant-en-klare zip zit `node_modules` er al bij, dan sla je deze stap over.
2. Android Studio > Open > kies de map `android/`.
3. Wacht tot Gradle klaar is en druk op Run (telefoon of emulator).

## Hoe het werkt

- `capacitor.config.json` zet `server.url` op de live app. Een nieuwe Render-deploy is dus meteen in de Android-app te zien, zonder nieuwe store-release.
- Zonder internet toont de app `www/offline.html`.
- Links buiten app.boekuna.nl (zoals Stripe of e-mail) openen in de browser van de telefoon.
- Na een wijziging in `capacitor.config.json` of `www/`: `npx cap sync android`.

## Play Store

Build > Generate Signed App Bundle levert de `.aab`. Bewaar de keystore goed: zonder die sleutel kun je geen updates meer uitbrengen. Store-teksten staan in `../store/google-play.nl-NL.json`.
