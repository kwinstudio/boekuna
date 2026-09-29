# Versturen via eigen e-mailapp

## Doel

Deze flow geeft een definitieve Boekuna-factuur door aan de e-mailapp van de gebruiker. Boekuna verstuurt in deze route zelf geen e-mail en krijgt geen toegang tot de mailbox.

## Flow

1. De bestaande invoice send-validatie controleert of de factuur verzendbaar is.
2. Alleen een definitieve factuur kan verder.
3. De client vraagt via de authenticated `send-invoice` Edge Function om `action: "render_pdf"`.
4. De Edge Function gebruikt dezelfde `pdfBytes()`-implementatie als de bestaande mailbox-deliveryflow en retourneert `application/pdf`.
5. De client maakt daarvan een `File` met een gesaneerde naam.
6. Als `navigator.share` + `navigator.canShare({ files })` beschikbaar zijn, wordt de native share sheet gebruikt.
7. Anders wordt de PDF gedownload en opent de gebruiker daarna de eigen e-mailapp via een URI-gecodeerde `mailto:`-link. De UI vermeldt expliciet dat de PDF handmatig moet worden toegevoegd.
8. Na de handoff vraagt Boekuna: “Heb je de factuur verzonden?”
9. Alleen na “Ja, markeer als verzonden” worden `lastSentAt`, `lastSentTo` en feitelijke send-history metadata bijgewerkt.

## Statussemantiek

Een geopende share sheet, geopende mail-app, download of geslaagde `navigator.share()` betekent niet dat een e-mail is verzonden. De financiële invoice-status wordt door deze feature niet gewijzigd. De bestaande statussemantiek blijft leidend; delivery-evidence staat apart.

## Privacy en security

- Geen Gmail API, Outlook API, SMTP of externe mailprovider nodig voor deze route.
- Geen mailboxleesrechten of tokens nodig.
- De PDF-route vereist een geldige Boekuna-authsessie.
- Onderwerpregels worden ontdaan van CR/LF.
- Ontvangers worden syntactisch gevalideerd.
- `mailto:`-waarden worden URI-gecodeerd.
- Bestandsnamen worden beperkt tot veilige tekens.
- Object-URL's voor downloads worden na gebruik ingetrokken.
- Auditregels bevatten alleen factuurnummer, kanaal en actie; geen volledige e-mailbody of PDF-inhoud.

## Platformgedrag

### iOS / Android

Bij ondersteunde browsers wordt de native share sheet gebruikt en wordt de PDF als `application/pdf` aangeboden. Als de browser de PDF niet via Web Share kan delen, volgt de fallback.

### Windows / macOS / overige desktopbrowsers

Web Share wordt uitsluitend gebruikt wanneer feature detection voor file sharing positief is. Anders downloadt Boekuna de PDF en vult de e-mail via `mailto:` voor. Attachments worden nooit via een niet-standaard `mailto:`-parameter gesimuleerd.

## Handmatige device-QA

Automatische browsertests bewijzen feature detection, PDF-File metadata, share/cancel/fallback/statusgedrag en responsive modals. De uiteindelijke lijst van share targets (bijvoorbeeld Gmail, Outlook of Apple Mail), en of een doel-app op een concreet fysiek toestel title/text exact overneemt, blijft OS- en app-afhankelijk en moet op een echt toestel worden gecontroleerd.
