# BOEKUNA — KVK-bedrijfszoeker: audit en implementatieontwerp

Datum: 1 oktober 2026. Repository: `kwinstudio/boekuna`.

**Status: BLOCKED_BY_OPEN_PR_COLLISION — audit afgerond, implementatie niet gestart.**

Dit document bevat het onderzochte ontwerp, geen geïmplementeerde feature. De drie geslaagde KVK-testcalls hieronder zijn uitsluitend een controle van de externe testomgeving. Zij zijn geen backend-, browser-, security- of onafhankelijke QA van BOEKUNA.

## 1. Actuele source of truth en collision

De actuele `main` is via GitHub en `git ls-remote` gecontroleerd en lokaal uitgecheckt op:

`8b4c17859aff07bcce6fbc3f02117074571a1e5c`

Dit is de merge van PR #111, gemerged op 1 oktober 2026 om 12:29:48 Amsterdam. De QA-fix voor de gegenereerde logout en de toegankelijke mobiele tabelheaders is dus onderdeel van deze auditbasis. Eerdere branches op `aa7ae781...` zijn geen implementatiebasis voor de KVK-feature.

Er is bij de controle geen open PR gevonden met een actuele cleanup-, modularization-, UX-refinement- of Relations-redesign-titel. Er zijn wel vijf oudere, nog open PR's met wijzigingen in dezelfde appbron. Leeftijd of draft-status bewijst niet dat een PR veilig genegeerd kan worden.

| PR | Onderwerp | Status bij audit | Wijzigingen in `kwinest/index.html` |
| --- | --- | --- | --- |
| [#69](https://github.com/kwinstudio/boekuna/pull/69) | Marketing rebuild | Open, draft | +110 / −12 |
| [#57](https://github.com/kwinstudio/boekuna/pull/57) | Google login / Gmail | Open, draft | +14 / −4, auth raakt dezelfde bron |
| [#55](https://github.com/kwinstudio/boekuna/pull/55) | Marketing recovery | Open | +139 / −103 |
| [#18](https://github.com/kwinstudio/boekuna/pull/18) | Marketing zonder screenshots | Open | +138 / −102 |
| [#15](https://github.com/kwinstudio/boekuna/pull/15) | Marketing visuals | Open, draft | +147 / −108 |

De opdracht bepaalt: **“Als een actieve PR hetzelfde bestand substantieel aanpast: NIET parallel dezelfde source wijzigen.”** Audit en backend/API-ontwerp mogen doorgaan; app-source implementatie moet wachten. De nog open overlap wordt daarom als onopgeloste collision behandeld. De PR's zijn niet gemerged, gesloten of gewijzigd door deze audit.

Alleen deze documentatie mag op de aparte branch `docs/kvk-company-lookup-audit-20261001` worden vastgelegd. De featurebranch `feature/kvk-company-lookup` wordt pas vanaf opnieuw gecontroleerde, actuele `main` gemaakt nadat de overlap is afgehandeld of de opdrachtgever expliciet heeft vastgesteld dat de oude PR's niet meer actief zijn.

## 2. Huidige app- en backendarchitectuur

Onderzocht op de bovenstaande SHA:

- `kwinest/index.html`: `renderContacts`, `newContact`, `editContact`, `saveContact`, `modal`, `closeModal`, `save`, `queueCloudSave`, `performCloudStateSync`, `syncCloudStateNow` en `hydrateCloudAccount`.
- Relaties zijn `state.contacts` in dezelfde administratie. Type is `customer` of `supplier`. De gebruiker bepaalt dit type.
- `saveContact` valideert het bestaande formulier, schrijft naar `state.contacts`, maakt een audit-event en gebruikt de bestaande `save()`-route. Cloudsync schrijft de tenantgebonden `ledger_state` via `save_ledger_state` met een verwachte versie. Er is geen aparte relations-datastore.
- Huidige contactvelden: `id`, `type`, `name`, `contactPerson`, `email`, `phone`, `kvk`, `vat`, `peppolId`, `address`, `postal`, `city`. Land en vestigingsnummer bestaan nog niet als formulierinputs. De JSON-administratie kan optionele contactvelden dragen; voeg uitsluitend deze twee toe wanneer de implementatie ze werkelijk gebruikt en bewaart.
- Supabase Edge Functions gebruiken Deno, `createClient`, bearer-auth en `auth.getUser()`. `document-processing` controleert ook MFA-assurance. Daaruit volgt het auth-patroon voor deze functie; Developer Mode is geen vervanging voor een echte user-session.
- `financial-automation` heeft een server-only, atomische rate-limit-RPC met `api_usage`. De RPC is alleen uitvoerbaar door `service_role` en telt per uur. Dat mechanisme is een bruikbaar patroon, maar biedt op zichzelf geen KVK-dagbudget of wereldwijd kostenplafond.
- Productieproject: `vuwfyhtejsxhdfyvkkeq`. Een read-only schema-inspectie bevestigt `api_usage` en `ledger_state`; er is geen `public.contacts`-tabel. Er zijn geen klantrecords gelezen en geen productie-DDL of datamutaties uitgevoerd.
- Een apart bestaand Supabase-project `ozisiotrzeubwbffnxyr` is beschikbaar als kandidaat/testproject. Dit is nog niet voor KVK ingesteld. Geen betaald project of databasebranch aanmaken voor deze feature.
- `scripts/build-app.mjs` maakt de app-only `dist/app`. De productiebuild bevat een uitgeschakelde Developer Mode. Preview met Developer Mode vereist een expliciet ander Supabase-project.
- `.github/workflows/boekuna-app.yml` bevat Chromium en WebKit, inclusief gegenereerde surface/logout-tests. `boekuna-backend.yml` bevat backend-, tenant- en financiële regressies. Nieuwe KVK-testpaden moeten in de relevante CI-scopes worden toegevoegd.
- Er is op deze basis geen `supabase/config.toml` en geen Render Blueprint in de repository. Maak straks een gerichte function-config; verander bestaande functions niet.
- Read-only Render-controle bevestigt `boekuna-split-app-preview` op `main`, build `node scripts/build-app.mjs`, publish `dist/app`; `boekuna-split-marketing-preview` op `main`, build `node scripts/build-marketing.mjs`, publish `dist/marketing`. De oude gecombineerde `boekuna-boekhouding` volgt ook `main`. Op alle drie staat auto-deploy momenteel uit. Hun custom-domainkoppelingen zijn in deze audit niet opnieuw via Render gecontroleerd. Er is geen service aangemaakt of aangepast.

## 3. Officiële KVK-documentatie

Gecontroleerd op 1 oktober 2026:

| Onderdeel | Actuele officiële documentatie / bevinding |
| --- | --- |
| Zoeken | [API-referentie](https://developers.kvk.nl/documentation/zoeken-api); endpoint `/api/v2/zoeken`; opgehaalde OpenAPI `api_zoeken.yaml` vermeldt versie `2.1.0` |
| Basisprofiel | [API-referentie](https://developers.kvk.nl/documentation/basisprofiel-api); endpoint `/api/v1/basisprofielen/{kvkNummer}`; opgehaalde OpenAPI `api_basisprofiel.yaml` vermeldt versie `1.5.0` |
| Vestigingsprofiel | [API-referentie](https://developers.kvk.nl/documentation/vestigingsprofiel-api); endpoint `/api/v1/vestigingsprofielen/{vestigingsnummer}`; opgehaalde OpenAPI vermeldt versie `1.4.0` |
| Gratis test | [Testomgeving](https://developers.kvk.nl/documentation/testing); endpoints hebben `/test/api/`; authenticatie via server-side `apikey`-header; data is fictief |
| Kosten | [Tarieven](https://developers.kvk.nl/nl/pricing): €6,40 per maand, Zoeken €0 per call, Basisprofiel en Vestigingsprofiel ieder €0,02 per call; btw-vrij |
| Platformlimieten | [Officiële FAQ](https://developers.kvk.nl/faq/apis): maximaal 100 requests/seconde en 300.000 requests/maand. BOEKUNA stelt veel lagere eigen limieten |
| Voorwaarden | [Huidige voorwaarden en documenten](https://developers.kvk.nl/nl/terms-of-use). De huidige gekoppelde algemene voorwaarden zijn in gebruik sinds 1 januari 2021 en bevatten een voetnoot over opschorting van artikelen 5.2, 5.4 en 5.6. Oudere API-voorwaarden uit 2018 zijn niet als actuele overeenkomst gebruikt |
| Supabase | Changelog-index en [bearer-/JWT-documentatie](https://supabase.com/docs/guides/functions/auth-headers) gecontroleerd; bestaand `auth.getUser()`-patroon kan behouden blijven |

De huidige voorwaarden behandelen persoonsgegevens, NMI, persoonlijke identificatiemiddelen en gebruik voor meerdere klanten. Dit ontwerp bewaart alleen de gekozen relatiegegevens, biedt geen marketing-/bulkfunctie en deelt geen API-key. Bij de latere abonnementsovereenkomst moet het beoogde gebruik binnen BOEKUNA voor meerdere klantadministraties expliciet worden beoordeeld. Deze audit stelt niet vast dat dat gebruik verboden of automatisch toegestaan is; er is geen overeenkomst aangegaan.

## 4. Drie echte gratis upstream-testcalls

Uitgevoerd vanaf 12:47 Amsterdam op 1 oktober 2026, met de officiële publieke testkey alleen in het geheugen van het testproces. De key en volledige responses zijn niet vastgelegd in deze branch.

| Call | HTTP | Waarneming | Tijd vanaf deze werkomgeving |
| --- | --- | --- | --- |
| `GET /test/api/v2/zoeken?naam=test&resultatenPerPagina=5&pagina=1` | 200 | 5 resultaten; upstream totaal 9 | 9.228 ms |
| `GET /test/api/v1/basisprofielen/69599084?geoData=false` | 200 | Basisprofiel, embedded hoofdvestiging/eigenaar en adresvelden | 6.864 ms |
| `GET /test/api/v1/vestigingsprofielen/000038509504` | 200 | Vestigingsprofiel voor dezelfde fictieve inschrijving; eigen vestigingsnummer en adressen | 8.525 ms |

Dit zijn drie testcalls en **nul productie-KVK-calls**. De tijden bevatten netwerk/proxy-overhead in de werkomgeving; zij zijn geen gemeten Supabase-serverlatentie. Een begrensde server-timeout en bruikbare handmatige fallback blijven noodzakelijk.

Belangrijke observaties: naamzoeken geeft niet automatisch huisnummer/postcode; de vijf testresultaten bevatten geen `actief`. Ontbrekende status moet dus `null` blijven en mag niet als `true` worden voorgesteld. Het adresmodel is genest onder `adres.binnenlandsAdres` of `adres.buitenlandsAdres`. Profieladressen hebben daadwerkelijk `indAfgeschermd`.

## 5. Voorgesteld servercontract

Dedicated functie: `supabase/functions/kvk-company-lookup/index.ts`. POST JSON, maximaal 2 KiB. Geen browserrequests rechtstreeks naar KVK. Het onderstaande contract is een ontwerp, nog geen deployed API.

Zoekrequest:

```json
{"action":"search","query":"Voorbeeldbedrijf","place":"Rotterdam","page":1}
```

`place` is optioneel. Naamquery: 3–120 tekens, trim en normaliseer spaties, weiger controltekens en ongeldige typen. Een uitsluitend numerieke query vereist exact 8 cijfers en gebruikt `kvkNummer`; nooit een onvolledig nummer als bedrijfsnaam versturen. Plaats maximaal 80 tekens. Pagina 1–3, 10 resultaten per pagina. Geen browsergestuurde upstream-URL, API-mode, key of onbegrensde paginatie.

Succesresponse:

```json
{
  "ok":true,
  "mode":"production",
  "data":{
    "results":[{
      "kvkNumber":"12345678",
      "establishmentNumber":null,
      "name":"Voorbeeldbedrijf",
      "city":"Rotterdam",
      "postalCode":null,
      "street":null,
      "houseNumber":null,
      "type":"rechtspersoon",
      "active":null,
      "expiredName":null,
      "selectionToken":"opaque-short-lived-user-bound-token"
    }],
    "page":1,
    "hasMore":false
  }
}
```

Deze voorbeeldnaam en dit voorbeeldnummer zijn contractillustraties, geen fixture voor de productieapp. Alle scalars worden gecontroleerd op type en lengte; ontbrekende waarden worden `null`. Raw `links`, eigenaargegevens, NMI, SBI, geodata en personeelsgegevens verlaten de functie niet.

Profielrequest na een bewuste selectie:

```json
{"action":"profile","selectionToken":"opaque-short-lived-user-bound-token"}
```

De server tekent de genormaliseerde selectie met HMAC, user-ID, mode, KVK-nummer, eventueel vestigingsnummer, relevante geselecteerde naam, `active`/vervallen naam en een vervaltijd van 5 minuten. Hiervoor dient een aparte server-secret. Valideer handtekening, gebruikersbinding, mode en expiry vóór een detailcall. Zonder geldige selectie geen opvraging van willekeurige KVK-nummers. Een token is een beperkte selectiebevoegdheid, geen bewijs dat een bedrijf actief is.

Een selectie start **maximaal één** passende detailcall:

- Hoofdvestiging of rechtspersoon: Basisprofiel, zonder extra vestigingenlijst of geodata.
- Specifieke nevenvestiging: Vestigingsprofiel voor dat vestigingsnummer. Controleer dat `kvkNummer` en `vestigingsnummer` met de getekende selectie overeenkomen. Een nevenvestiging vervangen door het hoofdadres is onjuist.
- Geen beschikbaar profiel of adres: fout/ontbrekende velden tonen; nooit automatisch een andere vestiging opvragen of invullen.

Profielresponse heeft `kvkNumber`, `establishmentNumber`, `name`, `tradeNames`, `address`, `postalCode`, `city`, `country`, `active`, `addressShielded`, `addressType` en `retrievedAt`. De details hoeven niet te worden opgehaald voor elk zoekresultaat. Een buitenlandse gecombineerde postcode/plaats wordt niet op basis van gokken gesplitst.

## 6. Security, omgevingen en kosten

Voor de implementatie:

1. Platform JWT-verificatie aan voor deze gebruikersfunctie. Daarnaast `auth.getUser()` op de bearer-token, geen anonieme Supabase-user, en bestaande MFA-assurance respecteren. User-ID komt uitsluitend uit gevalideerde auth. Auth-fout: geen KVK-call. Geen wijziging van login/signup/logout.
2. CORS: alleen exacte verwachte origins; productie minimaal `https://app.boekuna.nl`. Preview-origins alleen expliciet in de niet-productieconfig, geen wildcard-hosts. Afwijkende aanwezige `Origin` actief weigeren; OPTIONS voor een toegestane origin vereist geen bearer. Ontbrekende Origin bij servercalls is geen auth-vrijstelling.
3. Voorgestelde secrets: `KVK_LOOKUP_ENABLED`, `KVK_API_MODE`, `KVK_API_KEY`, `KVK_SELECTION_SECRET`, `KVK_PREVIEW_ORIGINS`. Allemaal server-side. Default is uitgeschakeld; ontbrekende/ongeldige config geeft 503 en handmatige invoer.
4. Testmode alleen als de server aantoonbaar op een expliciet toegestaan niet-productie-Supabase-project draait en geen productieorigin bedient. `vuwfyhtejsxhdfyvkkeq` moet testmode altijd weigeren, ook bij verkeerde env-labels. Productie met ontbrekende key gebruikt nooit het testendpoint. Geen browserparameter kan deze keuze wijzigen.
5. Productie mag de officiële publieke testkey niet als geldige productiekey accepteren. Testkey, productiekey en signing-secret mogen niet in `dist/app`, frontend-env, lokale opslag, PR of logs staan. Frontend ontvangt alleen genormaliseerde data en de gevalideerde mode voor een fictieve-data-label in preview.
6. Atomische per-user limieten via het bestaande `api_usage`-patroon: voorstel search 20/minuut en 200/dag; detail 5/minuut en 40/dag. Waarden komen van de server. Voeg een eigen service-only RPC toe, verander de financiële RPC niet. Geen alleen-in-memory limiter voor gedistribueerde Edge Functions.
7. Een gedeeld, atomisch detailbudget voorkomt onbeperkte kosten over veel accounts heen. Voorstel initieel maximaal 1.000 detailcalls per maand en een beperkte globale request-rate onder KVK's platformmaximum. Gebruik uitsluitend tellerdata, geen gedeelde KVK-databank. Een dedicated private teller met RLS, expliciete grants en een service-only RPC is nodig als `api_usage` met user-FK hiervoor niet geschikt is. Bij storage-/RPC-fouten: fail closed, nul upstream-calls. Het budget wordt vóór externe calls gereserveerd, ook bij fouten; geen automatische refund of retry die het plafond kan omzeilen.
8. Server-timeout: 8 seconden inclusief response-body lezen; begrens ook upstream-bodygrootte. Geen automatische retry van betaalde detailcalls. Map 401/403, 404, 429, 5xx, JSON/schemafouten en timeout naar veilige eigen foutcodes. Volg geen door KVK-response aangedragen URL's.
9. Clientcache: alleen genormaliseerde profielen in geheugen van de huidige gebruiker en de huidige modal-flow, maximaal 5 minuten. Dedupliceer in-flight selectiecalls. Wis bij modal sluiten, handmatige mode, logout en gebruikerswissel. Geen `localStorage`/`sessionStorage`-zoekgeschiedenis of cross-user profielcache.
10. Logging bevat action, upstream-api, HTTP-status, latency, cachehit, errorcategorie en request-reference; geen query, adres, hele response, bearer of key. Bij een cachehit is upstream-callcount nul. Geen apart billingdashboard.

De nieuwe teller/RPC wordt eerst in een lokale of geïsoleerde testdatabase gebouwd, met actuele CLI-help en `supabase migration new`. Geen productie-migratie uitvoeren tijdens de featurebouw. Advisors en concurrentietests zijn onderdeel van de latere verificatie, geen afgeronde checks in deze audit.

## 7. Relatie-UX en gegevensregels

Voeg boven het huidige formulier in **Nieuwe relatie** een compacte `Zoek bedrijf`-sectie toe, met label `Bedrijfsnaam of KVK-nummer` en een zichtbare actie `Handmatig invoeren`. De bestaande inputs en `Opslaan` blijven bruikbaar bij ontbrekende config of externe fouten. Bij bewerken is zoeken een expliciete aanvullende actie, geen automatische overschrijving.

Debounce 400 ms, minimaal 3 tekens bij bedrijfsnamen. Combineer AbortController met een oplopend requestnummer en user/modal-binding: oude search- of profielresponses mogen een nieuwere query, een bewerkt formulier, handmatige mode, gesloten modal of een ander account niet wijzigen.

Resultaten zijn een semantische lijst met echte buttons: bedrijfsnaam, beschikbaar straat/plaats, KVK en desgewenst vestigingstype. `actief=nee` wordt `Uitgeschreven` met expliciete bevestiging vóór de detailcall. Ontbrekende status blijft onbekend. Toon een vervallen naam wanneer de match daarop gebaseerd is. Gebruik geen KVK-logo zonder toestemming.

Na selectie worden uitsluitend naam, KVK, beschikbaar adres, postcode, plaats en eventueel land ingevuld. Formulierinputs blijven bewerkbaar. Een afgeschermd bezoekadres wordt niet uit zoekdata gereconstrueerd. Geef een duidelijk aangegeven, niet-afgeschermd correspondentieadres alleen wanneer dat als relatieadres geschikt is; anders adres leeg en handmatig aanvullen. Normaliseer huisnummer, huisletter, huisnummertoevoeging en toevoegingAdres zonder verlies of `undefined`.

Contactpersoon, e-mail, telefoon, btw-id en Peppol ID worden niet uit KVK afgeleid. Reeds door de gebruiker ingevulde niet-KVK-velden blijven behouden. De keuze klant/leverancier wordt nooit door KVK aangepast. Bij bestaande ingevulde bedrijfsvelden vraagt een bewuste herselectie om bevestiging van vervanging; geen stille combinatie van het oude adres met een nieuw bedrijf.

Toon na autofill `Bedrijfsgegevens ingevuld` en `Gegevens uit KVK ingevuld. Controleer ze voor je opslaat.` Selectie slaat geen relatie op. Alleen de bestaande Opslaan-flow doet dat.

Controleer vlak vóór opslaan het genormaliseerde KVK-nummer binnen de huidige tenant, met uitsluiting van het huidige edit-ID. Bij een bestaande onderneming: `Deze onderneming staat al in je relaties.` en `Open relatie`. Geen stille tweede relatie; geen blokkade op naam alleen. Een getekend KVK-selectietoken is nooit een sleutel naar een andere tenantrelatie. De bestaande cloudversie-/conflictflow blijft authoritative.

Toegankelijkheid: echte inputlabels, list/buttons, status/live-region, geselecteerde toestand en zichtbare focus. Tab/Shift+Tab/Enter werken; Escape sluit eerst zoekresultaten en brengt focus terug naar de zoekinput. Bij 320 px moeten namen volledig wrappen en touch targets passend blijven. Geen algemene modal- of apprefactor.

## 8. Test- en handoffplan na opheffen collision

| Check | Vereiste bewijslast | Nu |
| --- | --- | --- |
| Backendcontract | Search/profile/empty/invalid-input, schema-validatie, adresnormalisatie, afgeschermd, inactief, vervallen naam, branch-identiteitsmismatch | Niet geïmplementeerd/getest |
| Auth/CORS | Missing/expired/deleted/anonymous user, MFA, afwijkende origin, preflight; nul upstream-calls bij weigering | Niet uitgevoerd |
| Selectiebevoegdheid | Verlopen/gewijzigd/cross-user/cross-mode token, arbitrary KVK, oversized request | Niet uitgevoerd |
| Rate en budget | Per-user/dag/globaal, gelijktijdige laatste slot, RPC unavailable; fail closed over meerdere workers | Niet uitgevoerd |
| Upstreamfouten | 401/403/404/429/5xx/timeout/malformed/body te groot; geen raw foutdata of automatische betaalde retry | Niet uitgevoerd |
| Omgevingsguard | Productie zonder secret; testmode op productieproject; testkey als productiekey; geen fictieve fallback | Niet uitgevoerd |
| Leakscan | Werkelijke `dist/app` plus browserbundles: geen KVK-keys/signing-secret/testendpoint; serversecret niet in response/log | Niet uitgevoerd voor nieuwe feature |
| Journey | Gegenereerde app: Relaties → nieuw → zoeken → selecteren → edit → typekeuze → save → reopen/cloudsync → factuurklant | Niet uitgevoerd |
| Duplicates/fallback | Bestaand KVK, geen name-only blokkade, KVK500/missing config/buitenland, handmatig save | Niet uitgevoerd |
| Races/cache | Snelle querywissel, selectiewissel, handmatig tijdens detailcall, modal close, accountwissel, dubbele selectie | Niet uitgevoerd |
| Responsive/a11y | 320/360/375/390/393/430/768/820/1024/1280/1440; geen globale overflow, toetsenbord, screenreader-semantiek | Niet uitgevoerd |
| Browsers | De volledige journey en races in Chromium én WebKit, inclusief echte generated artifact | Niet uitgevoerd |
| Regressies | Bestaande Relaties/cloudsync, invoice/customer, accounting, auth, Developer Mode, split build en CI scopes | Niet uitgevoerd voor nieuwe feature |
| Officiële integration | Expliciete opt-in tegen gratis testomgeving, plus BOEKUNA-endpoint in geïsoleerde preview; geen productioncalls in CI | Alleen de drie upstream-auditcalls hierboven |

Vervolgvolgorde:

1. Command Center handelt de open overlappende PR's af of stelt expliciet vast dat zij niet actief zijn. Geen merge van deze oude PR's alleen om KVK te deblokkeren.
2. Haal nieuwe `main` op, controleer SHA/recent merges/open PR's opnieuw en maak dan de geïsoleerde featurebranch.
3. Backendcontract + mocked tests eerst; daarna een begrensde officiële testintegration. Bouw UI pas op de nieuwe mainbasis.
4. Voeg fixtures voor branch, shielded, inactive en missing status toe; test de daadwerkelijke gegenereerde app. CI doet geen betaalde KVK-calls.
5. Maak geïsoleerde preview met echte Supabase-auth, expliciete testconfig en fictieve-data-indicator. Productieconfig niet veranderen.
6. Lever eerst korte UX-review aan **01**, daarna exact final feature-HEAD aan **03**. Deze documentatie-HEAD is geen QA-approved feature-HEAD.
7. Alleen bij onafhankelijk PASS naar **04**. Productieactivatie vereist daarnaast expliciet akkoord met abonnement, juiste overeenkomst, veilige serversecret, productionmode en enkele gecontroleerde live calls. Geen deploy van `supabase/dev-only/**`.

## 9. Final report voor deze auditfase

| Veld | Resultaat |
| --- | --- |
| BASE MAIN SHA | `8b4c17859aff07bcce6fbc3f02117074571a1e5c` |
| BRANCH | `docs/kvk-company-lookup-audit-20261001`, documentatie; featurebranch nog niet gemaakt |
| HEAD | Auditbasis hierboven; documentatiecommit vermeld in de draft-PR; geen feature-HEAD |
| OPEN PR COLLISION CHECK | Open overlap #15/#18/#55/#57/#69; runtime/appbron wacht |
| KVK DOC VERSION / CHECK DATE | 2026-10-01; Zoeken API v2 / OpenAPI 2.1.0; Basisprofiel API v1 / OpenAPI 1.5.0; Vestigingsprofiel API v1 / OpenAPI 1.4.0 |
| EDGE FUNCTION | Ontworpen als `kvk-company-lookup`, nog niet gemaakt/deployed |
| AUTH / CORS / RATE LIMIT | Ontwerp hierboven, nog niet als feature getest |
| SEARCH API | Officiële Zoeken v2, gratis testcall HTTP 200 |
| PROFILE API | Officiële Basisprofiel v1 en Vestigingsprofiel v1, gratis testcalls HTTP 200 |
| TEST ENVIRONMENT | Drie upstream-auditcalls geslaagd; BOEKUNA-preview nog niet gebouwd |
| PRODUCTION CONFIG | Niet gewijzigd; geen key ingesteld/aangevraagd, geen abonnement aangekocht |
| RELATION UI / AUTOFILL FIELDS | Bestaande flow geaudit; geplande velden naam/KVK/adres/postcode/plaats/land; UI nog niet gebouwd |
| FIELDS NOT PROVIDED BY KVK | Contactpersoon/e-mail/telefoon/btw-id/Peppol niet afleiden |
| DUPLICATE HANDLING / MANUAL FALLBACK | Ontworpen; niet geïmplementeerd/getest |
| MOBILE / ACCESSIBILITY | Testmatrix vastgelegd; niet getest voor nieuwe feature |
| SECRET LEAK TEST / BACKEND TESTS | Nieuwe-featurecheck niet uitgevoerd; document bevat geen keys, tokens of volledige KVK-responses |
| CHROMIUM / WEBKIT / REGRESSION | Niet uitgevoerd voor nieuwe feature; geen PASS geclaimd |
| COST CONTROL | Maximaal één passend detailprofiel na selectie, user-token, atomische limieten en globaal budget ontworpen |
| KNOWN ISSUES | Onopgeloste bronoverlap; geen implementatie/preview; custom-domainkoppelingen niet opnieuw gecontroleerd |
| PRODUCTION SUBSCRIPTION REQUIRED | YES, na testimplementatie en onafhankelijke QA; contractgebruik beoordelen |
| STATUS | **BLOCKED_BY_OPEN_PR_COLLISION — geen READY FOR QA** |

Er zijn geen runtime-, auth-, financiële, documentprocessor- of billingwijzigingen aangebracht. Er is geen productie-release uitgevoerd. De implementatie kan na afhandeling van de collision volgens dit ontwerp vanaf de dan actuele main doorgaan.
