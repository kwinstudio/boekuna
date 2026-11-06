# Boekuna huisstijl D: Zwart, wit en één punt

Status: **canonical** since 6 November 2026 (Kwin picked D from four directions; the app follows it too).
Replaces the palette in `BRAND-IDENTITY-CANONICAL.md` and `BRAND-GUIDE-v2.md`.

## Idee
Zo kaal mogelijk, zoals Apple. Zwart en wit dragen alles; groen bestaat alleen nog als de punt achter de naam
en als "goed"-kleur (geld binnen, klaar). Rust en precisie zijn het vertrouwenssignaal.

## Logo
- Woordmerk **Boekuna.**: Onest SemiBold (600), letterafstand -0,035 em, als contouren (`public/assets/boekuna-wordmark.svg`).
  Punt in groen `#3DDC84`. Eenkleurig (zwart of wit) mag voor druk en stempels.
- App-icoon: zwart vlak `#0A0A0A`, witte "b" (Onest Bold) met groene punt. Bron `public/assets/boekuna-app-icon.svg`,
  maskable versie met extra marge, favicon met afgeronde hoeken (`boekuna-favicon.svg`).
- Minimale grootte: icoon 16 px, woordmerk 72 px breed. Laat rond het logo minstens de hoogte van de "o" vrij.
- Niet doen: het logo vervormen, kleuren of schaduw toevoegen, de punt een andere kleur geven dan groen, zwart of wit.

## Kleuren
| Rol | HEX |
|---|---|
| Zwart (tekst, knoppen, band) | `#0A0A0A` |
| Grijs (tweede tekst) | `#6E6E73` |
| Lijn | `#E5E5E5` |
| Mist (achtergrond) | `#F5F5F7` |
| Wit | `#FFFFFF` |
| Punt / goed | `#3DDC84` |

Donker: achtergrond `#000000`/`#111111`, vlakken `#1C1C1E`, lijnen `#2C2C2E`, tekst `#F5F5F7`.
De vaste grafiekkleuren blijven: omzet `#63D471`, kosten `#E5534B`, winst `#3B82F6` (dat zijn cijfers, geen merk).

## Letters
- Website: Onest. App: de systeemletter van het apparaat (SF Pro op iPhone), zodat de app voelt als iOS zelf.
- Bedragen altijd met tabelcijfers (`font-variant-numeric: tabular-nums`).

## Toon
- "je", korte zinnen, geen uitroeptekens, bedragen altijd exact.
- Zo kort mogelijk: "Opgeslagen." in plaats van "Gelukt! Je bon is succesvol opgeslagen!".
- Bewust niet: nep-keurmerken, "100% veilig", stockfoto's van handdrukken.

## Bestanden
`/mnt/project-files/logo/boekuna-logo.zip` (woordmerk licht/donker/zwart/wit, app-iconen, favicons).
Rasterbestanden maken: `npm install --prefix tests --no-save sharp@0.33.5 && node scripts/generate-brand-icons.mjs`.
