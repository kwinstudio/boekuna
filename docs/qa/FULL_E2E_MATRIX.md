# BOEKUNA Full Functional E2E Matrix

Run: QA-E2E-20261001  
Source SHA: `7132029b792c8942f18317637ff352461dfe08d5`  
Mode: BASELINE_MAIN  
Inventory source: frozen `kwinest/index.html`, current build scripts/workflows, Supabase migrations/functions and actual navigation.

Status vocabulary: PASS / FAIL / BLOCKED / NOT_TESTED / NOT_APPLICABLE.

## Function inventory

| TEST-ID | Domain | Scenario | Status | Evidence / note |
|---|---|---|---|---|
| AUTH-001 | AUTH | Registratie met geldig e-mailadres/wachtwoord | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-002 | AUTH | Registratie-validatie ongeldig e-mailadres | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-003 | AUTH | Registratie-validatie zwak/ongeldig wachtwoord | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-004 | AUTH | Login geldig account | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-005 | AUTH | Login fout wachtwoord | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-006 | AUTH | Login onbekend account | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-007 | AUTH | E-mailverificatieflow waar veilig | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-008 | AUTH | Wachtwoord vergeten | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-009 | AUTH | Wachtwoord reset | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-010 | AUTH | MFA enrollment/challenge waar geconfigureerd | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-011 | AUTH | Sessie refresh | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-012 | AUTH | Reload behoudt veilige sessie | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-013 | AUTH | Expired session naar auth | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-014 | AUTH | Logout wist protected state | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-015 | AUTH | Browser Back na logout herstelt app niet | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-016 | AUTH | Browser Forward na logout herstelt app niet | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-017 | AUTH | Progressive onboarding | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| AUTH-018 | AUTH | Cloud persistence na herlogin | BLOCKED | Interactive authenticated browser execution unavailable in this runtime; exact-current auth workflow step was skipped after CI-007. |
| NAV-001 | NAV | Desktop sidebar: alle 15 actuele pagina's bereikbaar | NOT_TESTED |  |
| NAV-002 | NAV | Mobiele bottom navigation: Dashboard | NOT_TESTED |  |
| NAV-003 | NAV | Mobiele bottom navigation: Facturen | NOT_TESTED |  |
| NAV-004 | NAV | Mobiele bottom navigation: Scan/Documenten | NOT_TESTED |  |
| NAV-005 | NAV | Mobiele bottom navigation: Bank | NOT_TESTED |  |
| NAV-006 | NAV | Mobiele Meer-drawer | NOT_TESTED |  |
| NAV-007 | NAV | Quick New menu | NOT_TESTED |  |
| NAV-008 | NAV | Accountmenu | NOT_TESTED |  |
| NAV-009 | NAV | Cloud-syncbadge staten | NOT_TESTED |  |
| NAV-010 | NAV | Globale documentverwerkingsindicator | NOT_TESTED |  |
| DASH-001 | DASH | Dashboard laadt zonder fout | NOT_TESTED |  |
| DASH-002 | DASH | Dashboard KPI's volgen brondata | NOT_TESTED |  |
| DASH-003 | DASH | Dashboard aandacht-count | NOT_TESTED |  |
| DASH-004 | DASH | Dashboard doorklik aandacht | NOT_TESTED |  |
| DASH-005 | DASH | Dashboard lange naam wrapt veilig | NOT_TESTED |  |
| DASH-006 | DASH | Dashboard lege administratie | NOT_TESTED |  |
| REL-001 | REL | Klant aanmaken | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-002 | REL | Leverancier aanmaken | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-003 | REL | Relatie bewerken | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-004 | REL | Relatie heropenen/persistence | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-005 | REL | Relatie archiveren/verwijderen indien aanwezig | NOT_APPLICABLE | Frozen source exposes no relation delete/archive/remove action. |
| REL-006 | REL | Relatiezoekfunctie naam/contactpersoon/e-mail/plaats/btw-id | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-007 | REL | Relatiefilter klant/leverancier | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-008 | REL | Relaties sorteren A-Z/Z-A | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-009 | REL | Lange bedrijfsnaam | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| REL-010 | REL | Unicode/apostrof/quotes in relatie | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| KVK-001 | KVK | KVK zoeken | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-002 | KVK | KVK loading state | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-003 | KVK | KVK resultaat kiezen | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-004 | KVK | KVK geen resultaat | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-005 | KVK | KVK provider/error state | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-006 | KVK | KVK gegevens overnemen | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-007 | KVK | KVK overgenomen gegevens handmatig wijzigen | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-008 | KVK | KVK-relatie opslaan | BLOCKED | Live KVK UI interaction requires authenticated browser. |
| KVK-009 | KVK | KVK budget/rate-limit contract | PASS | Deployed KVK Edge Function v1 calls service-role-only consume_kvk_lookup_budget; production migration enforces atomic per-user/global minute/day/month limits. |
| KVK-010 | KVK | KVK auth/server-side credential boundary | PASS | Deployed function verify_jwt=true; rejects missing/non-user auth, enforces MFA assurance when required, origin allowlist, no KVK credential/raw response exposed to browser. |
| SRV-001 | SRV | Dienst aanmaken | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-002 | SRV | Dienst prijs | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-003 | SRV | Dienst btw | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-004 | SRV | Dienst eenheid/omschrijving | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-005 | SRV | Dienst bewerken | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-006 | SRV | Dienst activeren/deactiveren | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-007 | SRV | Dienst verwijderen indien toegestaan | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-008 | SRV | Dienst gebruiken in factuur | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| SRV-009 | SRV | Diensten zoeken/filteren/sorteren | BLOCKED | Browser CRUD/interaction required; no interactive runner available. |
| INV-001 | INV | Nieuwe verkoopfactuur | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-002 | INV | Bestaande klant kiezen | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-003 | INV | Nieuwe klant vanuit factuur indien aanwezig | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-004 | INV | Dienst aan factuur toevoegen | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-005 | INV | Handmatige factuurregel | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-006 | INV | Meerdere factuurregels | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-007 | INV | Aantal en eenheidsprijs | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-008 | INV | 21% btw | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-009 | INV | 9% btw | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-010 | INV | 0%/geen btw waar ondersteund | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-011 | INV | Btw verlegd | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-012 | INV | ICP/EU 0% | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-013 | INV | Btw-vrijgesteld | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-014 | INV | KOR | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-015 | INV | Korting | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-016 | INV | Factuurdatum | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-017 | INV | Lever-/prestatiedatum | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-018 | INV | Vervaldatum/betaaltermijn | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-019 | INV | Concept opslaan | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-020 | INV | Concept refresh/reopen | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-021 | INV | Concept bewerken | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-022 | INV | Definitief maken | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-023 | INV | Definitieve nummerreservering atomair | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-024 | INV | Dubbel factuurnummer voorkomen | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-025 | INV | Factuur dupliceren als concept | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-026 | INV | Creditfactuur | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-027 | INV | Creditlimiet niet hoger dan origineel | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-028 | INV | Factuur verwijderen waar toegestaan | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-029 | INV | Lege regel validatie | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-030 | INV | €0 validatie | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-031 | INV | €0,01 | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-032 | INV | Hoog bedrag | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-033 | INV | Lange omschrijving | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-034 | INV | Double save/double submit | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-035 | INV | Refresh tijdens edit | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-036 | INV | Status open/verlopen/betaald | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| INV-037 | INV | Openstaand bedrag na deelbetaling | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-001 | PDF | Factuur-PDF bedrijfsgegevens | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-002 | PDF | Factuur-PDF klantgegevens | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-003 | PDF | Factuur-PDF nummer/datums | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-004 | PDF | Factuur-PDF regels en btw | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-005 | PDF | Factuur-PDF totaal | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-006 | PDF | Factuur-PDF betaalinformatie | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-007 | PDF | Factuur-PDF layout modern | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-008 | PDF | Factuur-PDF layout classic | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-009 | PDF | Factuur-PDF layout minimal | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PDF-010 | PDF | Factuur-PDF logo/branding | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-001 | MAIL | Verzendflow via eigen e-mailapp/handoff | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-002 | MAIL | Onderwerp correct | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-003 | MAIL | Body correct | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-004 | MAIL | PDF-bijlage voorbereid | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-005 | MAIL | Native share waar ondersteund | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-006 | MAIL | Desktop mailto/Gmail-web fallback waar ondersteund | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-007 | MAIL | Expliciete verzonden-bevestiging | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-008 | MAIL | Niet-verzonden pad wijzigt status niet | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| MAIL-009 | MAIL | Verzendstatus/audit | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-001 | PAY | Volledige betaling registreren | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-002 | PAY | Deelbetaling registreren | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-003 | PAY | Meerdere betalingen | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-004 | PAY | Betaald-status na saldo nul | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-005 | PAY | Openstaand na deelbetaling | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-006 | PAY | Betaling verwijderen/corrigeren indien aanwezig | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-007 | PAY | Betaling downstream dashboard | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| PAY-008 | PAY | Betaling downstream grootboek | BLOCKED | Requires authenticated browser interaction and/or downloaded PDF/native handoff evidence; no interactive runner available. |
| EXP-001 | EXP | Handmatige kostenboeking | NOT_TESTED |  |
| EXP-002 | EXP | Leverancier | NOT_TESTED |  |
| EXP-003 | EXP | Datum | NOT_TESTED |  |
| EXP-004 | EXP | Factuurnummer | NOT_TESTED |  |
| EXP-005 | EXP | Categorie | NOT_TESTED |  |
| EXP-006 | EXP | Betaalwijze | NOT_TESTED |  |
| EXP-007 | EXP | 21% btw | NOT_TESTED |  |
| EXP-008 | EXP | 9% btw | NOT_TESTED |  |
| EXP-009 | EXP | Mixed VAT | NOT_TESTED |  |
| EXP-010 | EXP | Excl/btw/incl cent-nauwkeurig | NOT_TESTED |  |
| EXP-011 | EXP | Kosten bewerken | NOT_TESTED |  |
| EXP-012 | EXP | Kosten corrigeren | NOT_TESTED |  |
| EXP-013 | EXP | Kosten verwijderen | NOT_TESTED |  |
| EXP-014 | EXP | Kosten heropenen/persistence | NOT_TESTED |  |
| EXP-015 | EXP | Kosten downstream btw | NOT_TESTED |  |
| EXP-016 | EXP | Kosten downstream rapportage/grootboek | NOT_TESTED |  |
| DOC-001 | DOC | JPG upload | NOT_TESTED |  |
| DOC-002 | DOC | PNG upload | NOT_TESTED |  |
| DOC-003 | DOC | WEBP/HEIC/TIFF/BMP indien ondersteund | NOT_TESTED |  |
| DOC-004 | DOC | Digitale PDF | NOT_TESTED |  |
| DOC-005 | DOC | Scan-PDF | NOT_TESTED |  |
| DOC-006 | DOC | Multipage PDF | NOT_TESTED |  |
| DOC-007 | DOC | DOCX/XLSX/CSV generiek document waar ondersteund | NOT_TESTED |  |
| DOC-008 | DOC | Bon cameracapture | NOT_TESTED |  |
| DOC-009 | DOC | OCR leverancier | NOT_TESTED |  |
| DOC-010 | DOC | OCR datum | NOT_TESTED |  |
| DOC-011 | DOC | OCR documentnummer | NOT_TESTED |  |
| DOC-012 | DOC | OCR excl/btw/incl | NOT_TESTED |  |
| DOC-013 | DOC | OCR 21% | NOT_TESTED |  |
| DOC-014 | DOC | OCR 9% | NOT_TESTED |  |
| DOC-015 | DOC | OCR mixed VAT niet flattenen | NOT_TESTED |  |
| DOC-016 | DOC | OCR review | NOT_TESTED |  |
| DOC-017 | DOC | OCR correctie | NOT_TESTED |  |
| DOC-018 | DOC | OCR bevestigen/boeken | NOT_TESTED |  |
| DOC-019 | DOC | Document reopen | NOT_TESTED |  |
| DOC-020 | DOC | Corrupt bestand | NOT_TESTED |  |
| DOC-021 | DOC | Unsupported bestand | NOT_TESTED |  |
| DOC-022 | DOC | Processor error state | NOT_TESTED |  |
| DOC-023 | DOC | Retry | NOT_TESTED |  |
| DOC-024 | DOC | Ander bestand kiezen | NOT_TESTED |  |
| DOC-025 | DOC | Handmatig invoeren fallback | NOT_TESTED |  |
| DOC-026 | DOC | Batch upload | NOT_TESTED |  |
| DOC-027 | DOC | Per-document status | NOT_TESTED |  |
| DOC-028 | DOC | Achtergrondverwerking + navigeren | NOT_TESTED |  |
| DOC-029 | DOC | Retry per item | NOT_TESTED |  |
| DOC-030 | DOC | Duplicate document bescherming | NOT_TESTED |  |
| DOC-031 | DOC | Document verwijderen veilige eligibility | NOT_TESTED |  |
| DOC-032 | DOC | Document attention status/count | NOT_TESTED |  |
| BANK-001 | BANK | Handmatige inkomende transactie | NOT_TESTED |  |
| BANK-002 | BANK | Handmatige uitgaande transactie | NOT_TESTED |  |
| BANK-003 | BANK | Datum/bedrag/omschrijving | NOT_TESTED |  |
| BANK-004 | BANK | CSV-import geldig | NOT_TESTED |  |
| BANK-005 | BANK | CSV duplicate bescherming | NOT_TESTED |  |
| BANK-006 | BANK | CSV malformed | NOT_TESTED |  |
| BANK-007 | BANK | CSV leeg | NOT_TESTED |  |
| BANK-008 | BANK | CSV unsupported | NOT_TESTED |  |
| BANK-009 | BANK | CAMT.053 indien werkelijk aanwezig | NOT_TESTED |  |
| BANK-010 | BANK | MT940 indien werkelijk aanwezig | NOT_TESTED |  |
| BANK-011 | BANK | Automatch | NOT_TESTED |  |
| BANK-012 | BANK | Open factuur matchen met inkomend | NOT_TESTED |  |
| BANK-013 | BANK | Kosten/document matchen met uitgaand | NOT_TESTED |  |
| BANK-014 | BANK | Verkeerde match corrigeren | NOT_TESTED |  |
| BANK-015 | BANK | Unmatch | NOT_TESTED |  |
| BANK-016 | BANK | Rematch | NOT_TESTED |  |
| BANK-017 | BANK | Geen dubbele boeking na rematch | NOT_TESTED |  |
| BANK-018 | BANK | Bank zoeken/filteren/sorteren | NOT_TESTED |  |
| BANK-019 | BANK | Fingerprint/dedupe consistent | NOT_TESTED |  |
| VAT-001 | VAT | Btw kwartaal | NOT_TESTED |  |
| VAT-002 | VAT | Btw jaar | NOT_TESTED |  |
| VAT-003 | VAT | Jaarselectie bestaande jaren | NOT_TESTED |  |
| VAT-004 | VAT | Verkoop-btw | NOT_TESTED |  |
| VAT-005 | VAT | Inkoop-btw | NOT_TESTED |  |
| VAT-006 | VAT | Saldo | NOT_TESTED |  |
| VAT-007 | VAT | 21% + 9% meerdere tarieven | NOT_TESTED |  |
| VAT-008 | VAT | Mixed VAT | NOT_TESTED |  |
| VAT-009 | VAT | KOR/zero-output treatment | NOT_TESTED |  |
| VAT-010 | VAT | Afronding cent-nauwkeurig | NOT_TESTED |  |
| VAT-011 | VAT | Onderliggende facturen cross-check | NOT_TESTED |  |
| VAT-012 | VAT | Onderliggende kosten cross-check | NOT_TESTED |  |
| REP-001 | REP | Rapport week indien aanwezig | NOT_TESTED |  |
| REP-002 | REP | Rapport maand | NOT_TESTED |  |
| REP-003 | REP | Rapport kwartaal | NOT_TESTED |  |
| REP-004 | REP | Rapport jaar | NOT_TESTED |  |
| REP-005 | REP | Rapport custom range | NOT_TESTED |  |
| REP-006 | REP | Omzet | NOT_TESTED |  |
| REP-007 | REP | Kosten | NOT_TESTED |  |
| REP-008 | REP | Winst | NOT_TESTED |  |
| REP-009 | REP | Overige KPI's | NOT_TESTED |  |
| REP-010 | REP | Periode over jaargrens | NOT_TESTED |  |
| REP-011 | REP | Print/PDF/export indien aanwezig | NOT_TESTED |  |
| LED-001 | LED | Grootboek gegenereerd uit factuur | NOT_TESTED |  |
| LED-002 | LED | Grootboek uit kosten | NOT_TESTED |  |
| LED-003 | LED | Grootboek btw | NOT_TESTED |  |
| LED-004 | LED | Grootboek betaling | NOT_TESTED |  |
| LED-005 | LED | Grootboek bankmatch | NOT_TESTED |  |
| LED-006 | LED | Debet/credit consistent | NOT_TESTED |  |
| LED-007 | LED | Zoeken/sorteren | NOT_TESTED |  |
| LED-008 | LED | Geen dubbele regels na rematch | NOT_TESTED |  |
| CASH-001 | CASH | Cashflowweergave | NOT_TESTED |  |
| CASH-002 | CASH | Toekomstige bewegingen | NOT_TESTED |  |
| CASH-003 | CASH | Geplande kasbeweging maken | NOT_TESTED |  |
| CASH-004 | CASH | Geplande kasbeweging bewerken indien aanwezig | NOT_TESTED |  |
| CASH-005 | CASH | Geplande kasbeweging verwijderen | NOT_TESTED |  |
| CASH-006 | CASH | Persistence | NOT_TESTED |  |
| CASH-007 | CASH | Effect op prognose | NOT_TESTED |  |
| CASH-008 | CASH | Recurring cashflow indien aanwezig | NOT_TESTED |  |
| CTRL-001 | CTRL | Controlecentrum lijst | NOT_TESTED |  |
| CTRL-002 | CTRL | Dashboard count ↔ controlecentrum | NOT_TESTED |  |
| CTRL-003 | CTRL | Filters | NOT_TESTED |  |
| CTRL-004 | CTRL | Item openen | NOT_TESTED |  |
| CTRL-005 | CTRL | Reden zichtbaar | NOT_TESTED |  |
| CTRL-006 | CTRL | Oplossing uitvoeren | NOT_TESTED |  |
| CTRL-007 | CTRL | Resolved status | NOT_TESTED |  |
| CTRL-008 | CTRL | Count update na echte oplossing | NOT_TESTED |  |
| CTRL-009 | CTRL | Grote lijst | NOT_TESTED |  |
| BOOK-001 | BOOK | Boeking maken | NOT_TESTED |  |
| BOOK-002 | BOOK | Klant/dienst | NOT_TESTED |  |
| BOOK-003 | BOOK | Datum/tijd | NOT_TESTED |  |
| BOOK-004 | BOOK | Status gepland/bevestigd | NOT_TESTED |  |
| BOOK-005 | BOOK | Voltooien | NOT_TESTED |  |
| BOOK-006 | BOOK | Annuleren/no-show indien aanwezig | NOT_TESTED |  |
| BOOK-007 | BOOK | Bewerken | NOT_TESTED |  |
| BOOK-008 | BOOK | Persistence | NOT_TESTED |  |
| BOOK-009 | BOOK | Factuur uit boeking | NOT_TESTED |  |
| BOOK-010 | BOOK | Herinnering markeren | NOT_TESTED |  |
| BOOK-011 | BOOK | Zoeken/filteren/sorteren/custom periode | NOT_TESTED |  |
| TIME-001 | TIME | Uur maken | NOT_TESTED |  |
| TIME-002 | TIME | Uur datum | NOT_TESTED |  |
| TIME-003 | TIME | Uur duur | NOT_TESTED |  |
| TIME-004 | TIME | Uur omschrijving/project | NOT_TESTED |  |
| TIME-005 | TIME | Uur bewerken | NOT_TESTED |  |
| TIME-006 | TIME | Uur verwijderen | NOT_TESTED |  |
| TIME-007 | TIME | Uren totaal | NOT_TESTED |  |
| TIME-008 | TIME | Rit maken | NOT_TESTED |  |
| TIME-009 | TIME | Rit datum | NOT_TESTED |  |
| TIME-010 | TIME | Rit afstand | NOT_TESTED |  |
| TIME-011 | TIME | Rit omschrijving | NOT_TESTED |  |
| TIME-012 | TIME | Rit bewerken | NOT_TESTED |  |
| TIME-013 | TIME | Rit verwijderen | NOT_TESTED |  |
| TIME-014 | TIME | Ritten totaal | NOT_TESTED |  |
| TIME-015 | TIME | Export/rapportage-impact waar aanwezig | NOT_TESTED |  |
| SETTLE-001 | SETTLE | Gemengde afrekening maken | NOT_TESTED |  |
| SETTLE-002 | SETTLE | Omzetcomponent | NOT_TESTED |  |
| SETTLE-003 | SETTLE | Kostencomponent | NOT_TESTED |  |
| SETTLE-004 | SETTLE | Referentie/partij | NOT_TESTED |  |
| SETTLE-005 | SETTLE | Bankmatch naar afrekening | NOT_TESTED |  |
| SETTLE-006 | SETTLE | Grootboek-effect | NOT_TESTED |  |
| SET-001 | SET | Bedrijfsnaam/handelsnaam opslaan | NOT_TESTED |  |
| SET-002 | SET | KVK/btw-id opslaan | NOT_TESTED |  |
| SET-003 | SET | Adres/land opslaan | NOT_TESTED |  |
| SET-004 | SET | Contactgegevens opslaan | NOT_TESTED |  |
| SET-005 | SET | IBAN/rekeninghouder/BIC opslaan | NOT_TESTED |  |
| SET-006 | SET | Factuurprefix opslaan en toepassen | NOT_TESTED |  |
| SET-007 | SET | Standaard betaaltermijn toepassen | NOT_TESTED |  |
| SET-008 | SET | Peppol/e-factuur-ID opslaan | NOT_TESTED |  |
| SET-009 | SET | KOR toggle en factuur-effect | NOT_TESTED |  |
| SET-010 | SET | E-mailsjabloon opslaan/preview | NOT_TESTED |  |
| SET-011 | SET | Factuurlayout opslaan/preview | NOT_TESTED |  |
| SET-012 | SET | Logo upload/verwijderen | NOT_TESTED |  |
| SET-013 | SET | Fiscale spelregels openen | NOT_TESTED |  |
| SET-014 | SET | Privacy & veiligheid openen | NOT_TESTED |  |
| SET-015 | SET | Support mailto | NOT_TESTED |  |
| SET-016 | SET | Logout vanuit instellingen | NOT_TESTED |  |
| SET-017 | SET | Versiegeschiedenis | NOT_TESTED |  |
| SET-018 | SET | Administratie wissen alleen QA-account | NOT_TESTED |  |
| SET-019 | SET | Sync-herstel indien conflict | NOT_TESTED |  |
| SET-020 | SET | Account verwijderen | NOT_TESTED |  |
| EXPORT-001 | EXPORT | Facturen CSV export | NOT_TESTED |  |
| EXPORT-002 | EXPORT | Kosten CSV export | NOT_TESTED |  |
| EXPORT-003 | EXPORT | Journal/grootboek CSV export | NOT_TESTED |  |
| EXPORT-004 | EXPORT | Auditlog CSV export | NOT_TESTED |  |
| EXPORT-005 | EXPORT | Back-up JSON export | NOT_TESTED |  |
| EXPORT-006 | EXPORT | Back-up JSON import/restore | NOT_TESTED |  |
| EXPORT-007 | EXPORT | Invalid backup afgewezen | NOT_TESTED |  |
| EXPORT-008 | EXPORT | Restore zonder stille duplicatie | NOT_TESTED |  |
| EXPORT-009 | EXPORT | Encoding/headers/decimalen/datums | NOT_TESTED |  |
| EXPORT-010 | EXPORT | Refresh persistence na restore | NOT_TESTED |  |
| BILL-001 | BILL | Billing summary server-side | NOT_TESTED |  |
| BILL-002 | BILL | Checkout test mode | NOT_TESTED |  |
| BILL-003 | BILL | Checkout success return | NOT_TESTED |  |
| BILL-004 | BILL | Checkout cancel return | NOT_TESTED |  |
| BILL-005 | BILL | Entitlement actief | NOT_TESTED |  |
| BILL-006 | BILL | Portal openen | NOT_TESTED |  |
| BILL-007 | BILL | Portal return | NOT_TESTED |  |
| BILL-008 | BILL | Inactive entitlement | NOT_TESTED |  |
| BILL-009 | BILL | Invalid entitlement | NOT_TESTED |  |
| BILL-010 | BILL | Provider-agnostic entitlement boundary | NOT_TESTED |  |
| BILL-011 | BILL | UI kan entitlement niet client-only afdwingen | NOT_TESTED |  |
| SYNC-001 | SYNC | Cloud state save | NOT_TESTED |  |
| SYNC-002 | SYNC | Cloud profile save | NOT_TESTED |  |
| SYNC-003 | SYNC | Optimistic version conflict detectie | NOT_TESTED |  |
| SYNC-004 | SYNC | Lokale conflictback-up | NOT_TESTED |  |
| SYNC-005 | SYNC | Remote authoritative restore na conflict | NOT_TESTED |  |
| SYNC-006 | SYNC | Offline status | NOT_TESTED |  |
| SYNC-007 | SYNC | Reconnect/retry | NOT_TESTED |  |
| SYNC-008 | SYNC | Geen cross-user stale state | NOT_TESTED |  |
| FLOW-001 | FLOW | Verkoopketen klant→dienst→factuur→PDF→verzenden→openstaand | NOT_TESTED |  |
| FLOW-002 | FLOW | Verkoopketen betaling→bankmatch→betaald | NOT_TESTED |  |
| FLOW-003 | FLOW | Verkoopketen dashboard→omzet→btw→rapportage→grootboek | NOT_TESTED |  |
| FLOW-004 | FLOW | Inkoopketen bon→OCR→review→correctie→boeken | NOT_TESTED |  |
| FLOW-005 | FLOW | Inkoopketen kosten→bankmatch→btw→rapportage→grootboek | NOT_TESTED |  |
| FLOW-006 | FLOW | Multi-period maanden | NOT_TESTED |  |
| FLOW-007 | FLOW | Multi-period kwartalen | NOT_TESTED |  |
| FLOW-008 | FLOW | Multi-period jaren | NOT_TESTED |  |
| FLOW-009 | FLOW | Historische filters | NOT_TESTED |  |
| FLOW-010 | FLOW | Cross-feature cent-nauwkeurige consistentie | NOT_TESTED |  |
| REC-001 | REC | Refresh tijdens factuuredit | NOT_TESTED |  |
| REC-002 | REC | Refresh tijdens upload | NOT_TESTED |  |
| REC-003 | REC | App verlaten tijdens processing | NOT_TESTED |  |
| REC-004 | REC | Terugkomen tijdens/na processing | NOT_TESTED |  |
| REC-005 | REC | Network fail simulatie | NOT_TESTED |  |
| REC-006 | REC | Retry na network fail | NOT_TESTED |  |
| REC-007 | REC | Double-click create | NOT_TESTED |  |
| REC-008 | REC | Double-submit form | NOT_TESTED |  |
| REC-009 | REC | Browser back | NOT_TESTED |  |
| REC-010 | REC | Browser forward | NOT_TESTED |  |
| REC-011 | REC | Multiple tabs | NOT_TESTED |  |
| REC-012 | REC | Expired session midden in flow | NOT_TESTED |  |
| REC-013 | REC | Duplicate document | NOT_TESTED |  |
| REC-014 | REC | Duplicate bankimport | NOT_TESTED |  |
| REC-015 | REC | Syncconflict recovery | NOT_TESTED |  |
| BREAK-001 | BREAK | Zeer lange bedrijfsnaam | NOT_TESTED |  |
| BREAK-002 | BREAK | Zeer lange klantnaam | NOT_TESTED |  |
| BREAK-003 | BREAK | Unicode | NOT_TESTED |  |
| BREAK-004 | BREAK | Apostrof | NOT_TESTED |  |
| BREAK-005 | BREAK | Quotes | NOT_TESTED |  |
| BREAK-006 | BREAK | Speciale tekens | NOT_TESTED |  |
| BREAK-007 | BREAK | Zeer groot bedrag | NOT_TESTED |  |
| BREAK-008 | BREAK | €0,01 | NOT_TESTED |  |
| BREAK-009 | BREAK | Veel factuurregels | NOT_TESTED |  |
| BREAK-010 | BREAK | Lege optionele velden | NOT_TESTED |  |
| BREAK-011 | BREAK | Ongeldige datums | NOT_TESTED |  |
| BREAK-012 | BREAK | Snel klikken | NOT_TESTED |  |
| BREAK-013 | BREAK | Navigeren tijdens processing | NOT_TESTED |  |
| SEC-001 | SEC | Tenant A kan facturen B niet lezen | NOT_TESTED |  |
| SEC-002 | SEC | Tenant A kan relaties B niet lezen | NOT_TESTED |  |
| SEC-003 | SEC | Tenant A kan kosten B niet lezen | NOT_TESTED |  |
| SEC-004 | SEC | Tenant A kan documenten B niet lezen | NOT_TESTED |  |
| SEC-005 | SEC | Tenant A kan bankdata B niet lezen | NOT_TESTED |  |
| SEC-006 | SEC | Tenant A kan settings B niet lezen | NOT_TESTED |  |
| SEC-007 | SEC | Tenant A kan exports B niet lezen | NOT_TESTED |  |
| SEC-008 | SEC | Tenant A kan ledger B niet lezen | NOT_TESTED |  |
| SEC-009 | SEC | Logout/login switch stale state | NOT_TESTED |  |
| SEC-010 | SEC | Direct object/RPC boundaries | NOT_TESTED |  |
| SEC-011 | SEC | Developer Mode productie fail-closed | NOT_TESTED |  |
| SEC-012 | SEC | Supabase RLS/security advisors | NOT_TESTED |  |
| MOB-001 | MOB | 320px kernflows | NOT_TESTED |  |
| MOB-002 | MOB | 360px kernflows | NOT_TESTED |  |
| MOB-003 | MOB | 375px kernflows | NOT_TESTED |  |
| MOB-004 | MOB | 390px kernflows | NOT_TESTED |  |
| MOB-005 | MOB | 393px kernflows | NOT_TESTED |  |
| MOB-006 | MOB | 430px kernflows | NOT_TESTED |  |
| MOB-007 | MOB | Geen globale horizontale scroll | NOT_TESTED |  |
| MOB-008 | MOB | Touch targets | NOT_TESTED |  |
| MOB-009 | MOB | Dialogs op mobiel | NOT_TESTED |  |
| MOB-010 | MOB | Mobiele tabelsemantiek | NOT_TESTED |  |
| DESK-001 | DESK | 768px kernflows | NOT_TESTED |  |
| DESK-002 | DESK | 1024px kernflows | NOT_TESTED |  |
| DESK-003 | DESK | 1280px kernflows | NOT_TESTED |  |
| DESK-004 | DESK | 1440px kernflows | NOT_TESTED |  |
| DESK-005 | DESK | Modals/tables/forms/charts/action menus | NOT_TESTED |  |
| DESK-006 | DESK | Documents/reports desktop | NOT_TESTED |  |
| BROW-001 | BROW | Chromium risicogebaseerde regressie | NOT_TESTED |  |
| BROW-002 | BROW | WebKit risicogebaseerde regressie | NOT_TESTED |  |
| BROW-003 | BROW | WebKit uploads | NOT_TESTED |  |
| BROW-004 | BROW | WebKit date controls | NOT_TESTED |  |
| BROW-005 | BROW | WebKit share/email handoff | NOT_TESTED |  |
| BROW-006 | BROW | WebKit session/scrolling | NOT_TESTED |  |
| A11Y-001 | A11Y | Keyboard navigatie | NOT_TESTED |  |
| A11Y-002 | A11Y | Focus management | NOT_TESTED |  |
| A11Y-003 | A11Y | Form labels | NOT_TESTED |  |
| A11Y-004 | A11Y | Button names | NOT_TESTED |  |
| A11Y-005 | A11Y | Modal semantics/focus trap | NOT_TESTED |  |
| A11Y-006 | A11Y | Menu semantics | NOT_TESTED |  |
| A11Y-007 | A11Y | Error associations | NOT_TESTED |  |
| A11Y-008 | A11Y | ARIA | NOT_TESTED |  |
| A11Y-009 | A11Y | Mobiele controls | NOT_TESTED |  |
| A11Y-010 | A11Y | Tabelheaders blijven in accessibility tree | NOT_TESTED |  |
| A11Y-011 | A11Y | Charts hebben tekstalternatief | NOT_TESTED |  |
| A11Y-012 | A11Y | Axe automatische scan | NOT_TESTED |  |
| CI-001 | CI | Split architecture characterization | PASS | GitHub Actions run 36883528292 step 5 |
| CI-002 | CI | Split build boundaries | PASS | GitHub Actions run 36883528292 step 6 |
| CI-003 | CI | Split origin boundaries | PASS | GitHub Actions run 36883528292 step 7 |
| CI-004 | CI | Split CI scopes | PASS | GitHub Actions run 36883528292 step 8 |
| CI-005 | CI | Provider-agnostic entitlement boundary suite | PASS | GitHub Actions run 36883528292 step 9 |
| CI-006 | CI | Accounting integrity suite | PASS | GitHub Actions run 36883528292 step 10 |
| CI-007 | CI | Production source safety suite | FAIL | GitHub Actions run 36883528292: source-safety stale contact placeholder assertion |
| CI-008 | CI | Tenant isolation suite | NOT_TESTED |  |
| CI-009 | CI | Financial/calculation suites | NOT_TESTED |  |
| CI-010 | CI | Document processor suites | NOT_TESTED |  |
| CI-011 | CI | Billing suites | NOT_TESTED |  |
| CI-012 | CI | Chromium suites | NOT_TESTED |  |
| CI-013 | CI | WebKit suites | NOT_TESTED |  |
| CI-014 | CI | Python syntax safety | NOT_TESTED |  |

## Discovered product surface

The frozen app exposes 15 desktop pages: Dashboard, Facturen, Inkoop & kosten, Documenten, Bank & kas, Controlecentrum, Btw, Rapportages, Cashflow, Grootboek, Relaties, Diensten, Boekingen, Uren & ritten and Instellingen. Mobile primary navigation exposes Dashboard, Facturen, Scan, Bank and Meer.

Additional current features found beyond the minimum prompt include credit invoices with credit-limit protection, reverse-charge/ICP/exempt/KOR invoice tax treatments, mixed settlements (revenue + costs), cloud optimistic-version conflict recovery, invoice email/layout branding, version history, account deletion, provider-agnostic billing entitlements and KVK server-side lookup.

Current relation search behavior indexes company name, contact person, e-mail, city and VAT ID. Its visible placeholder is `Zoek op bedrijfsnaam of contactpersoon`; the exact-current source-safety test still requires the retired phrase `Zoek op naam, e-mail of plaats`.
