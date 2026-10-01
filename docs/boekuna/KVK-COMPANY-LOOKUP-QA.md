# KVK — ontwikkelvalidatie en onafhankelijke overdracht

Dit zijn uitvoerderscontroles. Er is nog geen onafhankelijk `03 QA RESULT: PASS`.
Het exacte te beoordelen HEAD staat in de feature-PR. Een wijziging daarna vereist een nieuwe HEAD-beoordeling.

| Controle | Uitgevoerd resultaat |
|---|---|
| BACKEND TESTS | 14 Node-tests PASS: zoeken/profiel, één nevenvestigingscall, ontbrekende status, afgeschermd/post/buitenlands adres, input/body, auth, CORS, budgetfalen, 401/403/404/429/5xx, JSON/size/timeout inclusief body, tokens/userbinding/expiry, profiel-ID, lege/numerieke zoekactie |
| Deno/SDK | Beide entrypoints typecheck PASS, SDK 2.117.2 |
| Officiële testintegratie | Gedeployde functie met echte Supabase-QA-sessie: PASS; naamzoekactie, Basisprofiel, nummerzoekactie en specifiek Vestigingsprofiel; ongeldige JWT 401, vreemde origin 403, ongeldige input 400 |
| Databasepermissions | RLS aan; budget-RPC en preview-config-RPC niet uitvoerbaar voor anon/authenticated; serverrol wel |
| Duurzame concurrency | 12 gelijktijdige RPC's bij één resterende dagreservering: exact 1 toegestaan, 11 geweigerd; geen errors |
| Supabase advisors | Geen nieuwe KVK-securityfinding na toevoegen van de serverrolpolicy. Bestaande projectmeldingen zijn buiten de featurescope. |
| SECRET LEAK TEST | Gegenereerde productiebuild bevat geen key/signingsecret, server-KVK-URL, testkey, testdataset of dev-only backend. Sentinel-envtest en onveilige preview-builds: PASS |
| CHROMIUM | Gegenereerde productieflow PASS: zoeken, toetsenbordselectie, één profiel, editable autofill, type/contact/btw behouden, save/cloud/reopen/reload, invoicecustomer, duplicate/open/edit, handmatig, races/sluiten/accountwissel, cache, productie-testdataweigering |
| WEBKIT | Dezelfde gegenereerde productieflow PASS |
| MOBILE | 320/360/375/390/393/430/768/820/1024/1280/1440 px; dialoog en lange resultnaam zonder horizontale overflow in beide engines |
| ACCESSIBILITY | Benoemde labels/resultaatknoppen, polite live-status, zichtbare focus, Tab/Shift+Tab/Enter/Escape; axe WCAG A/AA/2.1 AA op KVK en relatieformulier PASS. Labelcontrast is binnen deze modal gecorrigeerd. |
| Auth regression | Auth/progressive onboarding PASS; tenant-isolation PASS; Developer Mode guards PASS; bestaande authcode blijft intact |
| Invoice/customer regression | Invoice status/edit PASS; invoice delivery/PDF/mailgrens PASS; geselecteerde en opgeslagen klant blijft in factuurkeuze beschikbaar |
| Accounting regression | Accounting integrity, production integrity en smart financial correction PASS |
| Cloud/billing regression | Cloud-sync serialization, billing-source en provider-agnostic entitlement PASS |
| Builds/CI scope | App build, split-build, split-origin en split-ci-scopes PASS. KVK-mocks en beide browsermodi toegevoegd aan scoped workflows. Geen KVK-verzoeken in CI. |

## Grenzen en bekende punten

- `tests/source-safety.test.mjs` faalt al op ongewijzigde main `8b4c178…` bij de oude
  placeholderverwachting `Zoek op naam, e-mail of plaats`. Dezelfde fout is apart
  gereproduceerd op een baseline-export. Dit is geen KVK-regressie; de backendworkflow
  blijft daardoor geen geheel groene releasegate. Geen buiten-scope UI-aanpassing gedaan.
- Browsertests gebruiken gecontroleerde Supabase/KVK-fixtures voor fouten, races en opslag.
  De afzonderlijke officiële integratie gebruikt de echte gedeployde auth/backend/API-keten.
  Fixtures zijn geen productie-KVK-data. Screenshotbestanden zijn uitsluitend QA-fixtures.
- Productiekey, subscription, betaalde live smoke en productieactivatie zijn niet uitgevoerd.
- Geautomatiseerde toegankelijkheidscontrole is geen volledige toets met menselijke screenreaderbediening.
- Een QA-account is uitsluitend in het bestaande geïsoleerde testproject aangemaakt.
  De eenmalige serverprovisioner is daarna uitgeschakeld en zijn private toegangstabel/RPC verwijderd.
  Credentials/tokens staan niet in deze PR, logs of rapporten.
- Geen productie-DB/schema/Edgeconfig aangepast. De budgetmigratie is alleen in het testproject toegepast.

## Reproduceren

```bash
npm ci --prefix tests --ignore-scripts
npm install --prefix tests --no-save playwright@1.56.1
./tests/node_modules/.bin/playwright install --with-deps chromium webkit
node --test tests/kvk-company-lookup.test.mjs
node tests/kvk-company-lookup-security.test.mjs
node tests/kvk-company-lookup-browser.test.mjs
BOOKUNA_BROWSER=webkit node tests/kvk-company-lookup-browser.test.mjs
KVK_BROWSER_PREVIEW=true node tests/kvk-company-lookup-browser.test.mjs
KVK_BROWSER_PREVIEW=true BOOKUNA_BROWSER=webkit node tests/kvk-company-lookup-browser.test.mjs
```

Voer buildafhankelijke browsertests sequentieel uit; zij bouwen dezelfde `dist/app`.
De expliciete, opt-in integratierunner leest een private testgebruikerssessie via
`KVK_INTEGRATION_SESSION_FILE`, een openbare projectkey via
`KVK_INTEGRATION_PUBLISHABLE_KEY` en vereist `KVK_RUN_FREE_INTEGRATION=true`.
Deze runner is hard begrensd op het geïsoleerde project; hij leest of verstuurt geen KVK-key.
Niet opnemen in CI. Ruwe profielen worden niet opgeslagen.

## 01 → 03 → 04

**01 — BOEKUNA Product + UX/UI:** korte review van zoekplaatsing, relation flow,
mobiel, handmatig invoeren en begrijpelijkheid. Preview toont expliciet fictieve data.
Geen redesignronde. Noteer bevindingen op het exacte PR-HEAD.

**03 — BOEKUNA Independent QA + Security:** daarna datzelfde exacte HEAD controleren
op key leakage, auth/MFA/CORS, abuse/atomic quotas, alle fouten, test/productiescheiding,
duplicates, persistence, mobile/a11y, beide browsers, tenant isolation, auth en invoice/customer.
Controleer live preview en gedeployde function-versie naast de fixtures. Geef geen PASS
bij secrets of productie-testfallback. Neem de bestaande bron-testfout expliciet mee.

**04 — BOEKUNA DevOps + Release:** uitsluitend na onafhankelijk PASS, op dat goedgekeurde
HEAD. Voor productie eerst user-approved KVK-abonnement, echte key via veilige
secret management, productie-entrypoint/config, passende migratie en minimale live smoke.
Voor dit werk is geen productieactivatie aangevraagd of uitgevoerd.
