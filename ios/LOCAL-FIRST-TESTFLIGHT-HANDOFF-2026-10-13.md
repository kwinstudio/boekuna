# BOEKUNA iPhone — vervolg na Claude Code (13 oktober 2026)

## Wat deze wijziging doet

De bestaande iPhone-app heeft de native documentcamera, Apple Vision-tekstpreview, lokaal bewaren van niet-verstuurde bonnen en synchronisatie bij terugkeer van internet al in de code. Dit is geen nieuwe boekhoudengine: **de server-OCR en bestaande financiële controle blijven leidend**.

De GitHub Actions-workflow **Boekuna iOS release** heeft nu een expliciete handmatige optie **enable_local_first** (standaard **false**). Alleen een handmatig gestarte build met deze optie aan krijgt `BOEKUNA_LOCAL_FIRST=YES`. PR-runs en standaardbuilds blijven op `NO`.

Bij een handmatige local-first-build:
- worden Swift unit tests voor Apple Vision/PDF en de offline conceptopslag uitgevoerd;
- wordt de native web-bridge op syntax gecontroleerd;
- wordt de instelling na het archiveren uit de werkelijke `Boekuna.app/Info.plist` gelezen en vergeleken met de aanvraag;
- krijgt de simulatortest dezelfde instelling en wordt ook die gecontroleerd.

Er is **geen** productie-release, automatische App Review-indiening of activatie voor bestaande iPhone-gebruikers gedaan door deze PR.

## Wat niet aangetoond is

- Een groene workflow met `enable_local_first=true` bewijst *niet* dat de camera, native bestandskiezer, offline koude start of het deelmenu op een echte iPhone werken.
- WebKit kan de JavaScript-bibliotheek die de webapp vanaf een CDN haalt offline missen. Daardoor kan een eerste start in vliegtuigmodus falen.
- Apple App Store-richtlijn 4.2 is niet automatisch afgevinkt door alleen een lokale scanfunctie aan te zetten.
- App Privacy, leeftijdsclassificatie, Apple-accountgeschiktheid bij gevoelige financiële gegevens en echte iPhone-test blijven afzonderlijke releasevoorwaarden.
- De WebKit-frontend wordt vanaf `app.boekuna.nl` geladen: de webdeploy moet de bijbehorende code bevatten.

## Route voor een veilige test (nadat deze PR is beoordeeld en gemerged)

1. Controleer dat de productie-webapp de local-first bridge aanroept zoals in `kwinest/index.html` en `kwinest/app-assets/native-local-first.js` en dat dezelfde code is gedeployed op `app.boekuna.nl`.
2. Open GitHub → Actions → **Boekuna iOS release** → **Run workflow**; selecteer `main`.
3. Zet `enable_local_first` op **true**. Gebruik een nieuw buildnummer dat de workflow zelf bepaalt. Laat `upload_to_testflight` alleen aan wanneer een nieuwe interne TestFlight-test bedoeld is.
4. Controleer de job: Swift tests geslaagd, `Local-first in archive: YES`, signing geslaagd en (indien aangevinkt) `Deliver to TestFlight: success`.
5. Open App Store Connect → TestFlight → BOEKUNA; controleer de daadwerkelijke verwerking en voeg de juiste build aan een interne testgroep toe.
6. Installeer de build op een echte iPhone en test met **fictieve** administratie. Noteer iPhone-model, iOS-versie, buildnummer en resultaten.

### Minimale fysieke acceptatie vóór publieke release

- Installatie én upgrade bewaren de juiste sessie; uitloggen/accounts wisselen geeft nooit data van iemand anders.
- Camera toestemming toestaan en weigeren, 3-pagina scan, foto, HEIC en PDF.
- Offline een bon toevoegen: deze wordt veilig bewaard en na opnieuw verbinden **éénmaal** verwerkt.
- Halverwege upload internet uitschakelen en hervatten: geen documentverlies of dubbele kosten.
- OCR-tekst is duidelijk **'Nog niet gecontroleerd'**; bedragen/btw komen uitsluitend uit de server en worden door de gebruiker gecontroleerd.
- Offline starten na een eerdere online sessie, ook met afgesloten en opnieuw geopende app.
- PDF opslaan/delen/afdrukken, toetsenbord, notch/home-indicator, VoiceOver/Dynamic Type.
- Gratis, betaald en verlopen testaccount: nergens buiten de toegestane Apple-betaalregels een Stripe-betaling starten.
- Account verwijderen met een **fictief** testaccount; geen echte administratie wissen.

Als een van deze veiligheidschecks faalt, gebruik `enable_local_first=false` voor de volgende build en publiceer niet. Verander niet de server-OCR, klantdata of billing om de test te laten slagen.

## Technische herkomst

- Repo: `kwinstudio/boekuna`; beginpunt: `main` @ `35cd5f861fadd0c4b4cf0fb64431de5b382fde2e`
- `ios/BOEKUNA-IOS-LOCAL-FIRST-RELEASE-REPORT.md`
- `ios/TESTFLIGHT-NL.md`
- Workflow: `.github/workflows/boekuna-ios-release.yml`
