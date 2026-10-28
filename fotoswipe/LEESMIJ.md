# Fotoswipe voor iPhone

Een native SwiftUI-app voor iOS 17 of nieuwer, zonder login, abonnement, advertenties, backend of externe SDK's.

## Status van deze oplevering

De broncode, het Xcode-project, het icoon en de configuratie voor een eerste TestFlight-build zijn aanwezig. In de omgeving waarin dit project is gemaakt is geen macOS, Swift-compiler of Xcode beschikbaar. De bestanden en projectverwijzingen zijn statisch gecontroleerd. De app is **nog niet gecompileerd, op een iPhone getest, ondertekend of naar TestFlight geüpload**. De meegeleverde XCTest-tests moeten op een Mac worden uitgevoerd. Dit bestand is geen installeerbare IPA.

## Wat de app doet

- Vraagt via Apple om volledige of beperkte fototoegang.
- Toont echte foto's en Live Photos uit de toegestane bibliotheek, nieuwste eerst.
- Links swipen of op het kruis tikken: in de verwijderselectie zetten.
- Rechts swipen of op het hart tikken: bewaren (wijzigt niet de favorietenstatus in Foto's).
- Laatste keuze ongedaan maken; de laatste 200 keuzes hebben undo.
- Keuzes en de verwijderselectie bewaren bij sluiten en opnieuw starten.
- Selectie als raster bekijken, foto's vergroten en keuzes herstellen.
- Een gecontroleerde selectie via PhotoKit verwijderen na bevestiging in de app én het systeemvenster van Apple.
- Behoudt de selectie als verwijderen wordt geannuleerd of mislukt.
- Beperkte toegang wijzigen, geweigerde toegang uitleggen, iCloud-afbeeldingen laden en onbeschikbare afbeeldingen opnieuw proberen.
- Alle eerder bewaarde foto's opnieuw beoordelen zonder de verwijderselectie te wissen.

Video's en automatische duplicaatdetectie vallen buiten versie 1.0. Live Photos worden als stilstaand beeld getoond; bij verwijderen wordt het volledige Live Photo-item verwijderd. Er wordt geen misleidende schatting van vrijgemaakte opslag getoond.

## Op een Mac openen en testen

1. Pak het ZIP-bestand uit en open `Fotoswipe.xcodeproj` in Xcode. Er zijn geen package-installaties of projectgeneratoren nodig.
2. Gebruik voor een TestFlight-upload Xcode 26 of nieuwer met een voor uploads ondersteunde iOS SDK. Controleer de actuele Apple-vereisten bij upload.
3. Selecteer het project en target **Fotoswipe** > **Signing & Capabilities**.
4. Kies je eigen Apple Developer-team en laat **Automatically manage signing** aanstaan. Je team-ID en certificaten zijn bewust niet in dit project opgenomen.
5. De standaard Bundle Identifier is `nl.zichtwerfstudio.fotoswipe`. Wijzig die als deze niet beschikbaar is of je een andere identifier wilt. Gebruik exact dezelfde identifier in App Store Connect.
6. Kies een simulator en voer Product > Test uit voor de logica-tests. Of voer `bash scripts/test.sh` uit. `bash scripts/build.sh` bouwt een ongetekende simulatorversie.
7. Kies je eigen iPhone als bestemming en druk op Run. Test fototoegang en verwijderen op een fysieke iPhone met testfoto's.

De simulatorbuild is niet uploadbaar naar TestFlight. Voor TestFlight is een ondertekend iOS-archief nodig.

## Naar TestFlight

1. Gebruik een actief Apple Developer Program-lidmaatschap met toegang tot App Store Connect.
2. Registreer de Bundle ID in je Apple-account en maak in App Store Connect een nieuwe app **Fotoswipe**. Gebruik de Bundle ID uit Xcode en een eigen SKU, bijvoorbeeld `fotoswipe-ios`.
3. Controleer in Xcode bij het app-target versie **1.0** en build **1**. Elke nieuwe upload met dezelfde versie krijgt een hoger buildnummer.
4. Selecteer **Any iOS Device (arm64)** als buildbestemming, en kies **Product > Archive**.
5. Kies in Organizer **Validate App** en daarna **Distribute App > App Store Connect > Upload**. Los eventuele Xcode-validatiefouten op vóór de upload.
6. Wacht tot Apple de build heeft verwerkt. Open in App Store Connect de app > **TestFlight**.
7. Vul de vereiste testinformatie en eventuele exportvragen in. Deze versie gebruikt geen eigen encryptie of netwerkverbinding; de standaard exportinstelling staat op geen niet-vrijgestelde encryptie. Beoordeel de antwoorden opnieuw als je functionaliteit toevoegt.
8. Voeg jezelf toe aan een interne testgroep en selecteer de build. Gebruik de TestFlight-app op je iPhone om te installeren. Voor externe testers kan Apple een Beta App Review verlangen.

Geen Mac in huis? De bron kan ook via een macOS-builddienst worden gebouwd. Dat vereist nog steeds het instellen van signing en je Apple-account; een ZIP met broncode kan niet rechtstreeks op de iPhone worden geïnstalleerd. Xcode Cloud is een Apple-optie als je repository en workflow zijn aangesloten.

## TestFlight-tekst: wat testen

Fotoswipe heeft geen gebruikersaccount nodig. Start de app, geef fototoegang en test met enkele wegwerp-testfoto's:

1. Weiger toegang: zie uitleg en een knop naar Instellingen; de app crasht niet.
2. Geef beperkte toegang: alleen toegestane foto's verschijnen; 'Wijzig' opent Apple's selectiescherm.
3. Geef volledige toegang: ook je andere foto's zijn beschikbaar.
4. Swipe rechts en links en test beide knoppen. Er wordt bij het swipen niets uit Foto's verwijderd.
5. Maak je laatste keuze ongedaan. Een eerder bewaarde of weggelegde foto komt terug.
6. Sluit de app volledig en open opnieuw: voortgang en verwijderselectie zijn bewaard.
7. Open 'Bekijken', vergroot een foto en herstel deze; de foto verdwijnt uit de selectie en komt terug in de stapel.
8. Annuleer het verwijderen in het appvenster: er verandert niets.
9. Bevestig in het appvenster en annuleer bij Apple: de verwijderselectie blijft behouden.
10. Verwijder enkele testfoto's met beide bevestigingen: ze verdwijnen uit de bibliotheek en zijn terug te vinden onder 'Recent verwijderd'.
11. Test een iCloud-foto, tijdelijk offline werken, een Live Photo, een lege bibliotheek, alle foto's bekeken en een lange sessie.
12. Test VoiceOver, grote tekst, een klein scherm en terugkomen uit de achtergrond.

Bij iCloud-foto's synchroniseert Apple verwijderingen ook naar je andere apparaten. Controleer dit met testmateriaal. Fotoswipe maakt geen foto-back-up.

## Privacy en gegevens

De app schrijft alleen lokale foto-identifiers, keuzes en een beperkte undo-geschiedenis naar `Application Support/Fotoswipe/decisions.json` in de app-sandbox. Dat bestand bevat geen foto's, accountgegevens of locatie. Identifiers worden niet gedeeld. De normale iPhone-back-up kan appgegevens meenemen. Verwijderen van de app verwijdert de lokale voortgang.

Foto's worden weergegeven via Apple's PhotoKit. iCloud-foto's kunnen door Apple's eigen framework worden gedownload om ze te tonen. De app gebruikt geen eigen upload, tracking, analytics of third-party netwerkcode.

Er is een `PrivacyInfo.xcprivacy` inbegrepen. Voor de huidige broncode worden geen tracking, verzamelde gegevens of required-reason API-categorieën gedeclareerd. Controleer het Xcode-privacyrapport en App Store Connect opnieuw bij wijzigingen. Publiceer voor publieke distributie desgewenst de privacytekst hieronder op je eigen supportwebsite; in deze oplevering is geen URL verzonnen.

### Privacytekst voor publicatie

Fotoswipe verwerkt je foto's op je eigen apparaat om ze te tonen en je keuzes bij te houden. Er is geen account en wij verzamelen of ontvangen geen persoonsgegevens of foto's via de app. Je keuzes worden lokaal opgeslagen. Apple's Foto's- en iCloud-diensten kunnen volgens je eigen apparaatinstellingen worden gebruikt. Verwijderen gebeurt alleen na jouw bevestiging en wordt bij iCloud-foto's gesynchroniseerd naar gekoppelde apparaten. Je kunt fototoegang wijzigen via Instellingen en de lokale appgegevens verwijderen door de app te verwijderen.

## Architectuur en broncode

- `DecisionStore.swift`: bewaar- en weglegkeuzes, undo, lokale serialisatie.
- `PhotoLibrary.swift`: autorisatie, ophalen metadata, bibliotheekwijzigingen, prefetch, batchverwijderen, opslag.
- `AssetImage.swift`: afbeeldingen laden en annuleren, iCloud, herstel van laadfouten.
- `ContentView.swift`: startscherm, toegang, swipestapel en knoppen.
- `ReviewView.swift`: controle, vergroten, herstellen, verwijderen en privacy-uitleg.
- `FotoswipeTests/DecisionStoreTests.swift`: zes XCTest-tests voor voortgang en destructieve-keuzelogica.

Deze implementatie is nieuw geschreven met Apple's publieke SwiftUI- en PhotoKit-API's. De eerder gevonden open-source cleaners zijn niet gekopieerd. Er worden geen ongedocumenteerde `fileSize`-eigenschappen, private API's of externe bibliotheken gebruikt.

## Officiële documentatie

- PhotoKit: https://developer.apple.com/documentation/photos
- Verwijderverzoeken: https://developer.apple.com/documentation/photos/phassetchangerequest
- Uploads en actuele Xcode-vereisten: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- TestFlight: https://developer.apple.com/testflight/
