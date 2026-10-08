# Boekuna app: end-to-end audit en releasegereedheid

| | |
|---|---|
| Datum | 8 oktober 2026 |
| Scope | De app (app.boekuna.nl). De marketingwebsite valt buiten scope. |
| Geteste commit (kandidaat) | `85654b2` op branch `claude/project-thread-2fzuoe` (PR #276) |
| App-code getest op | `a4cbf99`, `be48c08`, `55d3b80`, `b7a990f` en `85654b2`. `kwinest/index.html` is in de eerste drie identiek. `55d3b80` wijzigt alleen `delete-account`. `b7a990f` laat oude definitieve facturen hun afronding houden (BUG-001). `85654b2` wijzigt alleen een pixeltest. Daarna zijn alle testbestanden uit de CI opnieuw gedraaid. |
| Productie tijdens de test | App `e1119d2` (ochtend), daarna `366ff22` (#273). `main` staat nu op `f9818ec` (#274, alleen website). |
| Verschil productie en kandidaat | De vier P1-fixes en twee P2-fixes uit dit rapport staan nog niet live (zie I en J). |
| Testers | Claude (geautomatiseerd met Playwright/Chromium, Node, Python). Live met twee QA-accounts na akkoord van Kwin ("Ja, stap 1-5"). |
| Testdata | Alleen synthetische data: "Bakkerij QA A", "Klant QA BV", "Groothandel Testmeel B.V." en gelijksoortig. Geen klantgegevens, geen echte betalingen, geen mail naar klanten. |

De in de opdracht genoemde "BOEKUNA Elite Agent Skillmap v3.0" staat niet in de repository. Deze audit volgt daarom de opdrachttekst zelf.

Statussen in dit rapport: **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED** en **NOT IMPLEMENTED**. Een PASS is altijd gebaseerd op een uitgevoerde test (browser, runtime of live), nooit alleen op het lezen van code.

---

## A. Managementsamenvatting

**Advies: CONDITIONAL GO voor commit `85654b2` (PR #276).** De huidige productieversie (`366ff22`) haalt de lat niet. Daar zijn vier P1-fouten live:

1. **Dataverlies na inloggen (P1).** Supabase meldt "SIGNED_IN" opnieuw vlak na het inloggen en elke keer dat je terugkomt in het tabblad. De app laadt dan de administratie opnieuw uit de cloud. Wat je net had ingevoerd verdween, en je ging terug naar Overzicht. Dit is live nagespeeld met een QA-account.
2. **Btw-afronding (P1).** 22,50 excl. btw tegen 21% gaf € 4,72 in plaats van € 4,73. Dat gebeurt bij 21% bij ongeveer 1 op de 1.400 bedragen, in de factuur, de PDF en de btw-aangifte. Live bevestigd. Facturen die al definitief zijn, houden na de fix hun oude bedrag; alleen nieuwe facturen rekenen nieuw.
3. **Creditfactuur (P1).** Een definitieve creditfactuur zette de oude factuur niet op nul. De factuur bleef "Nog te ontvangen" en werd "Te laat".
4. **Account verwijderen werkt niet (P1).** De browser blokkeert het verzoek, want de functie beantwoordt de CORS-preflight met 405. Er wordt niets verwijderd. Live bevestigd met de Supabase-logs.

Alle vier zijn opgelost in PR #276, met tests die vóór de fix falen en erna slagen. De fix voor dataverlies is ook gecontroleerd met de branch-build tegen de echte live backend (H-01 t/m H-06: PASS). Daarnaast verbetert de scanner op twee punten (P2).

Wat goed is:
- Tenant-isolatie: live 28 van 28 controles PASS met twee accounts (database, opslag en edge functions).
- De btw-aangifte rekent juist (rubrieken 1a, 1b, 1e en 5b) en sluit aan op het overzicht en de rapportage.
- De bankimport werkt live, inclusief automatisch koppelen.
- Offline opslaan en herstel werken.
- Uitloggen wist de lokale gegevens.
- Geen ernstige axe-meldingen. Geen horizontaal scrollen op 7 breedtes.
- De scanner faalt veilig: bij twijfel moet de gebruiker controleren en kan hij niet opslaan zolang bedragen niet kloppen.

Wat nog open staat:
- Zeven P2's (zie J). De belangrijkste: de terugknop verlaat de app, Escape gooit een half ingevulde factuur weg, zoeken vindt oude facturen niet zolang de periode op "Deze maand" staat, er ontbreken security-headers, en de scanner leest een kassabonfoto onjuist (wel geblokkeerd voor opslaan).
- Niet getest:
  - Stripe in testmodus (niet beschikbaar; live is verboden)
  - Safari/WebKit en Firefox
  - echte telefoons
  - lokale beeld-OCR-benchmark (RapidOCR niet installeerbaar in de container)

**Voorwaarden voor GO:**
- PR #276 mergen en uitrollen (app, edge functions `send-invoice` en `delete-account`, scanner).
- Na de uitrol een korte hertest op productie.
- Eén Stripe-testmodusronde.
- Eén iPhone/Safari-rooktest.

---

## B. Testdekking

| Onderdeel | Testcases | Geslaagd | Gefaald | Geblokkeerd | Niet getest |
|---|---:|---:|---:|---:|---:|
| Registratie, inloggen, uitloggen | 12 | 12 | 0 | 1 | 2 |
| Onboarding en bedrijfsgegevens | 4 | 4 | 0 | 0 | 0 |
| Dashboard (overzicht) | 5 | 5 | 0 | 0 | 0 |
| Relaties | 6 | 6 | 0 | 0 | 0 |
| Facturen | 25 | 21 | 4 | 0 | 0 |
| Creditfacturen | 5 | 5 | 0 | 0 | 0 |
| Kosten | 13 | 9 | 4 | 0 | 0 |
| Documenten en scanner (OCR) | 11 | 6 | 5 | 1 | 2 |
| Btw en rapportages | 8 | 7 | 1 | 0 | 0 |
| Bankimport | 3 | 3 | 0 | 0 | 0 ¹ |
| Abonnementen (Stripe testmodus) | 0 | 0 | 0 | 4 | 0 |
| Offline, synchronisatie en dataverlies | 11 | 9 | 2 | 0 | 0 |
| Account verwijderen | 1 | 0 | 1 | 0 | 0 |
| Schermbreedtes en mobiel | 3 | 3 | 0 | 3 | 0 |
| Toegankelijkheid (WCAG 2.2 AA) | 4 | 4 | 0 | 0 | 1 |
| Security en tenant-isolatie | 28 | 28 | 0 | 0 | 0 |
| Performance | 1 | 1 | 0 | 0 | 0 |
| Console en netwerk | 1 | 1 | 0 | 0 | 0 |
| **Subtotaal audit (nieuw)** | **141** | **124** | **17** | **9** | **5** |
| Bestaande CI-suite (testbestanden) | 116 | 104 | 0 | 12 | 0 |
| **Totaal** | **257** | **228** | **17** | **21** | **5** |

¹ MT940 en CAMT.053: **NOT IMPLEMENTED** in de app. De server-bibliotheek `financial-automation` kan ze lezen, maar de app accepteert alleen `.csv`, `.tab` en `.txt` (`#csvFile`).

Toelichting:
- De 12 geblokkeerde suite-tests vallen in drie groepen:
  - 7 hebben de OCR-motor (RapidOCR/ONNX) nodig, die hier niet te installeren is (de build van `antlr4-python3-runtime` faalt).
  - 4 hebben WebKit nodig, dat niet in de container zit. Daarvan zijn er 3 voor de website.
  - 1 heeft Postgres/psycopg nodig.
  - In CI draaien deze wel.
- De 17 FAILs zijn als bug opgenomen in D. Acht daarvan zijn opgelost in PR #276. Die FAILs zijn gemeten op productie en de hertest staat in D.
- Herhaalbare tests staan in de repo:
  - `tests/release-audit-browser.test.mjs`: 63 controles voor gebruiker A, B en C. Handmatig te draaien. Deze test faalt bewust zolang de 6 open punten uit C-13, C-15, B-21, A-39, C-20 en C-24 bestaan.
  - `tests/auth-signed-in-once.test.mjs` (in CI)
  - `tests/invoice-rounding-history.test.mjs` (in CI)
  - `tests/delete-account-cors.test.mjs` (in CI)
  - `tests/document-vat-summary-rows.test.py` (in CI)
  - extra gevallen in `tests/production-integrity.test.mjs` (in CI)

---

## C. Functionele resultaten

Afkortingen:
- A-, B-, C-, M-, R- en W-nummers zijn controles uit `tests/release-audit-browser.test.mjs`. Ze draaien op de first-release-build van de kandidaat, met een nep-backend.
- L-nummers zijn live tests op app.boekuna.nl met de QA-accounts.
- H-nummers zijn tests met de branch-build tegen de live backend.
- S-nummers zijn tenant-isolatietests.

### C.1 Eindacceptatie (gevraagde reis)

| Stap | Waar getest | Status | Bewijs |
|---|---|---|---|
| Registreren | Live, accounts A en B | PASS | L-R01/L-R02: de signup geeft 200 en het scherm "Controleer je e-mail". Bevestigd via SQL (stap 2 van het akkoord). Het klikken op de mail-link: BLOCKED. |
| Onboarding | Lokaal en live | PASS | A-01 t/m A-03. L-A02: bedrijfsprofiel "Bakkerij QA A" opgeslagen. |
| Administratie instellen | Live | PASS | L-A01: tijdelijke ZZP-toegang zichtbaar (plan zzp, entitlement paid). |
| Klant toevoegen | Lokaal en live | PASS | A-10, A-11, L-A03 |
| Factuur maken | Live (productie) | FAIL | L-A04: btw 21% over 22,50 is € 4,72 en het totaal € 40,79 (moet € 4,73 en € 40,80 zijn). |
| | Kandidaat | PASS | A-20, A-22, A-24, A-28 en M-02 geven € 4,73 en € 40,80. |
| Document uploaden | Live | PASS | L-A13: PDF ontvangen en "Controle nodig" na ongeveer 67 s. L-A50: foto na 86 s. |
| OCR controleren | Live | FAIL | L-A15: de datum ontbreekt. L-A16: de btw-verdeling is leeg. L-A52: de bedragen van de foto zijn fout. In alle drie de gevallen blokkeert de app het opslaan. |
| | Kandidaat (scanner) | PASS | `document-vat-summary-rows.test.py`: btw-regels 9% en 21% en de status "deels betaald". |
| Btw controleren | Live | PASS | L-A42: 5b = € 22,50 (10,50 + 12,00). L-A10 (1a € 4,72) is BUG-001. |
| Dashboard openen | Live | PASS | L-A09 |
| Gegevens terugvinden | Live | PASS | L-A12 en L-C04: na opnieuw inloggen op een "nieuw apparaat" staat alles er. |
| Uitloggen | Live | PASS | L-C05 t/m L-C08 |
| Opnieuw inloggen | Live en kandidaat | PASS | L-C04, H-05 |

### C.2 Per gebruiker

**Gebruiker A (beginner).**
- Werkt van leeg overzicht naar eerste factuur zonder vast te lopen (A-01, M-03).
- Kosten boeken toont de btw die je terugkrijgt (A-40).
- Één struikelpunt: op een lege Kosten-pagina staat alleen "Bon of factuur toevoegen" (bestandskiezer). Zelf invullen zit onder "Nieuw" (A-39, L-A07; P3).

**Gebruiker B (ervaren, veel data).**
- 600 facturen, 900 kosten en 150 relaties: alle pagina's openen binnen 1 s (B-20). Het dashboard is het traagst met 787 ms.
- Concept verwijderen vraagt bevestiging. Een definitieve factuur kan niet zomaar weg (B-23, B-24).
- Zoeken op een oud factuurnummer geeft "Geen facturen gevonden" zolang de periode op "Deze maand" staat. De melding noemt de periode niet (B-21; P2).

**Gebruiker C (maakt fouten).**
- Wat goed gaat:
  - Lege verplichte velden, een negatief bedrag en dubbelklik op Opslaan worden goed afgevangen (C-10 t/m C-12, C-21 t/m C-23).
  - Een onbekende pagina valt terug op Overzicht (C-14).
  - Offline opslaan toont "Niet opgeslagen" en synchroniseert na herstel (L-C01 t/m L-C03).
- Wat fout gaat:
  - Escape gooit een half ingevulde factuur weg zonder vraag (C-13; P2).
  - De terugknop verlaat de app (C-15, L-C07; P2).
  - € 0 en het jaar 2206 worden geaccepteerd (C-20, C-24; P3).

### C.3 Functiematrix

| Functie | Gebruiker | Lokaal (kandidaat) | Live (productie) | Test-ID's |
|---|---|---|---|---|
| Registreren | A, B | n.v.t. | PASS | L-R01, L-R02 |
| Inloggen, foutmeldingen (onbevestigd, fout wachtwoord, onbekend account) | C | n.v.t. | PASS | L-R03 t/m L-R05 |
| Inloggen laadt de administratie één keer | A | PASS | FAIL (BUG-003) | auth-signed-in-once, H-02, L-B01 |
| Tabbladwissel houdt invoer | A, C | PASS | FAIL (BUG-003) | auth-signed-in-once, H-03, L-B02 |
| Uitloggen wist lokale data | C | n.v.t. | PASS | L-C05 t/m L-C08 |
| Wachtwoord vergeten | A | NOT TESTED | NOT TESTED | (zou echte mail sturen) |
| Tweestapsverificatie instellen | B | NOT TESTED | NOT TESTED | |
| Bedrijfsgegevens | A | PASS | PASS | A-02, A-03, L-A02 |
| Relatie aanmaken, wijzigen, zoeken | A, B, C | PASS | PASS | A-10 t/m A-12, B-10, C-10, L-A03 |
| Factuur maken (desktop) | A | PASS | FAIL (BUG-001) | A-20 t/m A-25, L-A04 |
| Factuur maken (mobiel, 3 stappen) | A | PASS | NOT TESTED | M-02, M-03 |
| Factuurnummering zonder gaten of dubbelen | B | PASS | PASS | A-26, A-27, L-A05 |
| Factuur-PDF en versturen | A | PASS | PASS | A-28, L-A05 (PDF 200, `%PDF-`) |
| Betaling registreren | A | PASS | PASS | A-29, L-A06 |
| Creditfactuur | A | PASS | NOT TESTED | A-30 t/m A-34, A-58 |
| Herinnering | A | PASS | NOT TESTED | A-34, invoice-send-simple (suite) |
| Concept verwijderen | B | PASS | NOT TESTED | B-23, B-24 |
| Zoeken in facturen | B | FAIL | NOT TESTED | B-21, B-22 |
| Kosten boeken en wijzigen | A | PASS | PASS | A-40 t/m A-44, L-A08 |
| Kosten: invoercontrole | C | FAIL | NOT TESTED | C-20 t/m C-24 |
| Document uploaden (PDF) | A | n.v.t. | PASS | L-A13 |
| Scanner PDF: leverancier, nummer, totaal | A | PASS | PASS | L-A14, suite |
| Scanner PDF: datum (twee kolommen) | A | FAIL | FAIL | L-A15 |
| Scanner PDF: btw-regels "over" | A | PASS | FAIL | document-vat-summary-rows, L-A16 |
| Scanner PDF: deels betaald | A | PASS | FAIL | document-vat-summary-rows, L-A43 |
| Scanner foto (kassabon) | A | BLOCKED | FAIL (veilig) | L-A50 t/m L-A53 |
| Controle opslaan wordt kosten met juiste btw | A | n.v.t. | PASS | L-A40, L-A41 |
| Btw-aangifte (1a, 1b, 1e, 5b) | A | PASS | FAIL (BUG-001) / PASS (5b) | A-50 t/m A-53, L-A10, L-A42 |
| Overzicht en rapportage sluiten aan | A | PASS | PASS | A-54 t/m A-57, L-A09, L-A11 |
| Bankimport CSV (ING) | B | PASS (suite, 9 formaten) | PASS | bank-import-reliability, L-A60, L-A61 |
| Automatisch koppelen | B | PASS (suite) | PASS | L-A62 |
| MT940 / CAMT.053 | B | NOT IMPLEMENTED | NOT IMPLEMENTED | |
| Abonnement kiezen, betalen, opzeggen | A | BLOCKED | BLOCKED | (geen Stripe-testmodus; live verboden) |
| Account verwijderen | A | PASS (harnas) | FAIL (BUG-004) | delete-account-cors, L-D01 |
| Offline opslaan en herstel | C | n.v.t. | PASS | L-C01 t/m L-C03 |
| Breedtes 320 t/m 1440 | A | PASS | NOT TESTED | R-01, M-04 |
| Toegankelijkheid (axe) | A | PASS | NOT TESTED | W-01 t/m W-05 |
| Tenant-isolatie | A, B | n.v.t. | PASS | S-01 t/m S-70 (28) |

---

## D. Bugrapport

Ernst: P0 = blokkerend of datalek, P1 = verkeerde financiën, dataverlies of kernfunctie stuk, P2 = belangrijk maar met omweg, P3 = klein.

### BUG-001: Btw en regelbedragen ronden halve centen soms naar beneden

| Veld | Inhoud |
|---|---|
| Ernst | P1 |
| Route | Inkomsten › Factuur maken. Ook de PDF/mail (`send-invoice`) en de btw-aangifte. |
| Functie | `toCents` in `kwinest/index.html` en `supabase/functions/send-invoice/index.ts` |
| Reproductiestappen | 1. Nieuwe factuur. 2. Regel van 22,50 excl. btw tegen 21%. 3. Kijk naar de btw. |
| Verwacht | € 4,73 (4,725 naar boven afgerond); totaal € 40,80 met een 9%-regel van 12,45 |
| Werkelijk | € 4,72; totaal € 40,79 |
| Oorzaak | Binaire floats: 4,725 × 100 = 472,49999…, `Math.round` geeft 472. Fuzz over 5 miljoen bedragen: 3.496 fout bij 21% en 2.756 bij 9%; regelbedragen 1.929 van 590.000. |
| Screenshot/log | `scratchpad/qa/live/shots/a2-factuur.png`, `a2-btw.png`. Live: "Btw 21% € 4,72 … Totaal te betalen € 40,79". |
| Oplossing | Afronden op het decimale bedrag: `Math.round(Number((Math.abs(n)*100).toPrecision(12)))` met teken. Dezelfde code staat in `send-invoice`. |
| Impactanalyse | De app rekent factuurbedragen bij elke weergave opnieuw uit de regels. Zonder extra maatregel zou de fix dus ook oude, al verstuurde facturen met een halve cent veranderen: € 40,79 wordt € 40,80, er blijft € 0,01 open terwijl de klant alles betaalde, en rubriek 1a van een al ingediende aangifte schuift € 0,01. Daarom krijgen facturen die al definitief waren bij de eerste keer laden na de update het kenmerk `rounding: 'legacy'` (eenmalig, vastgelegd met `meta.decimalRounding`). Zij en hun creditfacturen rekenen met de oude afronding, in de app en in `send-invoice`. Concepten, kopieën en nieuwe facturen rekenen nieuw. Een herstelpunt van vóór de update krijgt bij terugzetten dezelfde behandeling. |
| Status | Opgelost in PR #276 (`a7b0e45`; oude facturen vergrendeld in `b7a990f`). Nog niet live. |
| Hertest | PASS lokaal: A-20, A-22, A-24, A-28, M-02, M-03 en `production-integrity` (1,005 → 101, 10,075 → 1008, −4,725 → −473). `invoice-rounding-history` (A-29b): faalt zonder de vergrendeling (oude betaalde factuur € 40,80, € 0,01 open, 1a € 4,73) en slaagt erna (€ 40,79, niets open, 1a € 4,72; creditfactuur −€ 40,79; nieuwe factuur en kopie € 40,80; `send-invoice` gelijk). Live hertest na deploy. |

### BUG-002: Creditfactuur zet de oude factuur niet op nul

| Veld | Inhoud |
|---|---|
| Ernst | P1 |
| Route | Inkomsten › factuur › Crediteren |
| Functie | `invoiceOutstanding`, `invoiceEffectiveStatus`, statusbadge |
| Reproductiestappen | 1. Definitieve factuur van € 40,80, vervaldatum verstreken. 2. Volledige creditfactuur definitief maken. 3. Kijk naar de facturenlijst en "Nog te ontvangen". |
| Verwacht | Oude factuur staat op nul (verrekend). "Nog te ontvangen" is € 0,00. Geen herinnering. |
| Werkelijk | De oude factuur blijft open voor € 40,80, telt mee in "Nog te ontvangen" en krijgt "Te laat". |
| Oorzaak | Het openstaande bedrag hield geen rekening met definitieve creditfacturen. |
| Screenshot/log | `scratchpad/qa/audit-before.json` (A-30 t/m A-33, A-55 en A-58 FAIL op `main`) |
| Oplossing | `invoiceCreditOffset`: definitieve creditfacturen verrekenen het onbetaalde deel, oudste eerst. Wat al betaald was, blijft open op de creditfactuur als terugbetaling. Nieuwe status "Verrekend". |
| Status | Opgelost in PR #276 (`52fc100`). Nog niet live. |
| Hertest | PASS: A-30 t/m A-34, A-55, A-58. `production-integrity`-gevallen: concept verrekent niets; volledig [0,0]; deels 13,57; betaald origineel geeft 40,80 terug; twee credits in datumvolgorde; credit hoger dan open. |

### BUG-003: Ingevoerde gegevens verdwijnen kort na inloggen en bij terugkeer naar het tabblad

| Veld | Inhoud |
|---|---|
| Ernst | P1 (dataverlies) |
| Route | Inloggen, en elke tabbladwissel |
| Functie | `onAuthStateChange`-listener, `hydrateCloudAccount`, `enterApp` |
| Reproductiestappen | 1. Inloggen. 2. Binnen enkele seconden een relatie toevoegen. Of: later een relatie toevoegen en direct naar een ander tabblad en terug. |
| Verwacht | De relatie blijft staan en je blijft op dezelfde pagina. |
| Werkelijk | De relatie verdwijnt en je gaat terug naar Overzicht. Live gemeten: na het opslaan wordt de staat ongeveer 360 ms later vervangen door de oudere cloudkopie (L-B01, L-B02). |
| Oorzaak | supabase-js (auth-js 2.117.3) meldt `SIGNED_IN` direct na `signInWithPassword` en opnieuw bij elke `visibilitychange`. Elke melding laadde de administratie opnieuw en riep `enterApp` aan. |
| Screenshot/log | `scratchpad/qa/live/live-b4.mjs` en `live-b5.mjs`. Uitvoer: "after 0 contacts ['Online Test BV'] … after 500 contacts []"; events "INITIAL_SESSION, SIGNED_IN, SIGNED_IN". |
| Oplossing | `loadSignedInUser`: één laadactie per ingelogde gebruiker. Latere meldingen delen die laadactie. Alleen de eerste opent de app. Een open sessie van dezelfde gebruiker laadt niets opnieuw. |
| Status | Opgelost in PR #276 (`a4cbf99`). Nog niet live. |
| Hertest | PASS: `auth-signed-in-once.test.mjs` (faalt vóór de fix). Branch-build tegen de live backend met QA-account B: H-01 t/m H-06 PASS (1 laadactie, relatie blijft, pagina blijft "contacts", opgeslagen, opnieuw inloggen, geen JS-fouten). |

### BUG-004: Account verwijderen doet niets (CORS)

| Veld | Inhoud |
|---|---|
| Ernst | P1 (AVG-recht op verwijdering via de app werkt niet; er is geen dataverlies) |
| Route | Instellingen › Gevaarzone › Account verwijderen |
| Functie | Edge function `delete-account` |
| Reproductiestappen | 1. Wachtwoord en "VERWIJDER" invullen. 2. Klik op "Definitief verwijderen". |
| Verwacht | Account en data verwijderd; melding "Account en cloudgegevens definitief verwijderd". |
| Werkelijk | De browser stuurt een preflight (OPTIONS). De functie antwoordt 405 zonder CORS-headers. Het POST-verzoek gaat nooit door en er wordt niets verwijderd. |
| Oorzaak | `delete-account` had geen OPTIONS-afhandeling en geen CORS-headers. Andere functies (`billing-portal`, `send-invoice`) hebben die wel. |
| Screenshot/log | Supabase function_edge_logs 8 okt 16:33 en 16:35: "OPTIONS \| 405 \| …/functions/v1/delete-account". SQL na de poging: auth-gebruiker en ledger van QA-account B bestaan nog. |
| Oplossing | Dezelfde CORS-aanpak als `billing-portal`: OPTIONS geeft 204, en elk antwoord heeft `Access-Control-Allow-Origin` (alleen bekende origins). |
| Status | Opgelost in PR #276 (`55d3b80`). Edge-deploy nodig. |
| Hertest | PASS: `tests/delete-account-cors.test.mjs` (faalt vóór de fix met 405). De volledige verwijdering via het harnas geeft 200 met CORS. Live hertest na deploy: beide QA-accounts via de app verwijderen (stap 5 van het akkoord). |

### BUG-005: Scanner leest btw-regels met "over" niet; de btw-verdeling blijft leeg

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | Bonnetjes › Controleren (gemengde btw) |
| Functie | `kwinest/docprocessor` (`app.py`, `document_intelligence.py`) |
| Reproductiestappen | PDF met "Btw 9% over 75,00 6,75" en "Btw 21% over 25,00 5,25" uploaden. |
| Verwacht | Btw-regels 9%: 75,00 en 6,75; 21%: 25,00 en 5,25 |
| Werkelijk | Live: de btw-regels zijn leeg (0,00) en je moet ze zelf invullen ("De btw-verdeling telt nog niet op tot het totaal"). Het totaal (112,00) en de btw (12,00) kloppen wel. |
| Oorzaak | Het label "Btw X% over <grondslag>" en een btw-cel met bedrag ("9% 75,00") werden niet als btw-regel herkend. |
| Screenshot/log | `scratchpad/qa/live/shots/a4-review-1.png`. L-A16. |
| Oplossing | De parser herkent het "over"-label, splitst de samengevoegde btw-cel en leest "restant/resterend/openstaand". |
| Status | Opgelost in PR #276 (`68d4e67`). Scannerdeploy nodig. |
| Hertest | PASS: `document-vat-summary-rows.test.py`. Synthetische bench: btw-regels 6/7 → 7/7, regeltarieven 6/7 → 7/7. Live hertest na deploy. |

### BUG-006: Deels betaalde inkoopfactuur wordt als "betaald" opgeslagen

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | Bonnetjes › Controleren › Factuur opslaan |
| Functie | Scanner (betaalstatus) |
| Reproductiestappen | PDF met "Reeds betaald 50,00" en "Openstaand 62,00" uploaden en opslaan. |
| Verwacht | Status open, nog € 62,00 te betalen |
| Werkelijk | Live opgeslagen als `status: "paid"`, `alreadyPaid: 50`, `outstandingAmount: null` (L-A43) |
| Oorzaak | "Reeds betaald" werd als volledig betaald gelezen; "Openstaand" niet. |
| Screenshot/log | `scratchpad/qa/live/live-a6.mjs`, uitvoer van de kostenpost |
| Oplossing | Zie BUG-005 (resterend/openstaand gelezen, status open) |
| Status | Opgelost in de scanner (PR #276). Of de app de status "open" goed overneemt, is pas na de scannerdeploy live te controleren. |
| Hertest | PASS: `test_partly_paid_invoice_stays_open` |

### BUG-007: Scanner mist de factuurdatum als datum en vervaldatum op één regel staan

| Veld | Inhoud |
|---|---|
| Ernst | P2 (faalt veilig: de app vraagt om de datum) |
| Route | Bonnetjes › Controleren |
| Functie | Tekstvolgorde van PyMuPDF bij twee kolommen |
| Reproductiestappen | PDF met links "Factuur aan:" en rechts "Factuurdatum: 02-10-2026 / Vervaldatum: 16-10-2026". |
| Verwacht | Datum 02-10-2026, vervaldatum 16-10-2026 |
| Werkelijk | Gesorteerde tekst: "Factuurdatum:Vervaldatum: 16-10-202602-10-2026". De datum is leeg en de melding is "Datum ontbreekt". |
| Oorzaak | `get_text(sort=True)` voegt twee kolommen op dezelfde hoogte samen. |
| Screenshot/log | `scratchpad/qa/live/shots/a4-review-1.png` |
| Oplossing | Voorstel: woorden met `get_text("words")` per kolom groeperen vóór het zoeken naar labels. Niet gedaan in deze PR, omdat het de tekstvolgorde voor alle documenten raakt en een bredere benchmark vraagt. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-008: Scanner leest de bedragen van een kassabonfoto verkeerd

| Veld | Inhoud |
|---|---|
| Ernst | P2 (faalt veilig: opslaan is geblokkeerd tot de bedragen kloppen) |
| Route | Bonnetjes › foto uploaden › Controleren |
| Functie | Beeld-OCR (RapidOCR 3, PP-OCRv6-small) en bedragenparser |
| Reproductiestappen | Synthetische bonfoto (`scratchpad/qa/live/bon-qa-horeca.jpg`): totaal 18,00, "BTW 9% over 16,51 1,49" |
| Verwacht | Totaal 18,00, btw 1,49, excl. 16,51 |
| Werkelijk | Totaal 1,49, btw 16,51, subtotaal 15,02. Waarschuwingen: TOTAL_ARITHMETIC_MISMATCH en VAT_MATH_MISMATCH. De leverancier en datum kloppen wel. |
| Oorzaak | Niet vastgesteld. Dezelfde tekst als digitale PDF gaat goed, op `main` en in de kandidaat. Het verschil zit dus in de OCR-uitvoer van de foto (volgorde of samenvoeging van de regels). Lokaal reproduceren is BLOCKED (RapidOCR niet installeerbaar). |
| Screenshot/log | `document_processing_jobs.result.analysis` voor `bon-qa-horeca.jpg` (QA-account A); `shots/a8-bon-bedragen.png` |
| Oplossing | Na de scannerdeploy opnieuw testen (de "over"-fix kan helpen). Anders de OCR-regels van deze bon in de V5/V6-benchmark opnemen. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-009: Terugknop van de browser verlaat de app

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | Elke pagina |
| Functie | Navigatie (geen History API) |
| Reproductiestappen | Overzicht › Facturen › browser-terugknop |
| Verwacht | Terug naar Overzicht |
| Werkelijk | De app wordt verlaten (`about:blank` of de vorige site). Na uitloggen is dat wel veilig: er is geen data zichtbaar (L-C07). |
| Oorzaak | `navigate()` zet geen `history.pushState`. |
| Screenshot/log | C-15 |
| Oplossing | Voorstel: `pushState` per pagina en een `popstate`-handler, met open venster sluiten als eerste terugstap. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-010: Escape of sluiten gooit een half ingevulde factuur weg zonder vraag

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | Factuur maken |
| Functie | `closeModal` |
| Reproductiestappen | 1. Klant kiezen en een regel invullen. 2. Escape drukken. |
| Verwacht | Vraag "Wijzigingen weggooien?" of automatisch concept |
| Werkelijk | De invoer is zonder vraag weg (C-13). |
| Oorzaak | Geen controle op wijzigingen voor het sluiten. |
| Screenshot/log | C-13 |
| Oplossing | Voorstel: vóór het sluiten vergelijken met de beginwaarden en bevestigen. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-011: Zoeken vindt een oude factuur niet zolang de periode op "Deze maand" staat

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | Inkomsten › zoeken |
| Functie | `financial-period-select` (standaard "month") filtert vóór het zoeken |
| Reproductiestappen | 1. Gebruiker B met facturen uit vorige jaren. 2. Zoek een oud factuurnummer. |
| Verwacht | De factuur wordt gevonden, of de melding noemt de periode met een knop "Zoek in alles". |
| Werkelijk | "Geen facturen gevonden" (B-21). Met "Alles" wordt hij wel gevonden (B-22). |
| Oorzaak | De zoekfunctie werkt binnen de gekozen periode en de lege melding zegt dat niet. |
| Screenshot/log | B-21 |
| Oplossing | Voorstel: bij een zoekterm in alle perioden zoeken, of de lege melding uitbreiden met de periode en een knop. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-012: Security-headers ontbreken op app.boekuna.nl

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | app.boekuna.nl (alle pagina's) |
| Functie | Hosting (Render static site) |
| Reproductiestappen | `curl -sI https://app.boekuna.nl/` |
| Verwacht | `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` of `frame-ancestors`, `Referrer-Policy` |
| Werkelijk | Alleen `x-content-type-options` |
| Oorzaak | Geen headerconfiguratie in de Render-service |
| Screenshot/log | `scratchpad/qa/findings.md` |
| Oplossing | Voorstel: headers in de Render static site instellen. Begin met HSTS, frame-ancestors en Referrer-Policy. Bouw CSP op in report-only modus, want de app laadt supabase-js van jsdelivr. |
| Status | Open |
| Hertest | n.v.t. |

### BUG-013: Oude publieke edge function `kwinest-app` (zonder JWT-controle)

| Veld | Inhoud |
|---|---|
| Ernst | P2 |
| Route | `…/functions/v1/kwinest-app` |
| Functie | Edge function (versie 5, `verify_jwt: false`) |
| Reproductiestappen | Lijst van edge functions via Supabase |
| Verwacht | Alleen functies die de app gebruikt |
| Werkelijk | Een oude kopie van de app is publiek bereikbaar zonder JWT. |
| Oorzaak | Overblijfsel van de migratie |
| Screenshot/log | `list_edge_functions` (8 okt) |
| Oplossing | Verwijderen na akkoord van Kwin (productiewijziging) |
| Status | Open |
| Hertest | n.v.t. |

### BUG-014 t/m BUG-028 (P3)

| ID | Titel | Route | Werkelijk | Voorstel | Status |
|---|---|---|---|---|---|
| BUG-014 | Overbodige edge functions | Supabase | `pulse24-bootstrap`, `pulse24-market`, `pulse24-news`, `billing-qa-harness` en `boekuna-one-time-document-cleanup` staan actief. | Opruimen na akkoord | Open |
| BUG-015 | Kosten van € 0 worden opgeslagen | Kosten | Opgeslagen met bedrag 0 (C-20) | Minimaal € 0,01 | Open |
| BUG-016 | Datum in 2206 zonder melding | Kosten | Opgeslagen op 2206-01-01 (C-24) | Waarschuwen bij meer dan een jaar vooruit | Open |
| BUG-017 | Lege Kosten-pagina heeft geen "zelf invullen" | Kosten | Alleen de bestandskiezer (A-39, L-A07) | Tweede knop "Zelf invullen" | Open |
| BUG-018 | Na opslaan van bedrijfsgegevens geen vervolgstap | Instellingen | Je blijft op de pagina; de toast valt over de knop | Terug naar de vorige taak, of de toast verplaatsen | Open |
| BUG-019 | Mobiel: "+ Regel toevoegen" staat boven de regel | Factuur, stap 2 (390 px) | De knop staat vóór de velden van de eerste regel | Onder de laatste regel plaatsen | Open |
| BUG-020 | IBAN met spaties opgeslagen | Bedrijfsgegevens | "NL91 ABNA …" | Normaliseren bij opslaan, met spaties tonen | Open |
| BUG-021 | Creditfactuur-editor heet "Conceptfactuur bewerken" en toont "Totaal te betalen" | Creditfactuur | Verwarrende teksten bij een credit | "Creditfactuur bewerken" en "Totaal te crediteren" | Open |
| BUG-022 | Dashboard rendert in 0,8 s bij 600 facturen | Overzicht | 787 ms (B-20, nog binnen de norm) | Berekeningen cachen per wijziging | Open |
| BUG-023 | Bonnummer van een kassabon niet herkend, terwijl de app een nummer eist | Bonnetjes | "Bonnr: 4471" niet gelezen; "Volgende" blijft uit tot er een nummer is (L-A53) | "Bonnr" herkennen, of nummer optioneel maken bij een kassabon | Open |
| BUG-024 | Omschrijving van een gescande factuur is de ruwe eerste regel | Kosten | "Tarwebloem 25 kg 4 18,75 9% 75,00" | Alleen de omschrijving overnemen | Open |
| BUG-025 | JS-fout "cannot add postgres_changes callbacks … after subscribe()" | Na inloggen (live) | Gezien in 2 live sessies; waarschijnlijk door de dubbele laadactie van BUG-003 | Komt mee met BUG-003 | Opgelost in PR (H-06: geen JS-fouten); live hertest na deploy |
| BUG-026 | Dubbele relatie zonder waarschuwing | Relaties | Twee keer "Head Direct BV" toegestaan | Waarschuwen bij dezelfde naam | Open |
| BUG-027 | "Btw apartzetten € -16,66" bij terug te vragen btw | Overzicht | Negatief bedrag bij "apartzetten" | Tekst "Btw terug te vragen € 16,66" | Open |
| BUG-028 | Supabase-adviseur: `pg_net` in schema public; 7 SECURITY DEFINER-functies aanroepbaar door ingelogde gebruikers | Database | WARN (geen misbruik gevonden; isolatietests PASS) | Per functie nagaan of `authenticated` execute nodig heeft | Open |

Geen bug, maar wel gezien: in deze testomgeving gaf de Realtime-websocket 500. Daardoor toonde het dashboard "Aandachtspunten niet bijgewerkt". De Supabase-logs tonen voor echte bezoekers alleen 101 (verbinding gelukt). De oorzaak is dus de proxy van de testomgeving.

---

## E. UX- en designrapport

Wat werkt:
- Rustige, consistente schermen. Eén duidelijke eerste stap op een leeg overzicht (A-01).
- Factuur maken op de telefoon in 3 stappen (M-03), met onderbalk (M-01).
- Geen horizontaal scrollen op 320, 375, 390, 430, 768, 1024 en 1440 px, over 10 pagina's en het factuurformulier (R-01).
- Duidelijke foutmeldingen bij inloggen. "E-mailadres of wachtwoord is onjuist" geldt ook voor een onbekend account, dus het verraadt niet of een account bestaat (L-R04, L-R05).
- Een onbevestigd account krijgt een knop om de bevestigingsmail opnieuw te sturen (L-R03).
- Offline toont "Niet opgeslagen" en na herstel "Opgeslagen ✓" (L-C01, L-C03).
- De scancontrole is helder: "Stap 1 van 2 · Basis", "Ik heb het origineel gecontroleerd" en "Nog 1 punt oplossen". Je kunt niet opslaan met tegenstrijdige bedragen.

Verbeterpunten, in volgorde van impact:
1. De terugknop moet binnen de app blijven (BUG-009).
2. Waarschuw voordat een half ingevulde factuur verdwijnt (BUG-010).
3. Zoeken moet buiten de gekozen periode kunnen, of de melding moet de periode noemen (BUG-011).
4. Lege Kosten-pagina: toon "Zelf invullen" naast de bestandskiezer (BUG-017).
5. Laat bij een kassabon het nummer niet verplicht zijn als het niet herkend is (BUG-023).
6. Teksten: "Btw apartzetten" bij negatief bedrag (BUG-027) en de credit-editor (BUG-021).
7. Mobiel: plaats van "+ Regel toevoegen" (BUG-019).

Toegankelijkheid (WCAG 2.2 AA, axe-core):
- Nul meldingen (ook geen moderate of minor) op 9 pagina's en 3 formulieren, desktop en mobiel, plus het inlogscherm (W-01, W-02, W-05).
- Focus gaat het venster in en Tab blijft erbinnen (W-03).
- Na sluiten keert de focus terug naar de knop (W-04).
- Niet getest: een handmatige ronde met een schermlezer (VoiceOver of NVDA).

---

## F. OCR- en financiële betrouwbaarheid

### F.1 Financiële berekeningen

| Controle | Resultaat |
|---|---|
| Btw per regel, 21% en 9%, halve centen | Kandidaat PASS (A-20 t/m A-25). Productie FAIL (BUG-001). |
| Oude definitieve facturen houden na de fix hun bedrag en btw | Kandidaat PASS (A-29b, `invoice-rounding-history`) |
| Netto + btw = bruto | PASS (A-25) |
| Factuurnummering zonder gaten of dubbelen | PASS (A-26, A-27, L-A05) |
| Betaling registreren zet de factuur op betaald, niets open | PASS (A-29, L-A06) |
| Creditfactuur verrekent | Kandidaat PASS (A-30 t/m A-34, A-58). Productie FAIL (BUG-002). |
| Btw-aangifte 1a (€ 180,00 / € 37,80), 1b (€ 12,45 / € 1,12), 1e verlegd (€ 500,00), 5b (€ 25,50), te betalen € 13,42 | PASS, onafhankelijk nagerekend in centen (A-50 t/m A-53) |
| Overzicht: omzet € 692,45, kosten € 150,00, winst € 542,45 | PASS (A-54) |
| Nog te ontvangen € 731,37 met deels gecrediteerde factuur | Kandidaat PASS (A-55) |
| Btw apartzetten gelijk aan btw-pagina; rapportage sluit aan | PASS (A-56, A-57) |
| Live: voorbelasting 5b na gescande factuur = 10,50 + 12,00 = € 22,50 | PASS (L-A42) |
| Live: kosten € 150,00 excl. = 50,00 + 100,00; winst € −115,05 | PASS (L-A09, L-A11) |
| Live: bankimport, bij € 40,79, af € 78,50, saldo € −37,71 | PASS (L-A61) |

Conclusie: de rekenlogica is na PR #276 juist in alle geteste gevallen. Op productie zijn tot de deploy twee P1-fouten actief: afronding en creditfacturen.

### F.2 Scanner (OCR)

| Document | Leverancier | Nummer | Datum | Totaal en btw | Btw-regels | Betaalstatus | App laat opslaan zonder controle? |
|---|---|---|---|---|---|---|---|
| Digitale PDF met gemengde btw (live) | Goed | Goed | Mist (BUG-007) | Goed (112,00 / 12,00) | Leeg (BUG-005) | Fout: "paid" (BUG-006) | Nee: controle verplicht, opslaan pas als de verdeling klopt |
| Dezelfde PDF (kandidaat-scanner, lokaal) | Goed | Goed | Mist | Goed | Goed: 9% en 21% | Goed: open, 62,00 | n.v.t. |
| Kassabonfoto (live) | Goed | Mist (BUG-023) | Goed | Fout: 1,49 / 16,51 (BUG-008) | Fout | Open (PIN niet gezien) | Nee: "De bedragen kloppen nog niet met elkaar" |

Synthetische bench vóór en na de scannerfix:
- btw-regels 6/7 → 7/7
- regeltarieven 6/7 → 7/7
- betaalstatus 0/1 → 1/1
- factuurnummer 6/7 (gelijk)
- bestaande scanbenchmark gelijk (0,333; beeldpad BLOCKED)

Verwerkingstijd live:
- PDF: ongeveer 67 s van uploaden tot "Controle nodig".
- Foto: 86 s (OCR zelf 21,6 s; de rest is wachtrij en opstarten).

Betrouwbaarheid: de scanner faalt veilig. In alle geteste foutgevallen bleef het document in "Controle nodig" en kon niets met verkeerde bedragen in de boekhouding komen. De kwaliteit van foto-OCR is wel onvoldoende voor "automatisch" verwerken. Zie J.

---

## G. Security en privacy

| Controle | Resultaat | Bewijs |
|---|---|---|
| RLS op alle 30 publieke tabellen | PASS | Supabase-tabellenlijst; alleen `early_access_campaign` is leesbaar voor anon (bedoeld) |
| Live tenant-isolatie met 2 accounts (REST, opslag, edge functions, RPC) | PASS 28/28 | `scratchpad/qa/live/isolation.json` (S-01 t/m S-70). Positieve controle: A kan het eigen bestand downloaden (200, `%PDF`). B krijgt 404, 403, 401 of 0 rijen. |
| Opslagbuckets privé (behalve `kwinest-site`) | PASS | S-50 t/m S-53 |
| Inlogfout verraadt geen bestaand account | PASS | L-R04, L-R05 |
| Uitloggen wist de lokale administratie; herladen logt niet vanzelf in | PASS | L-C05, L-C08 |
| Geen live geheime sleutels in de repo | PASS | `git grep` op `sk_live_`, `rk_live_` en `sb_secret_`: geen treffers |
| Account verwijderen | FAIL op productie (BUG-004); opgelost in kandidaat | |
| Security-headers | FAIL (BUG-012) | |
| Oude en overbodige edge functions | FAIL (BUG-013, BUG-014) | |
| Supabase-adviseur | 2 WARN (BUG-028), 16 INFO (RLS zonder policy = alles dicht) | |
| Pentest of loadtest | NOT TESTED (bewust: verboden tegen productie) | |

Privacy van de test:
- Twee QA-accounts met Kwins plus-adres.
- Alleen synthetische gegevens.
- Geen mail naar klanten (het "versturen" werd gemarkeerd zonder te mailen; de PDF is alleen gedownload).
- Geen betalingen.

De accounts worden verwijderd via "Account verwijderen" zodra de fix voor BUG-004 live staat. Zo dient die verwijdering ook als hertest. Tot die tijd hebben ze tijdelijke ZZP-toegang.

---

## H. Performance

| Meting | Waarde | Omgeving |
|---|---|---|
| Inloggen tot app zichtbaar | 4,5 tot 5,8 s | Live, vanuit een cloudcontainer (incl. supabase-js van jsdelivr) |
| Paginawissel met 600 facturen, 900 kosten en 150 relaties | dashboard 787 ms, facturen 20 ms, kosten 28 ms, relaties 83 ms, btw 38 ms, rapportages 73 ms | Kandidaat, Chromium lokaal (B-20) |
| Scan PDF tot "Controle nodig" | ongeveer 67 s | Live |
| Scan foto tot "Controle nodig" | 86 s (OCR 21,6 s) | Live |
| Grootte van de app (`index.html`) | 918 kB, één bestand | Live |
| Onverwachte netwerkfouten (4xx/5xx) tijdens de live tests | 0, behalve de preflight van `delete-account` (BUG-004) en de Realtime-websocket (proxy van de testomgeving) | Live |

Er zijn geen loadtests gedaan, want dat is verboden tegen productie. Advies: maak het dashboard sneller bij grote administraties (BUG-022), en kijk of de wachtrijtijd van de scanner (ongeveer 45 tot 65 s buiten de OCR zelf) korter kan.

---

## I. Uitgevoerde fixes

| Fix | Bestanden | Testbewijs | Status |
|---|---|---|---|
| Btw en regelbedragen: halve centen naar boven (BUG-001) | `kwinest/index.html`, `supabase/functions/send-invoice/index.ts`, `tests/production-integrity.test.mjs` | Vóór: A-20/22/24/28 FAIL op `main`. Na: PASS. Plus afrondingsgevallen in `production-integrity`. | In PR #276 (`a7b0e45`) |
| Creditfactuur verrekent (BUG-002) | `kwinest/index.html`, `tests/production-integrity.test.mjs`, `tests/production-code.mjs`, `tests/bank-import-reliability.test.mjs` | Vóór: A-30 t/m A-33, A-55 en A-58 FAIL. Na: PASS. Plus 8 creditgevallen. | In PR #276 (`52fc100`) |
| Scanner: "over", btw-cel en deels betaald (BUG-005, BUG-006) | `kwinest/docprocessor/app.py`, `document_intelligence.py`, `tests/document-vat-summary-rows.test.py`, workflow document-integrity | 3 nieuwe tests PASS; bench 6/7 → 7/7 | In PR #276 (`68d4e67`) |
| Release-audit browsertest | `tests/release-audit-browser.test.mjs` | 63 controles; `main` 44/63, kandidaat 57/63 | In PR #276 (`d91b90d`, `55d3b80`) |
| Inloggen laadt de administratie één keer (BUG-003, BUG-025) | `kwinest/index.html`, `tests/auth-signed-in-once.test.mjs`, workflow app | Test faalt vóór de fix; H-01 t/m H-06 PASS tegen de live backend | In PR #276 (`a4cbf99`) |
| Account verwijderen: CORS (BUG-004) | `supabase/functions/delete-account/index.ts`, `tests/delete-account-cors.test.mjs`, workflow backend | Test faalt vóór de fix (405); na de fix PASS, inclusief volledige verwijdering in het harnas | In PR #276 (`55d3b80`) |
| Oude definitieve facturen houden hun afronding (BUG-001, impact) | `kwinest/index.html`, `supabase/functions/send-invoice/index.ts`, `tests/invoice-rounding-history.test.mjs`, `tests/production-code.mjs`, workflow app | Test faalt zonder de vergrendeling (€ 40,80 en € 0,01 open), slaagt erna. Alle 84 testbestanden uit de CI-workflows opnieuw, met het CI-profiel: 83 PASS; `product-ui-reference` Chromium PASS, WebKit BLOCKED (niet in de container). Audit-browsertest 57/63, dezelfde 6 open punten. | In PR #276 (`b7a990f`) |
| Pixeltest desktop robuuster (CI-fout "app") | `tests/mobile-desktop-freeze.test.mjs` | Faalde in CI op bank-1920 (25 en 37 pixels, 1 kleurniveau verschil) en lokaal ook op `main` zonder deze PR. Grens van 12 naar 64 pixels; een verschil groter dan 1 niveau faalt nog steeds. Daarna 3× PASS (main en kandidaat). | In PR #276 (`85654b2`) |

Uitrol na merge, alleen met akkoord van Kwin per stap:
1. App: Render › boekuna-split-app-preview › Manual Deploy.
2. Direct daarna de edge functions `send-invoice` en `delete-account` deployen. Volgorde app eerst: dan krijgen oude facturen meteen hun kenmerk. Tot `send-invoice` live staat, kan een PDF van een nieuwe factuur met een halve cent nog € 0,01 afwijken.
3. Branch `kwinest-hosting` gelijkzetten met `main` en daarna kwinest-docprocessor deployen.

PR: https://github.com/kwinstudio/boekuna/pull/276

---

## J. Resterende werkzaamheden

### Vóór livegang (voorwaarden voor GO)

| Werk | Reden | Impact | Afhankelijkheden |
|---|---|---|---|
| PR #276 mergen en de app deployen | BUG-001, BUG-002 en BUG-003 staan live | Financiële fouten en dataverlies bij elke gebruiker | Kwins "merge" en de Render-deploy |
| `send-invoice` en `delete-account` deployen | De PDF-afronding (BUG-001) en Account verwijderen (BUG-004) | Verkeerde PDF-bedragen; AVG-verwijdering werkt niet | Kwins go per functie |
| Hertest op productie na deploy | Bevestigen dat de fixes live werken | 22,50 × 21% = 4,73 op een nieuwe factuur; de oude QA-factuur van € 40,79 blijft € 40,79 zonder open bedrag; tabbladwissel houdt invoer; beide QA-accounts verwijderen via de app | QA-accounts (nog aanwezig) |
| Stripe-testmodusronde: kiezen, betalen, portal, opzeggen | Niet testbaar in deze sessie (BLOCKED) | Abonnementen zijn de inkomsten | Stripe-testsleutel in een nieuwe sessie; prijzen in testmodus |
| iPhone/Safari-rooktest (inloggen, factuur, foto uploaden) | WebKit BLOCKED in de container | Veel ZZP'ers werken op een iPhone | Echte iPhone of BrowserStack |

### Sterk aanbevolen

| Werk | Reden | Impact | Afhankelijkheden |
|---|---|---|---|
| Scanner deployen (`kwinest-hosting` gelijkzetten) en foto-OCR hertesten | BUG-005, BUG-006, BUG-008 | Minder handwerk; juiste betaalstatus | Kwins deploy |
| Terugknop in de app (BUG-009) | Gebruikers verlaten de app per ongeluk | Frustratie, kans op dubbel werk | Geen |
| Waarschuwing bij weggooien van een factuur (BUG-010) | Invoer verdwijnt | Frustratie | Geen |
| Zoeken over alle perioden (BUG-011) | Oude facturen "onvindbaar" | Kans op dubbele facturen | Geen |
| Security-headers (BUG-012) | Basisbeveiliging | Clickjacking, minder bescherming tegen XSS | Render-instellingen |
| `kwinest-app` en overbodige functies verwijderen (BUG-013, BUG-014) | Kleiner aanvalsoppervlak | Laag risico, kleine moeite | Kwins akkoord |
| Datum bij twee kolommen (BUG-007) | Handwerk bij veel facturen | Tijd | Bredere scannerbenchmark |

### Na livegang

| Werk | Reden | Impact | Afhankelijkheden |
|---|---|---|---|
| P3-lijst (BUG-015 t/m BUG-028) | Kwaliteit en duidelijkheid | Klein per punt | Geen |
| MT940/CAMT.053 in de app (NOT IMPLEMENTED) | De server kan het al | Gemak voor gebruiker B | UI-werk |
| Schermlezertest, Firefox, Android | Niet getest | Toegankelijkheid en bereik | Apparaten |
| Snellere scannerwachtrij en dashboard | 67 tot 86 s; 0,8 s | Gevoel van snelheid | Render Workflow (V6-staging) |

---

## K. Releaseadvies

**CONDITIONAL GO**, voor commit `85654b2` (PR #276), onder de vijf voorwaarden "Vóór livegang" in J.

Onderbouwing:
- Kritieke flows (registreren, inloggen, factuur maken, betalen, btw, uitloggen) werken in de kandidaat. De eindacceptatie is doorlopen (C.1).
- Financiële berekeningen kloppen in de kandidaat. De twee P1-fouten op productie zijn opgelost en getest. Oude definitieve facturen veranderen niet van bedrag.
- Geen tenant-lek: live 28/28.
- Geen ongecontroleerd dataverlies in de kandidaat (BUG-003 opgelost en tegen de live backend gecontroleerd).
- Geen open P0 of P1 in de kandidaat.
- **Geen GO**, omdat belangrijke criteria niet getest zijn: Stripe in testmodus en Safari/WebKit. Ook staan de fixes nog niet in productie.
- De huidige productie (`366ff22`) zou zonder deze PR **NO-GO** krijgen: er zijn open P1's voor dataverlies, btw-afronding, creditfacturen en account verwijderen.

---

## Reviews

**Onderzoeker.**
- De dekking is breed: 140 nieuwe controles plus 116 bestaande testbestanden, live met twee accounts.
- Elke P1 is eerst live of op `main` nagespeeld, daarna opgelost met een test die vóór de fix faalt.
- Zwak punt: OCR van foto's is alleen live getest met één synthetische bon, omdat de OCR-motor lokaal niet te installeren was. De conclusie over foto-OCR (BUG-008) rust dus op één document.

**Scepticus.**
- De dataverlies-fix is getest met een nep-Supabase en met één live account, niet met meerdere apparaten tegelijk. Een versieconflict tussen twee apparaten valt buiten deze fix; de bestaande conflictafhandeling (back-up plus serverstaat) is niet opnieuw getest.
- De eerste versie van de afrondingsfix (`a7b0e45`) zou oude definitieve facturen met een halve cent stil € 0,01 laten veranderen, omdat de app bedragen telkens opnieuw uit de regels berekent. Dat is in `b7a990f` afgedicht met een kenmerk per factuur en een test die zonder die vergrendeling faalt. Restrisico: een tabblad met de oude app dat nog openstaat tijdens de update, kan in die minuten een definitieve factuur zonder kenmerk maken. Die rekent daarna nieuw; het verschil is hooguit € 0,01 en alleen bij een halve cent.

**Factchecker.**
- Elk getal in dit rapport komt uit een testuitvoer, een log of een SQL-resultaat (bronnen staan bij de bug of in `scratchpad/qa`).
- De commit op productie is afgelezen uit `BOEKUNA_BUILD` in de live HTML (`366ff22ba221`).
- De Realtime-fout is als omgevingsprobleem aangemerkt op basis van de Supabase-logs (alleen 101-antwoorden). De uitleg bij BUG-025 is een afleiding, geen bewezen oorzaak.

**Tegenstander.**
- "CONDITIONAL GO" is te mild als Kwin de voorwaarden overslaat. Daarom staat er expliciet dat productie vandaag NO-GO is.
- Account verwijderen werkte op productie niet. Volgens de code krijgt een gebruiker dan de melding "Account kon niet worden verwijderd. Er is niets verwijderd." (afgeleid: in de test was de melding na 20 s al weg). Het is de moeite waard om in de support-mailbox na te gaan of er verwijderverzoeken zijn blijven liggen.

**Hoofdrechter.** De bevindingen zijn reproduceerbaar en de fixes zijn klein en getest. De open punten zijn eerlijk benoemd. Het oordeel CONDITIONAL GO voor de kandidaat en NO-GO voor de huidige productie volgt uit de regels van de opdracht. Geen verdere opmerkingen.

---

```
BOEKUNA — RELEASE READINESS
Algemene status: Kandidaat klaar onder voorwaarden; productie (366ff22) heeft 4 open P1's tot de deploy
Geteste commit: 85654b2 (PR #276; app-code gelijk aan b7a990f)
Aantal uitgevoerde tests: 257
Aantal geslaagde tests: 228
Aantal gefaalde tests: 17
Aantal geblokkeerde tests: 21 (12 suite-tests door omgeving + 9 testcases: Stripe-testmodus 4, WebKit/Firefox/echt toestel 3, e-maillink 1, lokale beeld-OCR 1)
Aantal open P0: 0
Aantal open P1: 0 in de kandidaat (4 opgelost in PR #276, nog niet live)
Aantal open P2: 7 (BUG-007 t/m BUG-013); 2 opgelost in PR #276
Aantal open P3: 14
Belangrijkste risico: tot de deploy verliezen gebruikers live invoer na inloggen en bij een tabbladwissel, en rekent productie soms 1 cent te weinig btw
Resterende releaseblockers: PR #276 mergen en deployen (app, send-invoice, delete-account), hertest op productie, Stripe-testmodusronde, iPhone/Safari-rooktest
Definitief advies: CONDITIONAL GO
Rapportlocatie: docs/qa/BOEKUNA-APP-E2E-RELEASE-AUDIT.md (kopie: /mnt/project-files/qa/BOEKUNA-APP-E2E-RELEASE-AUDIT.md)
PR-link: https://github.com/kwinstudio/boekuna/pull/276
```
