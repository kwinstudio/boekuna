# Boekuna PWA / app-icon asset specificatie — P2 pre-launch

## Doel
Maak één officiële lichte app-iconfamilie voor iOS, Android/PWA en favicongebruik. Gebruik uitsluitend het officieel aangeleverde **donker marineblauwe losse Boekuna B-symbool** als bron. Het logo zelf mag niet opnieuw getekend, gestileerd, vereenvoudigd, vervormd of van kleur veranderd worden.

## Huidige technische oorzaak
- `kwinest/index.html` gebruikt een transparante 64×64 PNG-data-URI als `apple-touch-icon`. Transparante delen kunnen op iOS als een donkere/zwarte tegel worden weergegeven.
- `public/manifest.webmanifest` verwijst alleen naar `/assets/boekuna-app-icon.svg` met `purpose: "any maskable"`.
- Dat SVG-bestand bevat een blauw gradient B-ontwerp dat niet gelijk is aan de officiële Boekuna B-mark en moet na vervanging niet meer als app-icon worden gebruikt.
- Er bestaan momenteel geen officiële 180×180, 192×192 of 512×512 PNG-appicons in `public/assets/`.
- In de repository is geen service worker aanwezig; stale icons zijn daarom primair browser/iOS icon caching, niet een Boekuna service-worker-cache.

## Bronasset — verplicht
Gebruik de originele, hoogst beschikbare resolutie van het officieel aangeleverde **losse donker marineblauwe Boekuna B-symbool**. Niet upscalen vanuit de huidige 64×64 embedded browser-favicon als een hogere-resolutie bron beschikbaar is.

## Visuele compositie
- Canvas: vierkant.
- Achtergrond: voorkeur `#F7F9FB` (zeer licht Boekuna-oppervlak); `#FFFFFF` is toegestaan indien 09 visueel bevestigt dat dit beter bij de officiële set aansluit.
- Achtergrond moet **volledig opaque** zijn; geen alpha/transparante pixels.
- Symbool: exact officiële donker marineblauwe B-mark; geen gradient, schaduw, outline, glow of andere effecten.
- Geen woordmerk/tekst in het appicoon.
- Geen afgeronde hoeken in het bronbestand bakken; iOS/Android passen zelf hun mask toe.
- Plaats het symbool optisch gecentreerd.
- Voor standaard iconen: symbool mag circa 52–56% van de canvasbreedte/-hoogte innemen.
- Voor maskable: het volledige symbool moet ruim binnen de centrale veilige zone blijven; streef naar maximaal circa 56% van het canvas zodat geen onderdeel bij gangbare masks wordt afgesneden.
- Rustige, professionele uitstraling; ruime lichte marge rondom het symbool.

## Verplichte exports
Plaats als nieuwe, versieerbare bestanden in `public/assets/`:

1. `boekuna-app-icon-180-light-v1.png` — 180×180, PNG, sRGB, opaque.
2. `boekuna-app-icon-192-light-v1.png` — 192×192, PNG, sRGB, opaque.
3. `boekuna-app-icon-512-light-v1.png` — 512×512, PNG, sRGB, opaque.
4. `boekuna-app-icon-maskable-512-light-v1.png` — 512×512, PNG, sRGB, opaque; officiële B binnen mask-safe zone.
5. `boekuna-favicon-32-light-v1.png` — 32×32, PNG, sRGB, opaque.
6. Optioneel master: `boekuna-app-icon-master-1024-light-v1.png` — 1024×1024.

## Visuele acceptatie
- B-mark is pixel-/vormgetrouw aan de officiële logo-asset.
- Geen alternatief B-ontwerp.
- Geen blauw gradient.
- Geen zwarte/donkere achtergrondtegel.
- Geen transparantie in app-icon PNGs.
- Symbool raakt geen mask-safe-zone.
- Op een licht en donker homescreen blijft het icoon rustig en duidelijk herkenbaar.

## 02A implementatie na oplevering assets
Na goedkeuring van 09:
- `kwinest/index.html`:
  - vervang de data-URI `apple-touch-icon` door `/assets/boekuna-app-icon-180-light-v1.png`;
  - vervang faviconlinks door goedgekeurde officiële favicon asset(s);
  - behoud `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-title=Boekuna` en `apple-mobile-web-app-status-bar-style=default`;
  - gebruik een cache-bustende/versioned bestandsnaam.
- `public/assets/marketing.js`:
  - `ensureBookunaFavicon()` mag niet langer dezelfde transparante 64×64 data-URI als `apple-touch-icon` injecteren;
  - gebruik voor Apple touch expliciet het nieuwe 180×180 bestand.
- `public/manifest.webmanifest`:
  - 192 PNG met `purpose: "any"`;
  - 512 PNG met `purpose: "any"`;
  - aparte 512 maskable PNG met `purpose: "maskable"`;
  - verwijder de huidige non-official gradient-SVG als manifesticon;
  - `background_color` blijft licht (`#F7F9FB`);
  - `theme_color` afzonderlijk visueel beoordelen; icon-background mag er niet van afhangen.
- Oude `public/assets/boekuna-app-icon.svg` niet meer als app-icon gebruiken; na verificatie kan het bestand worden verwijderd als het nergens anders nodig is.

## Cache / rollout
Er is geen service worker in de huidige repository. Gebruik nieuwe versie-bestandsnamen zodat Safari/iOS/Chromium niet op dezelfde icon-URL blijven hangen. Voor device-QA:
1. bestaande Boekuna-webapp verwijderen;
2. Safari-tab sluiten;
3. indien nog stale: Safari websitegegevens/cache voor Boekuna wissen;
4. Boekuna opnieuw openen;
5. opnieuw 'Zet op beginscherm';
6. icoon op echt iOS homescreen controleren;
7. Android/Chrome PWA-install eveneens controleren.

## QA evidence vereist
- screenshot echt iPhone-homescreen met nieuwe Boekuna-icon;
- iOS Safari add-to-home flow;
- Android/Chrome geïnstalleerde PWA of launcher-icon;
- manifest-inspectie met 192/512/maskable;
- network check dat alle icon-URLs HTTP 200 leveren;
- geen console/manifest icon warnings.
