# BOEKUNA — eerste TestFlight-installatie

Dit is voorbereiding voor een testbuild, geen openbare App Store-publicatie.
Bestaande app: https://appstoreconnect.apple.com/apps/6819651528/testflight
Bundle ID: `nl.boekuna.app` · versie `1.0.0` · iPhone met iOS 17 of nieuwer.

## Vooraf

- Laat de onafhankelijke review van deze wijziging en de macOS CI-build slagen.
- Controleer dat de companion-webaanpassingen uit dezelfde PR op `app.boekuna.nl` zijn gedeployed. De iOS-app laadt deze live webapp; de commit van de native build alleen fixeert de webversie niet.
- Gebruik een afzonderlijk testaccount met fictieve administratie. Benodigde toegang moet door het bestaande entitlement/testersysteem worden toegekend; wijzig geen betaalstatus in de app.
- Bewaar Apple-account, certificaten, API-sleutels en reviewer-wachtwoord uitsluitend in de daarvoor bestemde beveiligde omgeving.

## Vanaf Windows: ondertekende build en TestFlight via GitHub Actions (aanbevolen)

Geen Mac, Xcode of certificaatbestand nodig. De workflow **Boekuna iOS release** (`.github/workflows/boekuna-ios-release.yml`) draait op een macOS 26-runner met Xcode 26, controleert de bestaande app `6819651528`, kiest zelf het volgende buildnummer, ondertekent automatisch met een door Apple beheerd distributiecertificaat en uploadt naar TestFlight. Hij dient nooit iets in voor App Review en publiceert niets.

### Eenmalig (alleen jij kunt dit doen)

1. **App Store Connect-API-sleutel maken.** Ga naar https://appstoreconnect.apple.com/access/integrations/api → tab **Team Keys** → **+** (de eerste keer eventueel eerst **Request Access** en de voorwaarden accepteren).
   - Naam: `GitHub Boekuna`
   - Toegang: **Admin** (nodig voor automatische cloud-ondertekening; App Manager is niet genoeg).
   - Klik **Generate**, daarna **Download API Key**. Het `.p8`-bestand kun je maar één keer downloaden.
   - Noteer de **Key ID** (in de rij van de sleutel) en de **Issuer ID** (boven de tabel).
2. **Drie GitHub Secrets toevoegen.** Ga naar https://github.com/kwinstudio/boekuna/settings/secrets/actions → **New repository secret**:
   - `ASC_KEY_ID` = de Key ID
   - `ASC_ISSUER_ID` = de Issuer ID
   - `ASC_KEY_P8` = de volledige inhoud van het `.p8`-bestand (open met Kladblok, kopieer alles inclusief de regels `-----BEGIN PRIVATE KEY-----` en `-----END PRIVATE KEY-----`).
3. Bewaar het `.p8`-bestand in je wachtwoordkluis of verwijder het. Zet het nooit in Git, chat of e-mail.

Team ID, certificaten en provisioning profiles hoef je niet aan te maken: de workflow leest het Team ID uit de bestaande Bundle ID en Apple maakt certificaat en profiel automatisch aan.

### Een nieuwe build maken (elke update)

1. Ga naar https://github.com/kwinstudio/boekuna/actions/workflows/boekuna-ios-release.yml → **Run workflow**.
2. Laat **Upload the signed build to TestFlight** aangevinkt. Vul alleen bij een nieuwe App Store-versie `marketing_version` in (bijvoorbeeld `1.0.1`).
3. Na ongeveer 10–20 minuten staat de build in App Store Connect → TestFlight (Apple verwerkt hem nog 5–30 minuten). Het `.ipa`-bestand staat 14 dagen onder **Artifacts** van de run, met een simulator-screenshot.

Zonder de drie secrets bouwt de workflow alleen ongesigned en draait hij de simulator-rooktest, zonder `.ipa` of upload. Op een pull request uploadt hij alleen als de PR het label `testflight` heeft.

## Vanaf Windows: Codemagic (optioneel, alleen buildcontrole)

Een eigen Mac is niet nodig voor deze unsigned controle. Het individuele Codemagic-plan bevat momenteel 500 gratis Mac M2-buildminuten per maand. Gebruik de M2-workflow binnen die limiet; activeer geen betaald plan voor deze stap.

1. Koppel de bestaande GitHub-repository `kwinstudio/boekuna` in Codemagic als native iOS-project.
2. Kies branch `fix/ios-testflight-preflight-20261008`, niet `main` zolang deze PR niet is gemerged.
3. Klik **Check for configuration files**. `codemagic.yaml` staat in de repositoryroot; kopieer dit bestand niet naar `ios/`.
4. Kies workflow **BOEKUNA iOS - buildcontrole zonder signing** en klik **Start new build**. Als een projectpad de YAML-scan beperkt, zet dit pad op `.`; de workflow bepaalt zelf de repositoryroot en gebruikt `ios/Boekuna.xcodeproj`.
5. Controleer de commit in de buildlog. De job draait hetzelfde `ios/scripts/preflight.sh` als GitHub CI: 23 native navigatiegevallen, beide simulatorconfiguraties en het device-SDK zonder signing.

Deze workflow heeft geen Apple-integratie, certificaat, upload- of publicatiestap. Een groene controle levert nog geen installeerbare IPA. Voor een signed cloudbuild moeten Apple-signing en een expliciete TestFlight-uploadworkflow afzonderlijk worden ingericht, met sleutels uitsluitend in de beveiligde Codemagic-instellingen. Maak daarvoor geen nieuwe App Store Connect-app aan. Het bestaande Apple Developer-lidmaatschap blijft nodig.

Bronnen: https://codemagic.io/pricing/ en https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/.

## Op een Mac met Xcode 26 of nieuwer

1. Download de gecontroleerde branch/commit van `kwinstudio/boekuna`.
2. Open `ios/Boekuna.xcodeproj` in Xcode.
3. Open **Xcode → Settings → Accounts**, voeg je Apple-account toe en log zelf in.
4. Selecteer target **Boekuna → Signing & Capabilities**. Zet **Automatically manage signing** aan en selecteer het developerteam dat `nl.boekuna.app` bezit. Bewaar account-specifieke projectwijzigingen niet in GitHub.
5. Controleer **General**: Bundle Identifier `nl.boekuna.app`, versie `1.0.0`. Kies een nog niet geüpload buildnummer; kijk hiervoor bij de bestaande app in App Store Connect → TestFlight.
6. Voor een rechtstreekse iPhone-test: sluit de iPhone aan, vertrouw de Mac en schakel Developer Mode op de iPhone in als Xcode daarom vraagt. Selecteer de iPhone en klik **Run**. Doorloop de apparaatchecks hieronder. Dit is een lokale ontwikkeltest en nog geen TestFlight-build.
7. Selecteer **Any iOS Device (arm64)** of het equivalente generieke iPhone-doel. Kies **Product → Archive**.
8. Open het archief in **Window → Organizer → Archives**. Kies **Distribute App → TestFlight & App Store** en doorloop de upload naar de bestaande BOEKUNA-app. Kies geen openbare review/publicatie.
9. Wacht tot Apple de build heeft verwerkt. Beantwoord eventuele export/encryptievragen op basis van de werkelijke app en configureer de beta-testinformatie. Raad niet bij juridische/privacyvragen.

## Via het bestaande script

Als Xcode jouw account en signing al heeft ingericht, kun je vanuit de repository deze opdrachten gebruiken. Vul jouw Team ID in (Apple Developer → Membership details) en een vrij buildnummer. Plaats deze waarden niet in chat.

```bash
export DEVELOPMENT_TEAM='JOUW_TEAM_ID'
export BUILD_NUMBER='2' # Alleen gebruiken als 2 nog vrij is; controleer TestFlight.
./ios/scripts/archive.sh
```

Dit voert packagingvalidatie, navigatietests, Debug/Release-simulatorbuilds en een device-SDK-build uit. Daarna maakt het een ondertekend archief en exporteert de IPA in `ios/build/`. Het uploadt standaard niets.

Na controle van de ondertekende build en de releasevoorwaarden:

```bash
export UPLOAD_TO_TESTFLIGHT=1
./ios/scripts/archive.sh
```

De upload gebruikt Xcode's ingestelde Apple-account. Een ontbrekend developerteam, ongeldig buildnummer, checkout met niet-genegeerde wijzigingen of oude Xcode/SDK blokkeert het script. `ios/build/export/build-identity.txt` vermeldt commit, buildnummer en Bundle ID; geen credentials.

## Installeren via TestFlight

1. Open de bestaande BOEKUNA-app in App Store Connect en kies **TestFlight**.
2. Maak een interne testgroep en voeg jezelf toe als geschikte interne tester. Je moet een App Store Connect-gebruiker met een daarvoor toegestane rol zijn en toegang tot deze app hebben.
3. Voeg de verwerkte build toe aan die groep en stuur de uitnodiging via Apple.
4. Installeer Apple's **TestFlight** op je iPhone, open de uitnodiging en tik **Installeren**.
5. Als interne testing niet beschikbaar is, gebruik externe testers. De eerste externe build kan een aparte beta-review nodig hebben; dat is geen openbare App Store-publicatie.

## Verplichte apparaatchecks — nog te bewijzen

Leg per check vast: buildnummer, native commit, webdeploy-commit, iPhone-model, iOS-versie en resultaat.

- E-mail/wachtwoord-login; app afsluiten/heropenen; sessie blijft behouden.
- Uitloggen; heropenen; administratie van de vorige gebruiker niet zichtbaar.
- Camera toestaan én weigeren; bibliotheek en Bestanden blijven bruikbaar.
- JPG/PNG/HEIC en digitale/multipage PDF uploaden; terug naar de app na de bestandkiezer.
- OCR-resultaten controleren/corrigeren en opslaan; enkel/gemengde btw gebruiken via de bestaande controleflow. Geen stille boeking.
- Rapport afdrukken via het native afdrukmenu; factuur-PDF en administratie-back-up delen naar Bestanden; documentinhoud en bestandsnaam kloppen.
- Keyboard open op login/factuur/documentcontrole; invoerveld en primaire actie bereikbaar.
- Notch/Dynamic Island, onderste home indicator, portret/landschap; geen afgesneden knoppen.
- Slechte verbinding, vliegtuigmodus, herstel en opnieuw proberen; geen dubbele boeking.
- Start, betaald en verlopen/testtoegang: geen Stripe Checkout, prijslink, externe koopknop of verborgen betaalroute.
- Account verwijderen met apart fictief account; fout houdt gegevens intact, succes beëindigt toegang. Gebruik hiervoor nooit een echt administratieaccount.

Een Playwright WebKit-test is geen WKWebView/iPhone-acceptance. Simulator- en device-SDK-compilatie bewijzen geen signing, camera of deelmenu.

## Openbare App Store-gates later

App Privacy/leeftijdsvragen, definitieve screenshots, reviewer-account en de Apple-accountvraag uit PR #262 moeten afzonderlijk worden afgerond. Apple 5.1.1(ix) kan relevant zijn voor gevoelige financiële gegevens; accountgeschiktheid is nog niet bevestigd. De bruikbaarheid van deze companion onder Apple 4.2 moet bij de uiteindelijke review worden beoordeeld. Deze gids geeft geen goedkeuringsgarantie.
