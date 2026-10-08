# BOEKUNA — kosteloze App Store Connect-invoer (8 oktober 2026)

**Bestaande Apple-vermelding, geen nieuwe app maken:**  
https://appstoreconnect.apple.com/apps/6819651528/distribution/ios/version/inflight

**Status:** voor invoer voorbereid in GitHub; Apple Connect is in deze sessie niet geauthenticeerd. Geen velden in Apple bevestigd of gewijzigd.

## App-informatie (Algemeen > App-informatie)

| Veld | Waarde |
| --- | --- |
| Appnaam | Boekuna |
| Subtitel | Boekhouden zonder gedoe |
| Primaire categorie | Finance / Financiën |
| Secundaire categorie | Business / Zakelijk |
| Lokalisatie | Dutch / nl-NL |
| Bundle ID | nl.boekuna.app (reeds opgegeven; verifiëren in Apple) |
| SKU | boekuna-ios-001 (reeds opgegeven; verifiëren in Apple) |
| Publicatiegebied | Nederland eerst |

Let op: de copyright-/verkopersnaam **niet** automatisch overnemen of wijzigen; gebruik de exacte bij Apple geverifieerde juridische identiteit.

## iOS-versie 1.0.0: klaar om te kopiëren

### Promotietekst (maximaal 170 tekens)
Scan bonnen en facturen, controleer bedragen en btw en houd je administratie overzichtelijk in één app.

### Beschrijving (maximaal 4000 tekens)
Boekuna helpt Nederlandse zzp’ers en kleine ondernemers hun administratie overzichtelijk bij te houden.

Maak verkoopfacturen, bewaar zakelijke bonnetjes en inkoopfacturen en bekijk je inkomsten, kosten en btw op één plek.

Met Boekuna kun je:
• Verkoopfacturen maken en als PDF delen
• Bonnen en inkoopfacturen uploaden
• Herkende bedragen, datums en btw controleren voordat je opslaat
• Klanten en leveranciers beheren
• Inkomsten, kosten en btw-overzichten bekijken
• Administratieve gegevens exporteren
• Je account beheren en verwijderen

Een documentscan kan fouten bevatten. Daarom kun je herkende gegevens zelf controleren en waar nodig aanpassen. Btw-overzichten helpen bij je voorbereiding; Boekuna dient geen btw-aangifte rechtstreeks in bij de Belastingdienst.

Boekuna is geen vervanging voor persoonlijk boekhoudkundig of fiscaal advies.

### Zoekwoorden (maximaal 100 bytes)
zzp,facturen,bonnen,btw,administratie,inkoop,freelancer,ondernemer,kosten,scanner

### URLs
- Support: https://boekuna.nl/support/
- Marketing: https://boekuna.nl/
- Privacybeleid: https://boekuna.nl/privacy/
- Account verwijderen: https://boekuna.nl/account-verwijderen/

## App Privacy (Algemeen > App Privacy)

Deze vragen zijn NIET veilig blind te beantwoorden. Definitieve binaire app/SDK's en backendprocessen bepalen de keuze. Voorlopige gegevensgroepen uit de BOEKUNA-privacy-inventarisatie:

- Contactgegevens: e-mailadres en vrijwillig ingevulde zakelijke contactgegevens.
- Financiële gegevens: bedragen, betalingen, facturen, btw, mogelijke bankgegevens.
- Gebruikersinhoud: geüploade bonnen, PDF's, documenten en tekstextractie.
- Identificatiegegevens: account-ID en benodigde interne identificaties.
- Diagnostiek: beoordelen of crash-/beveiligingslogs aan gebruikers zijn gekoppeld.
- Tracking en advertenties: omschreven als niet in gebruik; vóór definitief indienen opnieuw technisch toetsen.

Kies niet 'verzamelt geen gegevens'. Zie `store/privacy-data-safety.md`. Apple vereist een waarheidsgetrouwe privacyverklaring inclusief de verwerking door relevante derde partijen.

## Demo / App Review

- Zet uitsluitend een demo-account met fictieve bedrijfstransacties klaar.
- Zet privé-inloggegevens ALLEEN in het afgeschermde App Review-gedeelte van Apple, nooit in GitHub.
- Review-instructies: `store/review-notes.md`.
- In-app Stripe checkout/upgrade CTA's mogen niet ongemerkt in de iOS-versie verschijnen.

## Screenshots

Wachten op een finale geteste iOS-build; géén marketingmockups of screenshots van een oudere webbuild aanbieden als finale App Store-screenshots.

Voorgestelde volgorde:
1. Dashboard met fictieve cijfers
2. Factuur aanmaken
3. Bonnetje uploaden
4. Bedragen en btw controleren
5. Btw-overzicht

Het app-icoon van BOEKUNA is op 8 oktober vervangen door het **witte bonnetje op groen** (commit `e5a703790a920696fd1d8f298cb67a10de06aa1f`). De iOS-baseline PR #223 dateert van vóór die wijziging: de iOS AppIcon asset moet vóór builds worden gesynchroniseerd en gecontroleerd.

## Wat nog niet zonder Apple-toegang kan

- Controleren of de bestaande record 6819651528 nu 'Prepare for Submission' of een andere status heeft.
- Apple-formulieren opslaan, App Privacy publiceren of de leeftijdsclassificatie invullen.
- Een echte iOS-binary en screenshots uploaden.
- Beslissen of Apple een Individual-account accepteert voor deze app met gevoelige financiële documenten (richtlijn 5.1.1(ix)).

## Kostenloos verder

Optie 1 — Handmatig invullen: open de bestaande link, kopieer de waarden uit dit document.

Optie 2 — App Store Connect API: Apple biedt een officiële API voor versie-lokalisaties (beschrijving, keywords, promotietekst en URLs). Hiervoor moet de accounthouder de vereiste API-toegang en rol regelen. Bewaar API-sleutels geheim; upload ze nooit in chat of GitHub.

Optie 3 — ChatGPT Work Cloud Browser: indien beschikbaar in de gebruikersinterface, kan de gebruiker de bestaande App Store Connect-site openen en zich daar persoonlijk aanmelden. Dit document is het inhoudelijke uitgangspunt.

## Officiële Apple-bronnen

- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/app-store/review/guidelines/
