# BOEKUNA — OCR- en leverancierslogo-herstel (10 oktober 2026)

Status: **wacht op akkoord voor merge; geen uitrol** (PR #306, branch `fix/ocr-amount-layout-logo-20261010`). Onafhankelijke code-review uitgevoerd en verwerkt (§6). Niets is uitgerold; productie draait nog Render-deploy `ef257b0e`. Dit rapport bevat alleen lokaal en in CI gemeten cijfers; "live" of "100 % accuraat" wordt nergens geclaimd.

Uitgangspunt: de onafhankelijke audit van 10 oktober (`BOEKUNA_OCR_ONDERZOEK_2026-10-10.md`) en de QA-branch `test/ocr-logo-realistic-regression-20261010`. Beide zijn gebaseerd op de Render-SHA `ef257b0e`. De processorcode op `main` (`3deb7ec`) is byte-identiek aan die SHA voor `kwinest/docprocessor/`, dus de audit beschrijft de huidige code.

## 1. Root causes

| # | Oorzaak | Impact | Bewijs (gereproduceerd) | Code | Ernst |
|---|---|---|---|---|---|
| R1 | OCR-tekst werd vak-voor-vak samengesteld in detectorvolgorde. Een rechts uitgelijnd bedrag begint enkele pixels boven zijn label en kwam als losse regel **vóór** het label. | Elk label werd aan de verkeerde buur gekoppeld; HEMA 9,50/1,99/11,49 werd 1,99/0,42/2,41 met confidence 0,88, geen conflict, geen waarschuwing. | Lokale run op bevroren `main`: 7/20 golden-cases correct, identiek aan GitHub-run 38058431229. Diagnose: `labeled net=(1.99, 0.98)`, `labeled total=None`, `strong total=None`, `blocks primary=None`, derivation anchor=subtotal. | `run_best_ocr`, `targeted_financial_ocr`, `targeted_header_ocr` | P0 |
| R2 | `labeled_amount` las bij een label zonder bedrag altijd de volgende regel. | Btw-bedrag als netto. | idem | `labeled_amount` | P0 |
| R3 | `strong_total_anchor` verwierp `TOTAAL INCL. BTW` omdat er "btw" in staat. | Geen brutoanker, dus geen conflict met het verkeerde netto. | idem | `strong_total_anchor` | P0 |
| R4 | Ontdubbeling van financiële herscan + volledige tekst verwijderde herhaalde kale bedragen (11,49 staat onder Totaal én onder Betaald). | Adjacency label↔bedrag brak; totaal onvindbaar. | idem (`financialText` ontdubbeld tot één 11,49) | `heuristic_extract` | P1 |
| R5 | Een totaal dat uit één netto-lezing werd afgeleid kreeg confidence ≈0,87 (> reviewdrempel 85 voor totaal in de Edge Function) zonder waarschuwing. | "Rekenkundig consistent" maar fout, en niet als totaal-probleem gevlagd. | audit-job HEMA: `amountDerivation.anchorField=subtotal`, `derivedFields=[vatTotal,total]` | `heuristic_extract` | P0 |
| R6 | Een kapot gelezen bedrag op de labelregel (`86'9`) liet `financial_blocks` het bedrag van de volgende rij lenen en het blok "verifiëren". | Kruidvat: netto 1,46 / btw 6,98 (gewisseld), wel gevlagd via conflicten. | Lokale reproductie met detectie max/1000 (19/20 vóór fix) | `financial_blocks._amount_on_or_after` | P1 |
| R7 | Demo-/disclaimerregels (fictieve plaatsnaam, waarschuwing) konden leverancier worden. | Verkeerde leverancier op oude demo-bonnen. | Audit (de oude demo-bestanden zijn niet beschikbaar; niet opnieuw reproduceerbaar) | `receipt_merchant_name`, `layout_legal_entity_name` | P1 |
| R8 | RapidOCR's detectie-voorbewerking (`Det.limit_type=min`, 736) schaalt élk beeld op tot 736 px korte zijde. Een smalle lange-bon-pass van 213×1000 wordt 736×3455; zelfs de warm-up van 300×120 groeit. | Piek-RSS 533 MB bij een gewone bon, 747 MB bij een lange bon, 925 MB over de 28-case run — met een Render-limiet van 512 MiB. | Metingen in §4 (vers proces per document) | engineconfig `get_ocr_engine` | P0 |
| R9 | Oriëntatie-retry koos voor een wazige scan een 270°-variant met verticale tekstvakken. | Pre-existent; met regel-samenvoeging zou alles één regel worden. | party-roles case 13 (zie §3) | `_ocr_orientation_score` | P1 |

Niet gevonden: geen aanwijzing dat verkeerde bedragen **zonder** menselijke bevestiging zijn geboekt. `resolve` wordt alleen aangeroepen vanuit de twee opslagpaden in de app (`savePdfInvoiceImport`, "bewaren zonder boeking"); de HEMA-job stond op `FULL_REVIEW` en is door een gebruiker afgerond. Het probleem was dat het controlescherm verkeerde, zelfverzekerde bedragen voorzette.

## 2. Commits, branch, PR, runs

- Branch `fix/ocr-amount-layout-logo-20261010` (vanaf `main` `3deb7ec`), PR #306.
- Commits: `13491e8` (lay-out-koppeling + parserdefensies + tests), `2f69f54` (golden-gate, diagnose, icon-bewijs, workflow), `326054c` (kapot bedrag op labelregel), `31fb81b` (leverancierswebsite als logobewijs), `6565615` (detectie-instelling in `/health`).
- Reproduceerbare failing tests (rood op `main`, groen op de branch): `tests/document-ocr-layout-amounts.test.py` (exact, zonder OCR-engine) en `tests/ocr-golden-logo-receipts.py` (7/20 op `main`, 20/20 op de branch).
- Nieuwe workflow: `.github/workflows/boekuna-ocr-golden-receipts.yml` — draait de gate, de bestaande 28-case V5-benchmark, V5-regressies en party-roles in twee detectievarianten.
- Audit-runs waarop dit bouwt: 38058431229 (7/20), 38058779027 (kandidaatdiagnose), 38058633910 (28/28, party-roles), 38058693049 (icon-URL's).

## 3. Wijzigingen en waarom bestaande flows intact blijven

Processor (`kwinest/docprocessor/app.py`, `financial_blocks.py`):

1. `ocr_rows_to_lines`: regels per basislijn (vakken die ≥50 % verticaal overlappen vormen één regel, links→rechts), zoals het PDF-woordpad `horizontal_page_text` al deed. Guards: verticale vakken (gedraaide tekst), vakken > 2,2× de mediane regelhoogte en horizontaal overlappende vakken blijven aparte regels; een regel groeit nooit (geen kettingvorming). Alleen de tekstopbouw verandert; `rows` met posities blijven ongewijzigd voor partij-/lay-outlogica.
2. `labeled_amount` / `strong_total_anchor`: bij een label zonder bedrag telt een kaal bedrag erboven als de regel eronder er geen is; twee kale buren = dubbelzinnig → score ≤ 0,80 (onder de ankerdrempel 0,94, kan nooit stil doorrekenen). `TOTAAL INCL. BTW` is een brutoanker; alleen echte btw-regels worden uitgesloten.
3. Kale bedragen worden niet meer ontdubbeld (structuur, geen duplicaat).
4. `financial_blocks._amount_on_or_after`: twee kale buren → geen bedrag; cijfers zonder leesbaar bedrag op de labelregel → onleesbaar, geen buurregel.
5. Afgeleid totaal uit een netto-/btw-anker: confidence ≤ 0,84 en waarschuwing "Het totaal is niet op het document gelezen …" → altijd controle (Edge Function vlagt `gross` bij < 85 en `document` bij waarschuwingen).
6. Disclaimerfilter (`demo`, `fictief`, `voorbeeld`, `specimen`, `geen echt`, …) voor merchant- en legal-entity-kandidaten.
7. Oriëntatiescore: verticale vakken tellen negatief (−10 × aandeel).
8. `supplier.website` / `customer.website`: gedrukt webadres uit het partijblok als bewijs (e-mail, IBAN/KvK/btw-regels en bestandsnamen uitgesloten).
9. Detectie-voorbewerking instelbaar via `OCR_DET_LIMIT_TYPE` / `OCR_DET_LIMIT_SIDE`; **standaard = bibliotheekgedrag (min/736)**, dus geen productiewijziging zonder akkoord. Gedraaide herhaalpassen gaan altijd op werkformaat (≤ 1000 px). Instelling zichtbaar in `/health`.

Niet aangeraakt: boekhoud-, btw-, auth-, RLS-, billing- en quota-logica; de Edge Function; de controleflow (bevestigen blijft verplicht; `resolve` blijft gebruikersactie).

App (`kwinest/index.html`, `document-review-v2.js`):

10. Bij opslaan van de controle gaat het gedrukte webadres alleen mee naar de relatie als het aannemelijk bij de leveranciersnaam hoort (`partyWebsiteSuggestion`: naamwoord ≥ 4 tekens of initialen in de host; nooit gratis-maildomein). Anders blijft het veld leeg (in de legacy-controle zichtbaar als veld, in de v2-controle verborgen); de gebruiker kan het zelf invullen. Herkomst `websiteSource='document'` en `websiteSeenAt` worden bewaard.
11. `contactByName` negeert rechtsvormen/leestekens, maar twee verschillende relaties met dezelfde naam geven géén match (en dus geen logo).
12. Ongewijzigd: logo alleen van de eigen site van de relatie (apple-touch-icon / favicon), initialen als fallback, `referrerpolicy=no-referrer`, negatieve cache 7 dagen / positieve 30 dagen, geen logodienst, geen Brandfetch, geen logoherkenning uit pixels. Er is geen server-side fetch, dus geen SSRF-oppervlak; een redirect naar een derde host kan de browser bij `<img>` niet blokkeren (alleen de referrer wordt onderdrukt) — dit is een bewuste, gedocumenteerde grens.

## 4. Voor/na

### 4.1 Golden-set (10 logo-bonnen × JPG/raster-PDF = 20 analyses; synthetisch, niet de ZIP-binaries)

| Meting | `main` (= ef257b0e) | Branch, detectie min/736 (standaard) | Branch, detectie max/1000 |
|---|---|---|---|
| Volledig correct | 7/20 | **20/20** | **20/20** |
| Leverancier / datum / btw-tarief | 20/20 / 20/20 / 20/20 | 20/20 / 20/20 / 20/20 | 20/20 / 20/20 / 20/20 |
| Netto / btw / totaal | 9 / 7 / 10 | 20 / 20 / 20 | 20 / 20 / 20 |
| Piek-RSS hele run (20 docs, sequentieel) | 531 MB | 531 MB | **431 MB** |
| Mediaan ms per document (lokaal, 2 threads, onder CPU-deling) | ≈ 5,0 s | ≈ 4,8 s | ≈ 3,4 s |
| Piek-RSS 28-case V5-run in één proces | 925 MB | 921 MB | **550 MB** |

Per document (branch): alle 20 PASS op alle velden; route blijft `FULL_REVIEW` (bevestiging verplicht), zoals in de audit.

### 4.2 Bestaande suites

| Suite | `main` | Branch min/736 | Branch max/1000 |
|---|---|---|---|
| V5-benchmark 28 cases | 28/28 (p95-gate faalt lokaal: 10,1 s > 6 s door CPU-deling; in CI 38058633910 groen) | **28/28** (p95 lokaal 9,9 s, zelfde oorzaak) | **27/28**: `receipt-long` datum MISSING → controle, bedragen correct |
| V5-regressies | PASS | PASS | PASS |
| Party-roles met bedrijfscontext | 438 C / 2 N / 6 M / 0 W | 438 / 2 / 6 / **0** (identiek) | 438 / 2 / 6 / **0** (identiek) |
| Party-roles zonder context | 436 C / 2 N / 6 M / 2 W | 436 / 2 / 6 / 2 (identiek) | 436 / 2 / 6 / 2 (identiek) |
| Processor-pytests uit backend-/integrity-/v6-/edge-workflows (18 bestanden) | — | alle PASS lokaal | — |
| `financial-blocks`, `receipt-math` | PASS | PASS | PASS |
| Nieuw: `document-ocr-layout-amounts` | **faalt** (R1–R7) | PASS | PASS |

Tussentijds werd één regressie gevonden en verholpen: party-roles case 13 ("slecht gescande bon") verloor de leverancier omdat de oriëntatie-retry (R9) een 270°-variant met verticale vakken koos en de eerste versie van de regel-samenvoeging die tot één regel maakte. Guards (verticaal/te hoog/overlap, geen kettingvorming) en de oriëntatiestraf herstellen dat; de twee pre-existente MISSING-bedragen van die case blijven MISSING (wazige scan, bedragen onleesbaar).

### 4.3 Geheugen (vers proces per document, `ru_maxrss`, Python 3.13, onnxruntime 1.30, rapidocr 3.9.2)

Fixtures worden buiten het gemeten proces opgebouwd; de piek is dus alleen decodering + OCR.

| Document | Piek min/736 (huidig gedrag) | Piek max/1000 |
|---|---|---|
| Gewone bon JPG (1050×1640) | 533 MB | **414 MB** |
| Zelfde als raster-PDF | 537 MB | **413 MB** |
| HEIC (fixture `scan-invoice.heic`, 1190×1684 — géén 12 MP-telefoonfoto) | 534 MB | **427 MB** |
| 12 MP-JPEG (3570×5576), vóór begrensde decodering | 534 MB | 523 MB |
| 12 MP-JPEG (3570×5576), mét begrensde decodering (`draft`, deze PR) | 534 MB | **415 MB** |
| Lange bon (1050×4920) | **708 MB** | **404 MB** |
| 40 MP-foto | geweigerd (`DOCUMENT_TOO_LARGE`, bestaande limiet) | idem |

Oorzaak van de piek bij de huidige instelling: de detectie-voorbewerking schaalt naar 736 px korte zijde, dus de eerste inferentie (zelfs de warm-up) kost ≈ 240 MB extra; de beeldgrootte doet er daarna nauwelijks toe. Met `max/1000` blijft de detector op werkformaat. Een 12 MP-JPEG kostte daarnaast ≈ 110 MB aan volledige decodering; die wordt nu via DCT-schaling op minimaal 2× het werkformaat gedecodeerd. HEIC kent zo'n schaalbare decodering niet: een echte 12 MP-HEIC (4032×3024) kost naar schatting +36 MB per RGB-kopie en is hier **niet** gemeten.

Gelijktijdigheid: `/analyze` is `async def` met een **synchrone** `analyze_document`, dus binnen één uvicorn-proces worden aanvragen serieel afgehandeld (geen overlap, wel wachtrij). De Edge Function houdt `PROCESSING_CONCURRENCY=1` per gebruiker. De pieken hierboven zijn dus de realistische per-instantie pieken; de 20-jobs-run (§4.1) is de representatieve "20 uploads achter elkaar". Het Render-startcommando staat niet in de repo; aanname: één worker.

### 4.4 Logo-keten (browsertest, Chromium)

| Geval | Identiteit uit document | Domein geaccepteerd | Icon geladen | Getoond | Externe requests |
|---|---|---|---|---|---|
| HEMA, gedrukt `www.hema-logo.test` | ja (naam past) | ja, bron `document` | ja (gemockt) | logo | alleen `hema-logo.test` |
| Bakker Jansen, gedrukt platformdomein | ja | **nee** (naam past niet) | — | initialen | geen |
| Studio Noord, `studio@gmail.com` | — | nee (gratis mail) | — | initialen | geen |
| Gamma ×2 (twee relaties, twee sites) | — | dubbelzinnig → geen match | — | initialen/categorie | geen |
| Praxis, site zonder icoon | — | ja (bestaand) | nee (3× 404) | initialen | ≤ 3, daarna negatieve cache (ook na herladen) |

Icon-bereikbaarheid van echte domeinen (CI-job `logo-url-evidence`, informatief): dit zegt niets over merkidentiteit en is geen gate. Visuele logo-correctheid is niet automatisch te bewijzen; de keten toont alleen iconen van de eigen site van de relatie.

### 4.5 Resultaten die nog worden ingevuld

- V5-benchmark, V5-regressies en party-roles op de branch in beide detectievarianten (lokaal en CI-run van PR #306).
- Pytest-suites uit de backend-/integrity-workflows (lokaal).

## 5. Risico's, blinde vlekken, kosten, rollback, advies

Risico's en blinde vlekken
- De golden-set is synthetisch (DejaVu-font, witte achtergrond). De tien originele ZIP-bonnen zijn **niet** getest; zodra die bytes veilig beschikbaar zijn, moeten ze door dezelfde test. 100 % op echte bonnen is niet te garanderen.
- Regel-samenvoeging kan bij extreem scheve foto's regels splitsen of (bij kolomlay-outs) samenvoegen; partijlogica gebruikt posities en is daarvan onafhankelijk, bedragen hebben de buurregel-defensies. De V5-set bevat skew/perspective/rotation-cases.
- De oriëntatiestraf verandert de keuze van gedraaide varianten alleen als die verticale vakken opleveren.
- Detectie `max/1000` is een **accuraatheidsrisico voor klein tekst** op foto's met lage resolutie; daarom standaard uit, met twee CI-varianten als bewijs.
- Party-roles: de bestaande 6 MISSING en 2 WRONG (zonder bedrijfscontext) blijven bestaan en staan buiten deze PR; elke nieuwe WRONG is een blocker.
- Logo: een document kan een platformdomein afdrukken dat toevallig op de naam lijkt; de gebruiker ziet het veld en kan corrigeren. Pixel-logoherkenning is niet gebouwd en wordt ook niet gesuggereerd.

Kosten
- Zonder planwijziging: met `OCR_DET_LIMIT_TYPE=max` en `OCR_DET_LIMIT_SIDE=1000` blijft de gemeten piek 404–431 MB onder 512 MiB (marge ≈ 80 MB). Niet gedekt: glibc-fragmentatie over lange tijd, 12 MP-HEIC-decodering (niet gemeten) en de bekende 27/28 op de lange V5-bon (datum naar controle).
- Met de huidige detectie-instelling is 512 MiB aantoonbaar te krap (542–747 MB). Een Render-plan met 1 GiB (bijv. "Standard", indicatief ≈ $25/maand tegenover ≈ $7 voor "Starter"; exacte prijs in het Render-dashboard) lost dit op zonder accuraatheidsrisico. **Geen planwijziging zonder akkoord.**

Rollback
- Code: revert van PR #306 (één squash-commit) herstelt de huidige parser volledig; er zijn geen migraties, geen schema- of RLS-wijzigingen, geen Edge-Function-wijzigingen.
- Instelling: `OCR_DET_LIMIT_TYPE`/`OCR_DET_LIMIT_SIDE` verwijderen = bibliotheekgedrag.
- Render: "Deploys → Rollback" naar de huidige deploy `ef257b0e` (runbook `docs/production-recovery.md`).

Advies
- Code: **GO voor merge na review**: de gate (20/20 + 28/28 + regressies + party-roles zonder nieuwe WRONG) is lokaal gehaald en wordt in CI bevestigd.
- Uitrol: pas na expliciet akkoord. Twee opties:
  (a) **1 GiB-plan met de standaardinstelling** — geen enkel accuraatheidsverlies (28/28, 20/20), piek ≤ 708 MB gemeten; kost een planwijziging.
  (b) **512 MiB met `OCR_DET_LIMIT_TYPE=max`/`OCR_DET_LIMIT_SIDE=1000`** — piek 404–431 MB, maar één bekende datum-miss op een lange bon (gaat naar controle, geen fout bedrag) en 12 MP-HEIC ongemeten.
  Advies: (a) als de kosten acceptabel zijn; anders (b) met de /health-controle van de instelling na uitrol en een geheugenalert op Render.
- Brandfetch of andere logodiensten: **niet** geactiveerd, conform afspraak.

## 6. Onafhankelijke code-review (uitgevoerd op de branch, bevindingen verwerkt)

Een onafhankelijke reviewer (senior Python/OCR + financiële QA, aparte sessie, read-only op de branch) beoordeelde de diff tegen `main` en reproduceerde eigen probes op beide bomen. Verdict vóór verwerking: *not ready* (3 majors). Alle punten zijn verwerkt in commit `48b60f2`; de probes zijn als tests toegevoegd (`tests/document-ocr-layout-amounts.test.py`, onderdeel "review probes").

| # | Bevinding | Verwerking |
|---|---|---|
| Major 1 | Eén kaal bedrag boven een label zonder bedrag werd een zelfverzekerd totaal (taxi-PDF met vetgedrukt, ongelezen totaal → 12,00 op 0,96, geen controle). | Alleen een bekende kolomlay-out ("voor") of een labelregel zonder bedrag direct eronder maakt het bewijs; anders score ≤ 0,80 (onder ankerdrempel 0,94 en reviewdrempels), nooit een brutoanker. Test toegevoegd. |
| Major 2 | De lay-outconventie sloeg op native PDF's om naar "voor" door één "Betaald via iDEAL"-regel. | Conventie alleen voor OCR-tekst (native tekst = "na"); betaalstatusregels stemmen niet; oordeel vereist ≥ 2 stemmen en meerderheid. Webshop-probe als test. |
| Major 3 | Disclaimer- en straatfilter te breed: "Demo Media B.V.", "Sample Solutions", "Albert Heijn 1089" vielen weg als leverancier. | Disclaimer alleen voor echte banners (fictief/testdocument/geen echt, of demo/sample in combinatie daarmee, of een losse banner-regel); straatfilter vereist een straatwoord. Tests toegevoegd. |
| Minor 4 | "Totaal te betalen (3 artikelen)" / "voor 15-10-2026" werd als kapot bedrag gezien. | Tellingen, data en jaartallen worden eerst gestript, in beide modules gelijk. Test toegevoegd. |
| Minor 5 | Afgeleide-totaalcap (≤ 0,84) is correct; routing niet door de benchmark gedekt. | Gedocumenteerd; de app-reviewtest dekt de routing van een onzeker totaal. |
| Minor 6 | Zelf getypte website werd door de naamcheck weggegooid of als "document" gestempeld; herkomst kon op een bestaande relatie worden gezet zonder website te schrijven. | Getypte website blijft staan met bron `user`; herkomst alleen bij daadwerkelijk schrijven. Browsertest opnieuw groen. |
| Minor 7 | Logo-browsertest niet in CI; party-roles kon niet falen; begrensde variant blokkeerde de PR; `/health` toonde de ruwe env-waarde. | Browsertest in `boekuna-app.yml`; party-roles faalt boven baseline (0/2 WRONG); begrensde variant `continue-on-error`; `/health` toont de effectieve instelling. |

Niet overgenomen: geen. Scope-oordeel van de reviewer: geen boekhoud-, btw-, auth-, RLS- of billingwijzigingen; `website` is additief; de regel-samenvoeging is "the right fix" en beschadigt partijblokken niet (eigen skew-simulatie 1,5–3°).
