# Quitte

Kosten delen met een groep, zonder account en altijd gratis. iOS-app gebouwd met Expo (SDK 58) en Expo Router.

## Wat zit erin (versie 1.0)

- Lijsten, deelnemers zonder account, meedoen via link, code of QR
- Uitgaven, inkomsten en terugbetalingen; gelijk, op bedrag of naar delen verdelen; meerdere betalers
- Saldi met uitleg per persoon, slim verrekenen (zo min mogelijk betalingen), los of alles tegelijk afvinken, ongedaan maken
- Betaalverzoek of herinnering met IBAN via het deelmenu, overzicht en CSV-export delen
- Categorieën (automatisch geraden), zoeken, statistieken, geschiedenis, archiveren, vaste verdeelsleutels
- Offline-wachtrij met automatische synchronisatie en live updates
- Nederlands en Engels, donkere modus, VoiceOver-labels, trillingsfeedback

## Ontwikkelen

```sh
npm ci
npm test          # rekenlogica (verdelen, saldi, verrekenen, offline wachtrij)
npm run typecheck
npx expo start
```

## Backend

Supabase-project `kwinest`, tabellen `quitte_*` (zie `supabase/migrations`). De tabellen zijn niet direct leesbaar.
Alles loopt via `SECURITY DEFINER`-functies die de geheime lijstcode vereisen; de code staat alleen als SHA-256-hash in de database.

## Naar TestFlight

Workflow `.github/workflows/quitte-ios.yml` (in kwinstudio/boekuna, branch `claude/quitte`), dezelfde route als Fotoswipe en Lootjes:
cloud-Mac → tests → `expo prebuild` → archive met automatische signering via de App Store Connect API-sleutel → upload →
build in de interne TestFlight-groep "Kwin test". De bundle-ID wordt automatisch geregistreerd; het app-record in App Store Connect moet één keer bestaan.
