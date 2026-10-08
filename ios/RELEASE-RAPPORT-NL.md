# BOEKUNA iOS: release-rapport (8 oktober 2026)

## Samenvatting

De bestaande iOS-app (`ios/`, uit PR #223 en #277) bouwt nu in de cloud op GitHub Actions (macOS 26, Xcode 26, iOS 26 SDK). Er is niets opnieuw gebouwd. Ondertekening en levering naar TestFlight zijn ingericht en wachten alleen op de App Store Connect-API-sleutel in GitHub Secrets.

| Onderdeel | Status | Bewijs |
|---|---|---|
| Appnaam `Boekuna`, Bundle ID `nl.boekuna.app`, versie 1.0.0 | OK | `ios/Boekuna/Info.plist`, `project.pbxproj`, CI-stap "Verify bundle and version settings" |
| App-icoon (Bonnetje, 1024 px, zonder transparantie) | OK | `validate.py`: gelijk aan `public/assets/boekuna-app-icon-1024.png`, RGB zonder alfa |
| Opstartscherm | OK | `UILaunchScreen` met lichte achtergrond, daarna laadscherm met woordmerk "Boekuna." |
| Xcode 26 / iOS 26 SDK (Apple-eis sinds april 2026) | OK | workflow controleert dit en faalt anders |
| Encryptieverklaring | OK | `ITSAppUsesNonExemptEncryption = false` (alleen HTTPS) |
| Camera- en fotobibliotheekteksten | OK | Nederlandse uitleg in `Info.plist` |
| Geen koop- of Stripe-route in de app (richtlijn 3.1.1) | OK in code | native blokkade + webdetectie; tests in Chromium en WebKit groen |
| Account verwijderen in de app (5.1.1(v)) | OK | bestaande functie in Instellingen |
| Ongesigneerde archive voor iPhone | OK | workflow "Boekuna iOS release", stap Archive |
| Simulatortest: app start en toont het inlogscherm | OK | screenshot `simulator-start.png` (iPhone, iOS 26) |
| Native navigatieregels (23 gevallen) | OK | `preflight.sh` op macOS 26 |
| Debug + Release simulator en device-SDK-build | OK | workflow "Boekuna iOS packaging" |
| App Store Connect-koppeling app `6819651528` | Wacht op API-sleutel | `ios/scripts/asc.mjs` controleert app, Bundle ID en buildnummer |
| Ondertekende `.ipa` als download | Wacht op API-sleutel | stap "Sign and export .ipa" |
| TestFlight-upload | Wacht op API-sleutel | stap "Deliver to TestFlight" |
| Test op een echte iPhone | Nog te doen door Kwin via TestFlight | checklist in `ios/TESTFLIGHT-NL.md` |

## Hoe de cloudbuild werkt

1. Controle van Xcode/SDK, verpakking, icoon en betaalblokkade.
2. Met API-sleutel: controle dat app `6819651528` bij `nl.boekuna.app` hoort, Team ID uit de geregistreerde Bundle ID, volgende vrije buildnummer.
3. Archive zonder ondertekening, daarna export met automatische cloud-ondertekening (door Apple beheerd distributiecertificaat en App Store-profiel). Geen certificaat of profiel in Git of in Secrets.
4. `.ipa` 14 dagen downloadbaar als artifact, met `build-identity.txt` (commit, versie, buildnummer).
5. Upload naar TestFlight. Nooit indienen voor App Review, nooit publiceren.
6. Simulator-rooktest met screenshot.

## Wat getest is en hoe

- **Login, sessiebehoud, documentupload, OCR-controle, facturen, PDF, navigatie**: dit draait allemaal in de bestaande webapp op app.boekuna.nl, die de iOS-app laadt. De volledige app-testset (`boekuna-app.yml`) draait in Chromium en WebKit (Safari-engine), inclusief de iOS-companiontests met de echte iOS-user-agent.
- **Native deel**: navigatieregels (23 gevallen), start en laden in de simulator, builds voor simulator en apparaat.
- **Niet automatisch te testen**: camera, Bestanden-kiezer, deelmenu voor PDF, Face ID-autofill en gedrag na app afsluiten op een echt toestel. Dat gebeurt via TestFlight met de checklist "Verplichte apparaatchecks" in `ios/TESTFLIGHT-NL.md`.

## Nog nodig

1. **Kwin**: App Store Connect-API-sleutel (Admin) maken en drie GitHub Secrets zetten (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`). Stappen in `ios/TESTFLIGHT-NL.md`.
2. Eerste ondertekende build + TestFlight-upload draaien (Claude, na stap 1).
3. **Kwin**: in App Store Connect → TestFlight jezelf als interne tester toevoegen, de app via TestFlight installeren en de apparaatchecks doorlopen.
4. Na merge: app.boekuna.nl deployen, zodat de companion-aanpassingen (geen abonnementsknoppen, PDF via deelmenu) live staan. Zonder deploy toont de iOS-app nog de webversie zonder die aanpassingen.
5. Voor App Store-publicatie later (apart, met jouw toestemming): App Privacy-vragenlijst, leeftijdsclassificatie, screenshots, reviewer-testaccount, en de punten uit PR #262 (richtlijn 4.2 "minimale functionaliteit" voor web-apps is het grootste reviewrisico; 5.1.1(ix) over financiële gegevens bij een individueel ontwikkelaarsaccount).

## Local-first (PR #281)

PR #281 voegt scannen, tekst lezen op de iPhone, offline bewaren en offline openen van de administratie toe, achter de build-instelling `BOEKUNA_LOCAL_FIRST` (standaard uit; deze release-workflow bouwt dus zonder). Rapport: `ios/BOEKUNA-IOS-LOCAL-FIRST-RELEASE-REPORT.md`.
