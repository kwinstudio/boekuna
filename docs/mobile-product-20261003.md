# BOEKUNA complete mobile product UX

Base: `cd6db76c115cf8814a9786baadae42b743fe0440` (PRs 147–152 included).
Branch: `feat/complete-mobile-product-20261003`.
Product intent: Nederlandse zelfstandigen begrijpen eerst de belangrijkste bedragen en acties; secundaire gegevens blijven bereikbaar zonder desktop te wijzigen.

## Audit and implementation matrix

All existing renderers are shared with desktop. Changes live in the app-only `mobile-product.css` and `mobile-product.js`, gated at the existing 820px boundary. The combined legacy source is untouched. Data and handlers below refer to `kwinest/index.html`; the mobile layer reuses them.

| Surface | Baseline issue / existing behavior | Mobile target / implementation | Data and interaction | Risk |
|---|---|---|---|---|
| Overzicht | Four full-height KPIs and large chart | Winst full width; paired Omzet/Kosten; VAT; attention; receiving; progress; chart in Reports | Existing renderDashboard values; navigate; attention actions | Medium |
| Facturen | Desktop columns transformed into verbose blocks | Customer/amount/status/due date rows; existing actions | getListRows; invoiceGross; invoiceEffectiveStatus; viewInvoice/invoiceActions | Medium |
| Factuur bekijken | A4 scale preview | Existing A4 preserved; safe scrolling sheet and reachable footer | viewInvoice; authoritative A4/PDF renderer | Medium |
| Nieuwe factuur | Dates before line items; numerous fields | Customer then lines; dates/service/optional customer disclosures | Original invoiceForm controls, validators and totals | Medium |
| Factuur bewerken | Same create form | Same progressive layout, controls retain values and handlers | editInvoice, fillInvoiceFormFromData | Medium |
| Factuur versturen | Verified native PDF handoff already present | Existing native share; compact keyboard-safe sheet | openSendInvoice; PDF/email handoff; explicit sent confirmation | Medium |
| Kostenlijst | Many labelled columns | Supplier/amount/date/category/VAT row | getListRows; expenseGross; expenseVatRateLabel; expenseActions | Medium |
| Kosten bekijken/corrigeren | Audit-preserving detail | Existing immutable-booking correction flow, readable sheet | expenseActions; correctExpense | Medium |
| Kosten boeken | Secondary payment and notes visible | Meer gegevens, same form controls | expenseForm/saveExpense | Medium |
| Bonnetjes | Table with filename and secondary metadata | Filename/status/date/type; preserve exact original review/menu buttons | document status; existing review/rename/preview/delete closures | Medium |
| Upload/scannen | Reliable direct native multi-file picker | Keep existing picker; touch controls and sheet spacing | Existing doc/invoice inputs and upload handlers | Medium |
| Verwerking/batch | Existing persistent processing | Preserve global progress/background/retry; mobile sheet spacing | Existing processing jobs/session | Medium |
| Document controleren | Recent beginner review already merged | Preserve three steps/provenance; readable inputs/labels | document-review-v2; existing correction engine | High |
| Gemengde btw | Recent cent-exact row editor | Retain editable rates, totals and blocking errors | Existing vatLines/financial validation | High |
| Document fout/retry | Existing per-item error contract | Human list status; original retry controls | Existing processing and verification actions | Medium |
| Bank | Date/description/status/amount/actions table | Signed amounts, clear match text and actions | getListRows; existing matching data | Medium |
| Inkomsten | Directional bank subpage | Same signed transaction rows | directionalBankRows | Low |
| Uitgaven | Directional bank subpage | Same signed transaction rows | directionalBankRows | Low |
| Matchen/ontkoppelen | Existing link/unlink handlers | Keep matching; explicit mobile unlink confirmation | matchTransaction/unmatchTransaction | Medium |
| Btw | Zero primary KPI when refund due | Copy authoritative calculation label and value; rate disclosure | renderVat summary, invoiceVatBreakdown | High |
| Btw-overzicht | Existing labelled mobile history | Preserve existing year cards and navigation | renderVatHistory | Low |
| Rapportages | Existing tap tooltip/period filters | One chart; two-column date inputs; vertical touch scroll | reportChartBuckets; existing tooltip and presets | Medium |
| Instellingen | All groups visible simultaneously | Index rows; one selected group; reachable back action | Original live groups and form handlers | Medium |
| Bedrijf/profiel | Existing sectioned form | Shared labelled, 16px, keyboard-safe mobile controls | profileForm; existing save handler | Medium |
| Abonnement/account | Existing live billing/account group | Selected settings subsection; billing unchanged | Original billing card and account actions | High |
| Beveiliging | Existing MFA/privacy actions | Dedicated settings entry, existing dialogs | accountMenu/showSecurity | High |
| Meer | Existing navigation drawer | Existing routes and groups, labelled bottom navigation | Existing bottom-nav/drawer/focus/inert handlers | Low |
| Leeg/laden/fout | Existing authoritative empty/loading/error states | Preserve original states and CTAs; attention retry | Existing renderers; no fake KPI values | Medium |
| Bevestigingen | Existing financial guards | Keep delete/account guards; add unlink confirmation | Original authorization/validation | High |
| Sheets/formulieren | Long modal scroll; keyboard exposure | Fixed head/footer, independently scrollable body, visual viewport height | Same modal and form nodes/handlers | Medium |

## Desktop isolation and rollback

CSS contains only mobile media rules. The stylesheet is added to the real application head with a mobile media attribute; the script is added to the actual final body, after existing review/polish scripts. Every DOM enhancement checks the media query. When crossing to desktop, moved controls return to their exact original placeholders; copied VAT text, disclosures, mobile rows and labels are restored/removed. Desktop renderers, calculations and templates remain unchanged.

Marketing builds explicitly omit the two new app-only assets. The generated marketing tree must remain byte-identical to the base; changing the exclusion list does not change marketing output. Deploy only Render service `srv-dauebj1srm7s73bubcog` (the existing app service serving app.boekuna.nl). No processor, schema/RLS, Stripe, auth or marketing deployment.

Rollback: redeploy the previous app commit `cd6db76c115cf8814a9786baadae42b743fe0440`; previous live deployment `dep-db0nna49v7es73c8gn7g`. No data migration or rollback is required.

## Verification contract

- `tests/complete-mobile-product.test.mjs`: generated app, required 320/360/375/390/393/412/430/768 widths and landscape; core/secondary routes; Axe; invoice totals and preserved controls; costs disclosure; review; settings index/detail/back; breakpoint restoration; empty/error states.
- `tests/mobile-desktop-freeze.test.mjs`: current generated desktop compared with identical baseline HTML without the optional mobile layer; 13 screens at 1024/1280/1366/1440/1920 plus document/settings/VAT after mobile resize; exact screenshot-byte equality in Chromium and WebKit. No mask or accepted pixel drift.
- Existing product-reference, invoice PDF/native handoff, processing/review, mixed VAT, financial corrections, auth and tenant regression suites remain release gates.
- No physical iPhone/PWA/native-mail delivery claim follows from browser emulation. Real-device share/app availability remains a manual-device check.
- Production smoke uses unmodified production HTML and assets. Authenticated production actions require an available authorized session; local synthetic fixtures are never deployed.
