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


## Unified handoff v2 — 29 September 2026

Invoice delivery, payment reminders and follow-ups now share one user-controlled email handoff.

- A draft invoice can be finalized and moved directly into the email composer. Finalization still uses the existing invoice number reservation, validation, save and cloud-sync path.
- Desktop defaults to a safe mailto handoff so recipient, subject and body can be prefilled. When a PDF is included, Boekuna prepares/downloads it and explicitly tells the user to attach it.
- Gmail on desktop has an explicit browser-compose route. This does not use Gmail API or mailbox OAuth.
- Native Web Share remains available for browsers/devices that support sharing an application/pdf file.
- Payment reminders no longer call the disabled direct mailbox sender. They render the same authoritative invoice PDF and use the shared handoff.
- Reminder count/history and first-send metadata are written only after the user explicitly confirms that the email was sent.
- Cancelling after draft finalization leaves the invoice definitive/open and unsent; the reserved invoice number is never rolled back or reused.
- Payment reminders are blocked for drafts, credits, cancelled/paid invoices and zero outstanding balances. Before the due date, Boekuna offers a normal follow-up instead.


## Gmail / iPhone compose fix — 29 September 2026

A physical iPhone test showed that Gmail's native share target correctly attached the PDF but left **Aan** empty, used the PDF filename as the subject, and flattened the intended message layout. This is an app-level interpretation of Web Share metadata, so BOEKUNA no longer treats attachment-first sharing as a fully prefilled Gmail compose route.

The handoff now separates three user choices on mobile:

- **Gmail openen** — recipient, human-readable subject and plain-text body are encoded into Gmail compose; the prepared PDF is downloaded once for manual attachment.
- **PDF delen als bijlage** — keeps the working native share route so Outlook/other apps can receive the PDF directly, while clearly warning that the receiving app controls recipient and subject mapping.
- **Andere e-mailapp openen** — uses the safe mailto route for recipient, subject and body and prepares the PDF for manual attachment.

Prepared PDFs survive a return to the BOEKUNA composer, so changing only mail text does not trigger a second authoritative PDF render. Download state is also retained to prevent repeated Gmail clicks from downloading the same PDF again in one handoff.

No Gmail API, Gmail mailbox OAuth, SMTP or server-side delivery was introduced.
