# Boekuna Android-app

Android-project (Capacitor 8) dat de live app `https://app.boekuna.nl` in een native schil opent.
Package `nl.boekuna.app`, naam **Boekuna**, icoon **Bonnetje**, target SDK 36 (Android 16), minimaal Android 7.

Omdat de app de live site laadt, zie je elke Render-deploy meteen in de Android-app. Een nieuwe
`.aab` is alleen nodig als er iets in deze map verandert.

## Nieuwe .aab downloaden (Windows, zonder bouwen)

1. GitHub > `kwinstudio/boekuna` > **Actions** > **Boekuna Android** > **Run workflow**.
2. Vul de versienaam in (bijv. `1.0.1`). Versiecode leeg laten: die wordt automatisch hoger (100 + runnummer).
3. Klaar (groen)? Open de run en download onderaan bij **Artifacts** het bestand `boekuna-release-…`.
   Daarin zit `boekuna-release.aab`, ondertekend met de uploadsleutel.
4. Play Console > Boekuna > Testen of Productie > Nieuwe release > upload de `.aab`.

De workflow controleert package, versie en handtekening en stopt als er iets niet klopt.

## GitHub Secrets (één keer instellen)

Repository > Settings > Secrets and variables > Actions > New repository secret:

| Secret | Waarde |
| --- | --- |
| `BOEKUNA_UPLOAD_KEYSTORE_BASE64` | de keystore als base64-tekst |
| `BOEKUNA_UPLOAD_KEYSTORE_PASSWORD` | wachtwoord van de keystore |
| `BOEKUNA_UPLOAD_KEY_ALIAS` | alias van de sleutel |
| `BOEKUNA_UPLOAD_KEY_PASSWORD` | wachtwoord van de sleutel (vaak hetzelfde) |

De keystore en wachtwoorden staan nooit in Git. Bewaar de keystore ook buiten GitHub (bijv. in je
wachtwoordmanager). Kwijt? Dan kun je via Play Console > App-integriteit een nieuwe uploadsleutel aanvragen.

Zelf een uploadsleutel maken (Windows, Android Studio geïnstalleerd), in PowerShell:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore boekuna-upload.jks -storetype PKCS12 -alias boekuna-upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Boekuna, O=Boekuna, C=NL"
[Convert]::ToBase64String([IO.File]::ReadAllBytes("boekuna-upload.jks")) | Set-Clipboard
```

Het tweede commando zet de base64-tekst op je klembord voor `BOEKUNA_UPLOAD_KEYSTORE_BASE64`.

## Openen in Android Studio

1. `npm install` in deze map (Gradle heeft `node_modules/@capacitor/android` nodig).
2. Android Studio > Open > kies de map `android/` > Run.

## Wat de Android-schil regelt

De web-app blijft ongewijzigd. `android/app/src/main/assets/boekuna/android-shim.js` en
`BoekunaNativePlugin.java` vangen af wat een Android WebView zelf niet kan:

- Downloads (back-up, exports, factuur-PDF, Downloaden in de documentviewer) worden opgeslagen in
  Downloads/Boekuna; PDF's openen meteen.
- Factuur mailen deelt de PDF via het Android-deelmenu (Gmail, Outlook, WhatsApp).
- "PDF / print" en rapport-PDF openen het Android-printscherm (ook "Opslaan als PDF").
- Uploadknoppen bieden **Camera** naast de bestandskiezer.
- De Android-terugknop gaat eerst terug in de app.
- Stripe-betaalpagina's openen niet in de app (Google Play-regels); de web-app verbergt
  betalen al in de app (`isNativeStoreShell`).
- Zonder internet toont de app `www/offline.html`.

Test: `node tests/android-shell-browser.test.mjs` draait de shim in de echte gebouwde app.
