# BOEKUNA First Release Features

## Release profile

Production builds default to `first-release`. Unknown or empty profile values also resolve to `first-release`.
Only development/QA may explicitly use `BOEKUNA_RELEASE_PROFILE=full`.

Feature checks are strict: a feature is enabled only when its value is exactly `true`.
The first-release build changes product exposure only. Existing ledger state, database columns,
tables, document intelligence, financial calculations and historical feature data are preserved.

## Core Release 1

- Overzicht
- Inkomsten / facturen
- Kosten
- Bonnetjes / documenten and document intelligence
- Bank CSV import, transactions and matching
- Btw overview
- Simple reports
- Settings
- Simple customer / supplier relations

## Feature matrix

| Feature | Current implementation | Release 1 | UI / route behavior | Backend / side effects | Data | Reactivation |
|---|---|---|---|---|---|---|
| Personal Assistant / AI chat | Built app modules + Voor jou UI | HIDDEN + GATED | `insights → dashboard`; assistant assets not shipped | Engine source/tests preserved; no assistant runtime in Release 1 | Preserved | Set `personalAssistant:true`, rebuild, run assistant + release tests |
| Time tracking | `hours` page | HIDDEN + GATED | `hours → dashboard`; create/save functions fail closed | No scheduled side effect found | `state.hours` preserved | Enable `timeTracking` and `mileage` for combined page |
| Mileage | Combined `hours` page | HIDDEN + GATED | `hours → dashboard`; create/save functions fail closed | No scheduled side effect found | `state.mileage` preserved | Enable `mileage` and `timeTracking` |
| Projects | No standalone release route found; project text exists inside hidden hours feature | PRESERVED INTERNALLY | No Release 1 entry point | No project scheduler found | Historical references untouched | Add/enable future project surface after dedicated QA |
| Quotes | OCR can classify quote-like documents; no quote creation route found | PRESERVED INTERNALLY | No Release 1 entry point | OCR classification remains | Preserved | Add/enable future quote surface without changing OCR |
| Recurring invoices | No recurring invoice generator/scheduler found | DISABLED / ABSENT | No Release 1 entry point | No invoice cron/scheduler found | N/A / existing state untouched | Add behind `recurringInvoices` and server-side gate before exposure |
| Inventory | No stock-management route found | DISABLED / ABSENT | No Release 1 entry point | None found | Existing service/line-item data untouched | Add behind `inventory` later |
| Advanced CRM | Current Relations page is simple customer/supplier data needed by invoices | ADVANCED PART OFF; CORE CONTACTS ON | Relations remains; no pipeline/lead UI found | No CRM automation found | Contacts preserved | Gate future advanced CRM via `advancedCRM` |
| Bookings / planning | `bookings` page + reminder actions | HIDDEN + GATED | `bookings → dashboard`; dashboard booking reminders removed; direct mutators fail closed | No automatic reminder sender found | `state.bookings` preserved | Enable `bookings`, rerun booking + release tests |
| Live PSD2 bank | Not active; existing bank flow is file import + matching | OFF | Bank stays available | No live bank connection found | Bank data preserved | Enable only after real provider/server integration and QA |
| Peppol / advanced UBL UI | Peppol identifiers stored; document validation capability exists | UI HIDDEN | Company/contact Peppol edit/display controls removed from Release 1 | Parser/validation capability stays | Existing Peppol IDs explicitly preserved on normal saves | Enable `peppol`, restore controls, run persistence tests |
| Direct VAT submission | Not active | OFF | Btw overview remains; no filing action exposed | No Belastingdienst submit flow found | VAT data preserved | Add behind `vatSubmission` after integration/auth QA |
| Advanced reports | Control centre, cashflow and ledger pages exist | HIDDEN + GATED | `control → dashboard`; `cashflow/ledger → reports` | Planned cash is projection-only; it does not create booked transactions | Ledger/planned cash data preserved | Enable `advancedReports`, rerun report/cashflow/ledger suites |
| Factoring / advances / RMA / exception UX | OCR/parser recognizes complex documents; mixed settlement UI exists | ADVANCED UI HIDDEN | Mixed-settlement quick action removed; direct settlement mutators fail closed | OCR and financial validation remain active | Existing settlement/document data preserved | Enable `advancedDocumentExceptions`; keep parser tests green |
| Foreign VAT complexity | Special invoice tax-treatment selector + exception document review | STANDARD UI HIDDEN; SAFE REVIEW PRESERVED | New invoices use normal/KOR treatment automatically; specialist selector hidden | Foreign/unusual document detection and safe review remain | Existing invoice tax treatment preserved, including historical special cases | Enable `foreignVatAdvancedUX`; run tax and invoice tests |
| Developer Mode | Isolated dev helper already environment/origin/Supabase gated | OFF / FAIL-CLOSED | Asset not shipped in Release 1 | Even `BOEKUNA_DEV_MODE=true` cannot override first-release | No customer data touched | Use `full` profile only in non-production plus existing dev-mode allowlists |
| Google / Gmail / OAuth | Google login absent; mailbox OAuth endpoint currently refuses connections; invoice delivery is native/web handoff | OFF | No Google login/connect UI; native mail/share handoff stays | No Gmail API send; mailbox connection remains disabled | Historical integration tables untouched | Re-enable only with a dedicated release flag + auth/security QA |

### Auxiliary service catalog

The standalone `Diensten` page is also hidden in Release 1 because it is not required for basic bookkeeping.
Existing service data is preserved. Manual invoice lines remain fully available. The generated invoice editor
does not leave a dead link to the hidden service-management page.

## Route fallbacks

- `insights → dashboard`
- `control → dashboard`
- `cashflow → reports`
- `ledger → reports`
- `bookings → dashboard`
- `hours → dashboard`
- `services → invoices`

These guards are part of the generated Release 1 artifact. Removing a navigation item alone is not considered sufficient.

## Data safety

This release introduces no destructive migration and does not drop or rewrite feature data.
Release gates operate in the generated product artifact. The full source modules remain available for QA and later reactivation.

Special preservation rules:

- hiding Peppol controls must not blank an existing company or contact Peppol ID;
- hiding bookings, hours, mileage, services, planned cash or settlements must not remove their arrays;
- OCR/document-intelligence capabilities remain independent from the Personal Assistant and from advanced UI visibility;
- no financial formula is changed by the release profile.

## Side-effect audit

Repository audit found no recurring-invoice cron, `Deno.cron` or `pg_cron` job that auto-creates invoices.
Cashflow recurrence is a deterministic projection only; it does not generate bank transactions, payments or journal entries.
Booking reminders are explicit user actions, not an automatic sender.
The mailbox OAuth function currently returns a disabled response, while invoice email delivery remains a user-controlled PDF/mail handoff.

## Test gates

`tests/first-release-scope.test.mjs` verifies the feature matrix, fail-closed defaults, release build output,
data-preservation markers and continued document/accounting assets.

`tests/first-release-browser.test.mjs` runs the generated first-release artifact in Chromium and WebKit and verifies:

- desktop and mobile navigation;
- direct disabled route fallbacks;
- direct disabled create-function guards;
- quick actions;
- Peppol data preservation;
- simplified invoice VAT UI;
- no booking reminders on the dashboard;
- no JavaScript page errors;
- no mobile horizontal overflow.

The existing full-product regression suite continues under `BOEKUNA_RELEASE_PROFILE=full` so hidden modules remain tested and reactivatable.
