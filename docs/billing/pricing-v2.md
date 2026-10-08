# Boekuna Pricing V2

Status: 8 oktober 2026. Geïmplementeerd in deze PR, nog niet in productie.
Bron van waarheid voor bedragen: `supabase/functions/_shared/pricing.mjs`.

## 1. Pakketten en prijzen (incl. btw)

Sinds 8 oktober 2026 zijn alle bedragen inclusief 21% btw (besluit Kwin). Stripe-prijzen hebben `tax_behavior=inclusive`; Stripe Tax haalt de btw uit het bedrag op de factuur. Daarvoor moet in Stripe Tax de registratie voor Nederland aan staan.

| Pakket | Per maand | Per jaar (vooruit) | Besparing | Gemiddeld p/m bij jaar | Verkoopbaar |
|---|---:|---:|---:|---:|---|
| Start | € 0 | € 0 | — | — | ja, gratis, geen Stripe |
| ZZP | € 9,95 | € 99,50 | € 19,90 | ≈ € 8,29 | **ja** |
| Pro | € 19,95 | € 199,50 | € 39,90 | ≈ € 16,63 | **ja** |
| Business | € 34,95 | € 349,50 | € 69,90 | ≈ € 29,13 | nee, verborgen concept |

- Jaar = precies 10 × maand, 12 maanden toegang, korting 16,67 % (afgerond 17 %).
- Bedragen zijn hele centen in de servercode. De frontend stuurt alleen `plan` en `interval`; de server bepaalt het bedrag.
- Jaarbetaling wordt in één keer vooraf geïncasseerd, niet in maandtermijnen.
- Geen trials, geen gratis betaalperiodes, geen Early Access / First-100 (blijft beëindigd).

## 2. Bestaande functies en pakketindeling

Besluiten van Kwin (8 oktober): alleen functies die nu in productie werken, niets nieuws bouwen; drie abonnementen; huidige functies verdelen; ZZP krijgt een documentlimiet en Pro niet. Bron: `kwinest/index.html`, `scripts/release-profile.mjs` (productiebuild = profiel `first-release`), Edge Functions en migraties.

| Functie | Bestaat in productie? | Start | ZZP | Pro | Business |
|---|---|---|---|---|---|
| Dashboard | Ja | ✓ | ✓ | ✓ | — |
| Verkoopfacturen, PDF, delen via eigen mail, betalingen, herinnering (zelf versturen) | Ja | ✓ | ✓ | ✓ | — |
| Creditnota's | Ja | ✓ | ✓ | ✓ | — |
| Relaties en diensten | Ja | ✓ | ✓ | ✓ | — |
| Huisstijl (logo, factuuropmaak, mailtekst), export en back-up, tweestapsverificatie | Ja | ✓ | ✓ | ✓ | — |
| Kosten en bonnetjes (Kosten, Uitgaven, Documenten) | Ja | — | ✓ | ✓ | — |
| Slimme documentherkenning | Ja | — | 100 per maand | geen maandlimiet | — |
| Btw-overzicht met aangifterubrieken | Ja | — | ✓ | ✓ | — |
| Bankbestand importeren (CSV) | Ja | — | ✓ | ✓ | — |
| Rapporten (winst en verlies, omzet, kosten, financiële positie) | Ja | — | ✓ | ✓ | — |
| Herstelpunten (versiegeschiedenis) | Ja | — | — | ✓ | — |
| Controlecentrum, cashflow-prognose, grootboek | Nee (in code, uit in productie) | — | — | — | — |
| Terugkerende facturen, automatische herinneringen, boekingsregels, meerdere gebruikers, offertes | Nee | — | — | — | — |

- **Business is verborgen**: geen enkele bestaande functie onderscheidt het van Pro. Niet getoond, niet verkocht, geen Stripe-product.
- **Bestaande accounts verliezen niets.** De migratie zet alle accounts die bestaan op het moment dat zij draait in `private.start_legacy_accounts`. Die houden in Start hun boekhouding (kosten, bonnen, btw, bank, rapporten) met 10 slimme documenten per maand, zoals nu. `get_subscription_details().start_includes_bookkeeping` geeft dat door aan de app.
- **Afscherming** zit in de app (`PAGE_MIN_PLAN`, `planAllows`, `requirePlanAccess` in `kwinest/index.html`): pagina's, kosten toevoegen en bonnen uploaden vragen ZZP, herstelpunten vragen Pro. De documentlimiet wordt op de server afgedwongen (`billing_plan_limit`: Start 10, ZZP 100, Pro/Business geen). De boekhoudpagina's zelf zijn alleen in de app afgeschermd, want de administratie staat in één gedeelde opslag per account.
- **Het oude betaalde pakket** (`boekuna`) had 100 documenten per maand en wordt ZZP; dat blijft 100. Testcodes geven ZZP. Interne `pro`-toegang blijft Pro.
- Teruggedraaid uit de eerste versie: "binnenkort"-beloftes (batchverwerking, boekingsregels, terugkerende facturen, automatische herinneringen, rapportages, meerdere gebruikers, rollen, boekhouder) op website, app en Klaviyo. Er was geen functiecode voor gebouwd.
- Kwins keuze voor een ZZP-limiet wijkt af van de eerdere regel "geen pakketten op basis van aantallen scans". Hij koos dit bewust; op de website staat het verschil als "100 per maand" tegen "geen maandlimiet", niet als scancredits.

## 3. Productiestand bij ontwerp (gemeten 8 oktober 2026, alleen lezen)

- 5 gebruikers. 0 actieve Stripe-abonnementen. 1 `billing_accounts`-rij (free), 1 inactieve oude Stripe-entitlement zonder abonnement, 2 interne `pro`-toegangen.
- Documentgebruik (`billing_usage_monthly`, `smart_document`): september 64, oktober 68 (tot nu).
- Er is dus geen bestaande betalende klant om te migreren; de migratie is toch volledig achterwaarts compatibel gebouwd.

## 4. Migratie (`20261008170000_pricing_v2_plans_and_intervals.sql`)

Additief, idempotent, geen abonnement wordt opgezegd, opnieuw aangemaakt of omgeprijsd.

- Plansleutels: `free` blijft de opslagsleutel van Start; `boekuna` wordt gelezen als `zzp`; `pro` blijft `pro`; `business` is nieuw. Nieuwe schrijfacties slaan `zzp`/`pro`/`business` op. Oude rijen blijven staan.
- Nieuwe kolommen: `billing_interval`, `stripe_price_id`, `unit_amount_cents` (billing_accounts) en `billing_interval`, `price_ref` (billing_entitlements).
- Historische prijzen: tabel `billing_subscription_prices` (elke Stripe-prijs die een abonnement ooit had).
- `billing_plan_limit`: Start 10, ZZP (ook oude `boekuna`) 100, Pro en Business geen maandlimiet. Gebruik blijft geteld voor kostenanalyse.
- `private.start_legacy_accounts`: alle accounts die bestaan bij het toepassen houden in Start hun boekhouding.
- `apply_stripe_subscription_state_v2` schrijft plan + interval + prijs, monotoon op event-tijd. De oude 9-argumentversie blijft werken en stuurt door.
- `get_subscription_details()` voor het abonnementsscherm, `has_plan(min)` voor toekomstige functiegrenzen (server-side, eigen account).
- `get_billing_summary` en `redeem_tester_invite_code` herkennen alle V2-plannen (zelfde API-vorm).
- Bestaande bescherming blijft: `account_closures`, RLS, service-role-only schrijvers, test/live-scheiding.

Deploy-volgorde maakt niet uit: nieuwe Edge Functions vallen terug op de oude schrijver als de migratie er nog niet is; oude functies werken op de nieuwe database.

## 5. Stripe

- Officiële recurring prices via lookup key `boekuna_<plan>_<month|year>_v2`, één Product per pakket. Het setup-script maakt de vier prijzen van ZZP en Pro (maand en jaar); Business krijgt geen Stripe-product zolang het verborgen is. Aanmaken: `scripts/stripe-pricing-v2-setup.mjs` (eerst dry run, dan `--apply` met test-key; live alleen met `--apply --live` na go).
- Checkout controleert bij elke sessie dat de gevonden prijs exact klopt (bedrag, EUR, interval). Klopt het bedrag niet: weigeren (`PRICE_MISMATCH`), niets afgeschreven. Bestaat de prijs nog niet, of heeft hij nog de oude btw-instelling (excl.): inline recurring price met dezelfde serverbedragen, incl. btw.
- Checkout toont pakket, bedrag, periode, btw (Stripe Tax, incl.), verlenging en opzeggen. Eén abonnement per account: database én Stripe worden gecontroleerd.
- Webhook en sync lezen plan en interval uit de prijs die de klant betaalt (lookup key → prijs-metadata → bedrag → subscription-metadata). Oude prijzen (€ 9,95 en € 19,95 per maand) worden ZZP en Pro.

### Wisselen en proratie (Customer Portal)

| Wissel | Wanneer | Betaling |
|---|---|---|
| ZZP maand → ZZP jaar | direct | Stripe rekent direct het jaarbedrag minus het ongebruikte deel van de maand af (interval wijzigt) |
| ZZP → Pro | direct | verschil voor de rest van de periode op de volgende factuur |
| Pro → ZZP | einde betaalde periode | geen verlies van vooruitbetaalde rechten |
| Jaar → maand | einde betaalde periode | jaar loopt uit, daarna maand |
| Opzeggen | einde betaalde periode | geen restitutie lopende periode (voorwaarden art. 8) |

Ingesteld door het setup-script. Zet daarna `STRIPE_PORTAL_CONFIGURATION_ID` op de `billing-portal` Edge Function. Alleen verkoopbare pakketten staan in het portaal. Klanten met interne of testtoegang krijgen geen portaalknop.

## 6. Documentlimieten

- Start 10, ZZP 100, Pro en Business geen maandlimiet (`billing_plan_limit`, gelijk aan `DOCUMENT_LIMITS` in `pricing.mjs`, getest).
- Bij het bereiken van de limiet kan de klant documenten nog steeds uploaden en zelf invullen; alleen het slim uitlezen stopt tot de nieuwe maand.
- Capaciteit en misbruik: de documentprocessor heeft een snelheidsgrens (`RATE_LIMIT_MAX_REQUESTS=20` per `RATE_LIMIT_WINDOW_SECONDS=600`) en een wachtrij, ook voor Pro.
- De publieke claim "onbeperkt" staat uit (`UNLIMITED_CLAIM_RELEASED=false`); de site zegt "geen maandlimiet".

## 7. Unit economics

Gemeten: documentaantallen (zie 3). **Niet gemeten**: kosten per document. De processor roept OpenAI aan (`OPENAI_MODEL`), maar tokengebruik wordt niet opgeslagen (`aiUsage` gaat alleen terug naar de app). Er zijn dus geen echte kosten per document; we verzinnen ze niet.

Wat wel vaststaat is de maximale kostprijs per document waarbij een klant nog winstgevend is. Netto-opbrengst ZZP maand ≈ € 9,95 / 1,21 = € 8,22 excl. btw, minus Stripe-kosten (EU-kaart standaard 1,5 % + € 0,25 over € 9,95 ≈ € 0,40; controleer het tarief in het Stripe-dashboard) ≈ € 7,82. Jaar: (€ 82,23 minus ≈ € 1,74 Stripe-kosten) / 12 ≈ € 6,71 per maand. Pro maand: € 16,49 minus ≈ € 0,55 ≈ € 15,94.

| Documenten per maand | Max. kosten per document (ZZP maand) | (ZZP jaar) | (Pro maand, € 19,95) |
|---:|---:|---:|---:|
| 50 | € 0,156 | € 0,134 | € 0,319 |
| 200 | € 0,039 | € 0,034 | € 0,080 |
| 500 | € 0,016 | € 0,013 | € 0,032 |
| 1.000 | € 0,0078 | € 0,0067 | € 0,0159 |

Vaste kosten (Render, Supabase) komen hier nog af. Besluit: de onbeperkt-claim blijft **niet vrijgegeven** tot de kosten per document gemeten zijn. Nodig: `aiUsage` (input/output tokens) per document opslaan in de processor (`kwinest/docprocessor/app.py`, deploy via `kwinest-hosting`) en 2–4 weken meten.

## 8. App Store en Google Play

Er is nog geen native build in productie. De app herkent een native shell (`window.Capacitor.isNativePlatform()` of user agent `BoekunaNative`) en toont dan geen Stripe-aankoop, geen prijzenlink en geen portaalknop. Een native aankoopflow (StoreKit / Play Billing, of de EU-regels voor externe betaling) valt buiten deze PR en vraagt een eigen beleidscheck vóór indiening. Entitlements zijn al provider-neutraal (`billing_entitlements.provider`).

## 9. Vijf rechters

- **Onderzoeker**: drie pakketten op bestaande functies: Start om te factureren, ZZP voor de dagelijkse boekhouding, Pro voor wie veel documenten heeft en herstelpunten wil. Logisch opgebouwd, elk pakket voegt iets echts toe.
- **Scepticus**: waarom Pro? Alleen bij meer dan 100 documenten per maand of voor herstelpunten. Gemeten gebruik is nu 64–68 documenten per maand voor alle gebruikers samen, dus Pro is voor een kleine groep. Dat is eerlijk, maar Pro zal weinig verkopen tot er meer Pro-functies zijn.
- **Factchecker**: elke ✓ in de tabel is gecontroleerd in code en productieprofiel. Bedragen getest (centen, 10×, € 8,29 en € 16,63). Limieten getest op de server. Geen "onbeperkt", geen "binnenkort", geen reviews.
- **Tegenstander**: bestaande gebruikers houden alles (legacy-tabel). Het oude betaalde pakket hield al 100 documenten. Nieuwe Start-gebruikers krijgen minder dan oude; dat staat duidelijk op de site. Rest-risico: de boekhoudpagina's zijn alleen in de app afgeschermd, niet in de database.
- **Hoofdrechter**: **GO voor Start, ZZP en Pro (maand en jaar)** na de Stripe-testmodusronde en Kwins go per stap. **NO-GO** voor Business. **NO-GO** voor "onbeperkt".

## 10. Release-overdracht (elke stap vraagt Kwins go)

1. Merge deze PR.
2. Supabase-migratie `20261008170000_pricing_v2_plans_and_intervals.sql` toepassen (bevat `DROP CONSTRAINT`; de Supabase-connector vraagt bevestiging).
3. Edge Functions deployen: `billing-checkout`, `billing-webhook`, `billing-sync`, `billing-portal` (met `_shared/pricing.mjs` en `_shared/stripe-state.ts`).
4. App en website deployen in Render.
5. Stripe **testmodus**: `scripts/stripe-pricing-v2-setup.mjs --apply` met test-key, testcheckout ZZP maand en jaar met testkaart, webhook, portaalwissel en opzegging controleren.
6. Stripe **live**: zelfde script met `--apply --live`, daarna `STRIPE_PORTAL_CONFIGURATION_ID` zetten. Geen echte betaling zonder aparte toestemming.
7. Controle productie: checkout-sessie aanmaken (niet betalen), prijzen en btw-tekst in Stripe Checkout bekijken.
