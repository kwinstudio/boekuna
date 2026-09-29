# Native factuurverzending via eigen e-mailapp

## Productflow

Boekuna verstuurt een factuur in deze flow niet zelf. Bij **Versturen via e-mail** valideert de app de definitieve factuur en het bevestigde klant-e-mailadres, vraagt de bestaande beveiligde `send-invoice` Edge Function om de authoritative factuur-PDF en geeft die vervolgens door aan het apparaat van de gebruiker.

Op apparaten met Web Share file support gebruikt Boekuna `navigator.share()` met een `File` van `application/pdf`. Het besturingssysteem bepaalt welke geschikte apps worden aangeboden en welke van title/text/file door de gekozen app worden overgenomen.

Als file sharing niet beschikbaar is, downloadt Boekuna de PDF en opent de standaard e-mailapp via een URI-gecodeerde `mailto:` met ontvanger, onderwerp en bericht. De interface meldt expliciet dat de gedownloade PDF handmatig als bijlage moet worden toegevoegd. Boekuna simuleert geen attachment-parameter in `mailto:`.

## Privacy en mailboxen

Voor deze flow is geen Gmail-, Outlook-, SMTP- of andere mailproviderkoppeling nodig. Boekuna vraagt geen toegang tot inboxen, mailboxwachtwoorden of verzendtokens. Nieuwe mailbox-OAuth-verbindingen en directe mailboxverzending zijn server-side uitgeschakeld.

De oude mailbox-backendstructuur en bestaande opgeslagen verbindingen worden niet agressief verwijderd in deze wijziging. Ze zijn deprecated en staan buiten de gebruikersflow; accountverwijdering blijft eventuele opgeslagen mailboxcredentials opruimen. Definitieve schema/Vault-cleanup kan later als afzonderlijke migratie plaatsvinden.

## Status en audit

Een geopende share sheet, geslaagde `navigator.share()`, PDF-download of geopende e-mailapp bewijst niet dat de e-mail werkelijk is verzonden. Daarom wijzigt Boekuna de factuurstatus niet automatisch.

Na de handoff vraagt Boekuna **“Heb je de factuur verzonden?”**. Alleen na de expliciete keuze **“Ja, markeer als verzonden”** worden delivery-metadata en send-history bijgewerkt. Annuleren van de share sheet is normaal gedrag en laat de factuur ongewijzigd.

Auditregels bevatten alleen feitelijke handoff-/bevestigingsinformatie; de volledige e-mailbody en PDF-inhoud worden niet in de auditlog geschreven.

## PDF en financiële waarheid

De handoff maakt geen tweede financiële berekening. De Edge Function gebruikt dezelfde `pdfBytes()`-implementatie die al voor de authoritative BOEKUNA factuur-PDF bestaat. De route accepteert alleen definitieve facturen; concepten en onbeheerde/onafgeronde nummers worden geweigerd.

## Platformbeperkingen

Web Share is afhankelijk van browser, OS en ontvangende app. Boekuna kan een PDF, title en tekst aanbieden, maar kan niet garanderen dat elke mail-app ontvanger, onderwerp, body en attachment op ieder platform identiek vooraf invult.

Automatische Chromium/WebKit-tests bewijzen de applicatielogica, bestandmetadata, fallback, annulering en statussemantiek. De uiteindelijke share-targetlijst en concrete Gmail/Outlook/Apple Mail-overname op een fysiek iOS- of Android-toestel moeten op dat toestel worden gecontroleerd.
