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
| EXP-001 | EXP | Handmatige kostenboeking | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-002 | EXP | Leverancier | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-003 | EXP | Datum | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-004 | EXP | Factuurnummer | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-005 | EXP | Categorie | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-006 | EXP | Betaalwijze | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-007 | EXP | 21% btw | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-008 | EXP | 9% btw | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-009 | EXP | Mixed VAT | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-010 | EXP | Excl/btw/incl cent-nauwkeurig | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-011 | EXP | Kosten bewerken | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-012 | EXP | Kosten corrigeren | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-013 | EXP | Kosten verwijderen | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-014 | EXP | Kosten heropenen/persistence | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-015 | EXP | Kosten downstream btw | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| EXP-016 | EXP | Kosten downstream rapportage/grootboek | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-001 | DOC | JPG upload | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-002 | DOC | PNG upload | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-003 | DOC | WEBP/HEIC/TIFF/BMP indien ondersteund | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-004 | DOC | Digitale PDF | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-005 | DOC | Scan-PDF | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-006 | DOC | Multipage PDF | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-007 | DOC | DOCX/XLSX/CSV generiek document waar ondersteund | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-008 | DOC | Bon cameracapture | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-009 | DOC | OCR leverancier | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-010 | DOC | OCR datum | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-011 | DOC | OCR documentnummer | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-012 | DOC | OCR excl/btw/incl | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-013 | DOC | OCR 21% | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-014 | DOC | OCR 9% | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-015 | DOC | OCR mixed VAT niet flattenen | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-016 | DOC | OCR review | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-017 | DOC | OCR correctie | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-018 | DOC | OCR bevestigen/boeken | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-019 | DOC | Document reopen | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-020 | DOC | Corrupt bestand | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-021 | DOC | Unsupported bestand | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-022 | DOC | Processor error state | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-023 | DOC | Retry | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-024 | DOC | Ander bestand kiezen | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-025 | DOC | Handmatig invoeren fallback | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-026 | DOC | Batch upload | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-027 | DOC | Per-document status | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-028 | DOC | Achtergrondverwerking + navigeren | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-029 | DOC | Retry per item | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-030 | DOC | Duplicate document bescherming | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-031 | DOC | Document verwijderen veilige eligibility | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| DOC-032 | DOC | Document attention status/count | BLOCKED | Requires safe QA record creation and/or real document upload/processor interaction; current exact-SHA processor/browser steps were skipped after CI-007. |
| BANK-001 | BANK | Handmatige inkomende transactie | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-002 | BANK | Handmatige uitgaande transactie | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-003 | BANK | Datum/bedrag/omschrijving | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-004 | BANK | CSV-import geldig | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-005 | BANK | CSV duplicate bescherming | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-006 | BANK | CSV malformed | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-007 | BANK | CSV leeg | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-008 | BANK | CSV unsupported | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-009 | BANK | CAMT.053 indien werkelijk aanwezig | NOT_APPLICABLE | Frozen source/repository contains no CAMT.053 or MT940 parser/reference. |
| BANK-010 | BANK | MT940 indien werkelijk aanwezig | NOT_APPLICABLE | Frozen source/repository contains no CAMT.053 or MT940 parser/reference. |
| BANK-011 | BANK | Automatch | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-012 | BANK | Open factuur matchen met inkomend | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-013 | BANK | Kosten/document matchen met uitgaand | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-014 | BANK | Verkeerde match corrigeren | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-015 | BANK | Unmatch | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-016 | BANK | Rematch | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-017 | BANK | Geen dubbele boeking na rematch | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-018 | BANK | Bank zoeken/filteren/sorteren | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| BANK-019 | BANK | Fingerprint/dedupe consistent | BLOCKED | Requires creating/importing/matching synthetic bank data in the running authenticated app; no interactive runner available. |
| VAT-001 | VAT | Btw kwartaal | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-002 | VAT | Btw jaar | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-003 | VAT | Jaarselectie bestaande jaren | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-004 | VAT | Verkoop-btw | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-005 | VAT | Inkoop-btw | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-006 | VAT | Saldo | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-007 | VAT | 21% + 9% meerdere tarieven | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-008 | VAT | Mixed VAT | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-009 | VAT | KOR/zero-output treatment | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-010 | VAT | Afronding cent-nauwkeurig | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-011 | VAT | Onderliggende facturen cross-check | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| VAT-012 | VAT | Onderliggende kosten cross-check | BLOCKED | Requires booking the deterministic QA truth set and cross-checking rendered VAT values; authenticated data creation unavailable. |
| REP-001 | REP | Rapport week indien aanwezig | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-002 | REP | Rapport maand | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-003 | REP | Rapport kwartaal | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-004 | REP | Rapport jaar | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-005 | REP | Rapport custom range | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-006 | REP | Omzet | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-007 | REP | Kosten | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-008 | REP | Winst | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-009 | REP | Overige KPI's | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-010 | REP | Periode over jaargrens | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| REP-011 | REP | Print/PDF/export indien aanwezig | BLOCKED | Requires populated QA ledger and rendered/exported report interaction; no interactive runner available. |
| LED-001 | LED | Grootboek gegenereerd uit factuur | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-002 | LED | Grootboek uit kosten | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-003 | LED | Grootboek btw | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-004 | LED | Grootboek betaling | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-005 | LED | Grootboek bankmatch | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-006 | LED | Debet/credit consistent | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-007 | LED | Zoeken/sorteren | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| LED-008 | LED | Geen dubbele regels na rematch | BLOCKED | Requires persisted transaction chain and rendered generated journal comparison; QA data cannot be created interactively here. |
| CASH-001 | CASH | Cashflowweergave | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-002 | CASH | Toekomstige bewegingen | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-003 | CASH | Geplande kasbeweging maken | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-004 | CASH | Geplande kasbeweging bewerken indien aanwezig | NOT_APPLICABLE | Current frozen source exposes create/delete planned cash but no editPlannedCash action. |
| CASH-005 | CASH | Geplande kasbeweging verwijderen | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-006 | CASH | Persistence | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-007 | CASH | Effect op prognose | BLOCKED | Requires interactive creation/persistence/projection verification in the running app. |
| CASH-008 | CASH | Recurring cashflow indien aanwezig | NOT_APPLICABLE | No recurring cashflow implementation is present on the frozen SHA. |
| CTRL-001 | CTRL | Controlecentrum lijst | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-002 | CTRL | Dashboard count ↔ controlecentrum | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-003 | CTRL | Filters | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-004 | CTRL | Item openen | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-005 | CTRL | Reden zichtbaar | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-006 | CTRL | Oplossing uitvoeren | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-007 | CTRL | Resolved status | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-008 | CTRL | Count update na echte oplossing | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| CTRL-009 | CTRL | Grote lijst | BLOCKED | Requires creating/resolving attention conditions and verifying counts through the UI. |
| BOOK-001 | BOOK | Boeking maken | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-002 | BOOK | Klant/dienst | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-003 | BOOK | Datum/tijd | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-004 | BOOK | Status gepland/bevestigd | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-005 | BOOK | Voltooien | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-006 | BOOK | Annuleren/no-show indien aanwezig | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-007 | BOOK | Bewerken | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-008 | BOOK | Persistence | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-009 | BOOK | Factuur uit boeking | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-010 | BOOK | Herinnering markeren | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| BOOK-011 | BOOK | Zoeken/filteren/sorteren/custom periode | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| TIME-001 | TIME | Uur maken | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-002 | TIME | Uur datum | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-003 | TIME | Uur duur | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-004 | TIME | Uur omschrijving/project | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-005 | TIME | Uur bewerken | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-006 | TIME | Uur verwijderen | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-007 | TIME | Uren totaal | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-008 | TIME | Rit maken | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-009 | TIME | Rit datum | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-010 | TIME | Rit afstand | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-011 | TIME | Rit omschrijving | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-012 | TIME | Rit bewerken | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-013 | TIME | Rit verwijderen | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-014 | TIME | Ritten totaal | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| TIME-015 | TIME | Export/rapportage-impact waar aanwezig | BLOCKED | Requires authenticated create/edit/delete/total/export interaction. |
| SETTLE-001 | SETTLE | Gemengde afrekening maken | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SETTLE-002 | SETTLE | Omzetcomponent | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SETTLE-003 | SETTLE | Kostencomponent | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SETTLE-004 | SETTLE | Referentie/partij | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SETTLE-005 | SETTLE | Bankmatch naar afrekening | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SETTLE-006 | SETTLE | Grootboek-effect | BLOCKED | Requires interactive create/edit/status/persistence/cross-feature verification in the authenticated app. |
| SET-001 | SET | Bedrijfsnaam/handelsnaam opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-002 | SET | KVK/btw-id opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-003 | SET | Adres/land opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-004 | SET | Contactgegevens opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-005 | SET | IBAN/rekeninghouder/BIC opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-006 | SET | Factuurprefix opslaan en toepassen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-007 | SET | Standaard betaaltermijn toepassen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-008 | SET | Peppol/e-factuur-ID opslaan | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-009 | SET | KOR toggle en factuur-effect | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-010 | SET | E-mailsjabloon opslaan/preview | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-011 | SET | Factuurlayout opslaan/preview | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-012 | SET | Logo upload/verwijderen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-013 | SET | Fiscale spelregels openen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-014 | SET | Privacy & veiligheid openen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-015 | SET | Support mailto | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-016 | SET | Logout vanuit instellingen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-017 | SET | Versiegeschiedenis | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-018 | SET | Administratie wissen alleen QA-account | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-019 | SET | Sync-herstel indien conflict | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| SET-020 | SET | Account verwijderen | BLOCKED | Requires changing safe QA values, saving, refreshing/reopening and verifying downstream effects through the authenticated UI. |
| EXPORT-001 | EXPORT | Facturen CSV export | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-002 | EXPORT | Kosten CSV export | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-003 | EXPORT | Journal/grootboek CSV export | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-004 | EXPORT | Auditlog CSV export | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-005 | EXPORT | Back-up JSON export | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-006 | EXPORT | Back-up JSON import/restore | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-007 | EXPORT | Invalid backup afgewezen | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-008 | EXPORT | Restore zonder stille duplicatie | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-009 | EXPORT | Encoding/headers/decimalen/datums | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
| EXPORT-010 | EXPORT | Refresh persistence na restore | BLOCKED | Requires browser download/file-content inspection and safe QA restore interaction. |
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
