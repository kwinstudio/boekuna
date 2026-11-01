# DenkNote

Minimalistische iPhone-notitieapp met een AI-denkpartner. Twee modi per notitie:

- **Stil** — geen automatische AI. Alleen als je op **Denk mee** drukt.
- **Meedenkend** — na **Gereed** maximaal één nieuwe suggestieset (vraag, vervolgstap, max. 2 verwante notities), alleen als de inhoud betekenisvol is gewijzigd.

De AI past de notitietekst nooit aan; suggesties staan eronder en zijn weg te klikken.

## Stack

Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router · Supabase Auth/Postgres/Edge Functions · OpenAI Responses API (`gpt-5.6-sol`, JSON-schema) · OpenAI embeddings (`text-embedding-3-small`, 1536 dim.) · pgvector (HNSW, cosine).

## Structuur

```
denknote/
  src/app/                 schermen (Expo Router)
    welcome.tsx, auth.tsx, auth-callback.tsx
    (tabs)/notes.tsx       notitieoverzicht + zoeken
    (tabs)/actions.tsx     acties (Open / Afgerond)
    (tabs)/settings.tsx    instellingen
    note/[id]/index.tsx    editor, modi, Gereed/Denk mee, suggesties, verbanden
    note/[id]/chat.tsx     AI-sparringpartner
  src/lib/                 store (offline-first sync), api, theme, types
  src/components/ui.tsx    UI-bouwstenen
  supabase/migrations/     SQL (tabellen dn_*, RLS, serverfuncties)
  supabase/functions/      dn-analyze-note, dn-chat-note, dn-refresh-note-embedding (+ _shared)
  supabase/tests/          RLS-/accountscheidingstest (SQL)
  tests/                   unit-tests (AI-logica, validatie, sync/autosave, versieconflicten)
  scripts/asc.mjs          App Store Connect-hulp voor TestFlight
```

## Backend

Supabase-project **kwinest** (`vuwfyhtejsxhdfyvkkeq`), strikt geïsoleerde tabellen met prefix `dn_`:
`dn_profiles`, `dn_notes`, `dn_ai_messages`, `dn_ai_suggestions`, `dn_tasks`, `dn_note_embeddings`, `dn_rate_events`.
Er zijn geen tabellen van andere apps aangepast.

Beveiliging:
- RLS op alle tabellen; gebruikers zien en wijzigen alleen eigen rijen.
- Kolomrechten: de client kan `user_id`, `content_version`, `last_analyzed_*` niet zetten (versies bepaalt een trigger).
- Embeddings en verzoeklimieten zijn niet door de client te lezen.
- `dn_match_notes` haalt de gebruiker uit de JWT (`auth.uid()`), nooit uit een parameter, en geeft niets zonder toestemming (`allow_related`).
- `dn_store_suggestion` bewaart alleen bestaande notitie-ID's van dezelfde gebruiker en weigert resultaten voor een oudere versie dan al opgeslagen.
- `dn_upsert_embedding` vervangt een embedding alleen door een nieuwere versie.
- OpenAI-sleutel staat alleen in de Edge Function-secrets (`OPENAI_API_KEY`).

Edge Functions (verifiëren zelf de JWT; `verify_jwt=false` op de gateway):
| Functie | Doel | Limiet |
|---|---|---|
| `dn-analyze-note` | suggesties na Gereed (`trigger: done`) of Denk mee (`manual`) | 20/uur, 120/dag |
| `dn-chat-note` | één chatbeurt; bewaart vraag + antwoord | 40/uur, 250/dag |
| `dn-refresh-note-embedding` | embedding vernieuwen (alleen met toestemming en bij gewijzigde inhoud) | 120/uur |

`GET` op een functie geeft een gezondheidscheck (`ai_configured`).

### Deployen

```bash
cd denknote
supabase link --project-ref vuwfyhtejsxhdfyvkkeq
supabase db push                      # of de SQL uit supabase/migrations uitvoeren
supabase functions deploy dn-analyze-note --no-verify-jwt
supabase functions deploy dn-chat-note --no-verify-jwt
supabase functions deploy dn-refresh-note-embedding --no-verify-jwt
```

## Lokaal

```bash
npm install
npm test            # unit-tests
npx tsc --noEmit    # typecheck
npx expo start      # Expo Go / dev build
```

RLS-test: voer `supabase/tests/rls_isolation.sql` uit in de Supabase SQL-editor. De test draait in één transactie die altijd wordt teruggedraaid en meldt `DENKNOTE_RLS_RESULT: PASS (n checks)` of de mislukte checks.

## Offline en autosave

Elke toetsaanslag wordt direct lokaal bewaard (AsyncStorage) en na ~1,2 s naar Supabase gestuurd. Zonder internet blijft de notitie lokaal staan (“Lokaal bewaard”) en wordt later opnieuw verstuurd (oplopende wachttijd, en bij terugkeren naar de app). Lokale, nog niet verstuurde tekst wint altijd bij het ophalen, zodat er niets verloren gaat. Bewerkingen tijdens een lopende push worden niet overschreven.

## iOS / TestFlight

Workflow: `.github/workflows/denknote-ios.yml` (cloud-Mac, zelfde route als Quitte).

- Elke push naar `claude/denknote` → tests, typecheck, geheimencontrole van de bundel, `expo prebuild` en een **simulator-build** (geen signing, geen upload).
- Uploaden naar TestFlight gebeurt **alleen** met `[denknote-testflight]` in het commitbericht of handmatig (`upload=true`). De build gaat naar de interne groep “Kwin test”, nooit naar App Review.

Bundle ID: `nl.zichtwerf.denknote`.

### Openstaande stappen (handwerk)

1. **App-record in App Store Connect aanmaken** (Apps → + → bundle ID `nl.zichtwerf.denknote`, naam DenkNote). Dit kan alleen via de website. De bundle ID wordt bij de eerste upload-run geregistreerd.
2. **Redirect-URL toevoegen** in Supabase → Authentication → URL Configuration: `denknote://auth-callback`. Zonder dit stuurt de bevestigingsmail naar de standaard Site URL van kwinest.
3. **Accountverwijdering voor de App Store**: de app verwijdert alle DenkNote-gegevens, maar niet het (gedeelde) Supabase-account. Voor publicatie in de App Store moet volledige accountverwijdering erbij (Apple-richtlijn 5.1.1(v)); voor interne TestFlight is dit geen blokkade.

## Buiten scope (MVP)

Social/gedeelde notities, betaalmuur, webdashboard, autonome AI-acties, spraak, pushmeldingen.
