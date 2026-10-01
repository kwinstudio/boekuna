# KVK-bedrijfszoeker — implementatie en activatie

Status: **READY FOR QA — PRODUCTION ACTIVATION PENDING KVK SUBSCRIPTION**.
De onafhankelijke 03-beoordeling en productieactivatie zijn nog niet uitgevoerd.

## Versie en scope

| Onderdeel | Waarde |
|---|---|
| BASE MAIN SHA | `7096fa914d511beaa726214639be01888ed4107b` (bijgewerkte main na marketingmerge #113) |
| Audit/startbasis | `8b4c17859aff07bcce6fbc3f02117074571a1e5c`; de appbron veranderde niet in #113 |
| BRANCH | `feature/kvk-company-lookup` |
| HEAD | Exacte review-HEAD staat in het reviewcontract van de feature-PR; controleer `git rev-parse HEAD` |
| OPEN PR COLLISION CHECK | Oude PR's #15, #18, #55, #57 en #69 hebben geen Relaties-hunks. Marketing-PR #113 wijzigt `kwinest/index.html` niet. Geen actieve cleanup/modularisatie/Relaties-PR gevonden. |
| Bron | Actuele main, inclusief gemergde #111. Geen accounting-, auth- of billinggedrag aangepast. |

De eerdere algemene collision-stop in audit-PR #112 was te breed. Dit rapport
vervangt die conclusie: daadwerkelijke patches, activiteit en scope zijn beoordeeld.
Oude marketing/login-PR's zijn niet gemerged of gesloten.

## Officiële API's

Documentatie gecontroleerd op **2026-10-01**:

- [Zoeken](https://developers.kvk.nl/documentation/zoeken-api), OpenAPI 2.1.0.
- [Basisprofiel](https://developers.kvk.nl/documentation/basisprofiel-api), OpenAPI 1.5.0.
- [Vestigingsprofiel](https://developers.kvk.nl/documentation/vestigingsprofiel-api), OpenAPI 1.4.0.
- [Officiële gratis testomgeving](https://developers.kvk.nl/documentation/testing).
- [Abonnement en prijzen](https://developers.kvk.nl/pricing).
- [Gebruiksvoorwaarden](https://developers.kvk.nl/documentation/terms-of-use).

| API | Serverroute | Gebruik |
|---|---|---|
| Search API | `https://api.kvk.nl/api/v2/zoeken` | Naam of exact 8-cijferig KVK-nummer; plaats optioneel; 10 resultaten; max. 3 pagina's |
| Profile API | `https://api.kvk.nl/api/v1/basisprofielen/{kvk}` | Alleen na selectie van hoofdvestiging/rechtspersoon |
| Branch profile | `https://api.kvk.nl/api/v1/vestigingsprofielen/{vestiging}` | Eén aanvraag voor de specifiek gekozen nevenvestiging; geen extra Basisprofiel-aanvraag |
| Test environment | Dezelfde versies onder `/test/api/` | Alleen expliciete preview/testconfiguratie én project `ozisiotrzeubwbffnxyr` |

Gereviewd tarief: zoeken gratis; Basisprofiel en Vestigingsprofiel elk €0,02;
abonnement €6,40 per maand. Controleer actuele voorwaarden en toegestane toepassing
opnieuw vóór activatie. Er is geen abonnement aangeschaft en geen betaald KVK-verzoek gedaan.

## Backend, authenticatie en geheimen

Edge Function: **`kvk-company-lookup`**. Productie-entrypoint:
`supabase/functions/kvk-company-lookup/index.ts`.
Supabase SDK gepind op `2.117.2`; de testclient heeft een vastgelegd npm-lockbestand.

- Platform-JWTcontrole blijft aan: `verify_jwt = true`.
- Server valideert de bearer met `auth.getUser()` en controleert MFA-niveau met de specifieke JWT.
- Geen anonieme Supabase-gebruikers; geen openbare KVK-proxy; geen clientgestuurde key, API-route of modus.
- CORS geeft alleen exact toegestane origins terug. Onbekende origins krijgen 403, inclusief preflight.
- Zoekinput 3–120 tekens; numerieke input exact 8 cijfers; plaats max. 80 tekens; body max. 2 KiB.
- Selectietoken: HMAC-SHA256, aan gebruiker en API-modus gebonden, 5 minuten geldig.
- Profielnummer en vestigingsnummer worden vergeleken met de ondertekende selectie.
- KVK-timeout 8 seconden, inclusief responsebody; max. 256 KiB; geen automatische retries of redirects.
- Upstream 401/403, 404, 429, 5xx, JSON/schemafouten en timeout krijgen veilige foutcodes met referentie-ID.
- Logs bevatten alleen actie, modus, HTTP-status, duur, aantal resultaten en foutreferentie.
  Geen zoektermen, bedrijfsnamen, adressen, bearer, API-key of ruwe KVK-responses.

### Production config

Default **uitgeschakeld**. Vereiste serversecrets bij toekomstige activatie:

| Secret | Waarde/voorwaarde |
|---|---|
| `KVK_LOOKUP_ENABLED` | `true`, pas na releasegoedkeuring |
| `KVK_API_MODE` | `production` |
| `KVK_API_KEY` | Echte productiesleutel via platform secret management |
| `KVK_SELECTION_SECRET` | Random geheim van minstens 32 tekens |
| `BOEKUNA_DEPLOYMENT_ENV` | `production` |
| `SUPABASE_URL` | Productieproject `vuwfyhtejsxhdfyvkkeq`, automatisch door Supabase |

De productieproject-ID blokkeert testmodus óók bij een fout gelabelde omgeving.
Een fingerprint blokkeert de officiële publieke testkey in productiemodus.
Ontbrekende configuratie geeft 503 en handmatige invoer. Er is geen testfallback.
De productiebuild bevat geen KVK-key, serverendpoint, testdataset of secrets.

### Test/preview config

De geïsoleerde preview gebruikt het aparte entrypoint
`supabase/dev-only/kvk-company-lookup-preview/index.ts`. De drie eigen Vault-secrets
worden versleuteld opgeslagen en alleen door de serverrol gelezen. De configuratie-RPC
is niet uitvoerbaar door `anon` of `authenticated`. De adapter weigert elk ander project.
**Deploy nooit `supabase/dev-only/**` naar productie.**

Frontend-previewbuild: `BOEKUNA_KVK_PREVIEW=true`, `BOEKUNA_DEPLOYMENT_ENV=preview`,
de goedgekeurde testproject-URL en publishable key. Bestaande echte login blijft vereist;
Developer Mode en authenticatiebypass zijn niet ingeschakeld. Een zichtbare badge geeft
fictieve KVK-testdata aan. Productiehosts weigeren die modus ook in de browser.

Preview: [boekuna-kvk-preview.onrender.com](https://boekuna-kvk-preview.onrender.com).
De publishable Supabase-key is openbaar; KVK- en signingsecrets blijven server-side.

## Rate limit en kosten

Migratie: `20261001112135_kvk_company_lookup_budget.sql`.
Counters staan in `private.kvk_lookup_counters`, met RLS en uitsluitend serverroltoegang.
`consume_kvk_lookup_budget` is SECURITY INVOKER; `anon`, `authenticated` en PUBLIC
hebben geen EXECUTE. Alle budgetten worden binnen één transactie gereserveerd met
een globale advisory lock. Databasefouten blokkeren vóór de KVK-aanvraag.

| Budget | Limiet |
|---|---:|
| Zoekacties per gebruiker | 20/minuut en 200/dag |
| Profielacties per gebruiker | 5/minuut en 40/dag |
| Alle acties globaal | 50/seconde en 290.000/kalendermaand |
| Profielen globaal | 1.000/kalendermaand |

Het profielbudget begrenst aanvragen op circa €20/maand bij het gereviewde tarief,
exclusief het abonnement. Ook fouten verbruiken conservatief een reservering.
Counters bevatten geen zoekgeschiedenis en worden na 32 dagen opgeruimd.
Serverbeheerders kunnen maandtotalen per actie uit de private counters volgen;
status, duur en foutfrequentie staan in veilige Edge-logs.

## Relatie-invoer

**Relaties → Nieuwe relatie → Zoek bedrijf via KVK → kies resultaat → controleer/bewerk → Opslaan.**
Dezelfde optionele zoekfunctie is beschikbaar bij bewerken, met bevestiging vóór vervangen.
Debounce 400 ms, abort en versienummers voorkomen late zoek- en profielantwoorden.
De korte profielcache blijft maximaal vijf minuten binnen dezelfde gebruiker/modal;
sluiten, uitloggen en accountwissel verwijderen die cache. Geen zoekcache in browseropslag.

| AUTOFILL FIELDS | Gedrag |
|---|---|
| Naam, KVK-nummer | Officieel profiel; altijd bewerkbaar |
| Straat/huisnummer, postcode, plaats, land | Alleen beschikbare openbare adrescomponenten |
| Vestigingsnummer | Bewaard bij de gekozen vestiging; gewist als KVK-nummer handmatig verandert |
| Bron en ophaaldatum | Kleine metadata bij een expliciete KVK-selectie |
| Type klant/leverancier | Blijft de keuze van de gebruiker |
| FIELDS NOT PROVIDED BY KVK | Contactpersoon, email, telefoon, btw-id en Peppol worden niet afgeleid of gewijzigd |

Openbaar bezoekadres heeft voorrang. Een openbaar correspondentieadres krijgt een
expliciet label. Afgeschermde velden worden nooit gereconstrueerd uit zoekresultaten.
Buitenlandse samengestelde postcode/plaats wordt getoond als informatie voor handmatige
invoer; er wordt geen onbetrouwbare splitsing of Nederlands adres verzonnen.
Onbekende actieve status blijft onbekend. Niet-actieve registraties en vervallen namen
krijgen een aanduiding; een inactief profiel vergt bevestiging vóór overnemen.

Autofill slaat niets op. Wijzigingen tijdens het ophalen worden niet overschreven.
De bestaande `save()`/`save_ledger_state`-keten bewaart de relatie pas na Opslaan.
Bestaande extra relatievelden blijven bij bewerken behouden.

DUPLICATE HANDLING: hetzelfde genormaliseerde 8-cijferige KVK-nummer (spaties/streepjes
genegeerd) waarschuwt en blokkeert een tweede relatie. De gebruiker kan de bestaande
relatie openen. De te bewerken relatie sluit zichzelf uit. Een naam alleen blokkeert niet.

MANUAL FALLBACK: altijd bereikbaar, ook zonder resultaten/configuratie, bij offline/fouten,
internationale relaties en ontbrekende/afgeschermde adressen. Geen leadgenerator,
bulkexport, ongevraagde marketing of automatische zoekactie vanuit OCR.

## Validatie en overdracht

Zie [KVK-COMPANY-LOOKUP-QA.md](KVK-COMPANY-LOOKUP-QA.md) voor uitgevoerde controles en beperkingen.
De PR bevat het exacte HEAD-contract voor eerst **01 — Product + UX/UI** en daarna
**03 — Independent QA + Security**. Geen 04-release of productieactivatie vóór onafhankelijk PASS.

PRODUCTION SUBSCRIPTION REQUIRED: **YES**.
STATUS: **READY FOR QA — PRODUCTION ACTIVATION PENDING KVK SUBSCRIPTION**.
