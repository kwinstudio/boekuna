# Boekuna Pricing V2

Status: 8 oktober 2026. Geïmplementeerd in deze PR, nog niet in productie.
Bron van waarheid voor bedragen: `supabase/functions/_shared/pricing.mjs`.

## 1. Pakketten en prijzen (excl. btw)

| Pakket | Per maand | Per jaar (vooruit) | Besparing | Gemiddeld p/m bij jaar | Verkoopbaar |
|---|---:|---:|---:|---:|---|
| Start | € 0 | € 0 | — | — | ja, gratis, geen Stripe |
| ZZP | € 9,95 | € 99,50 | € 19,90 | ≈ € 8,29 | **ja** |
| Pro | € 19,95 | € 199,50 | € 39,90 | ≈ € 16,63 | nee, featureflag |
| Business | € 34,95 | € 349,50 | € 69,90 | ≈ € 29,13 | nee, featureflag |

- Jaar = precies 10 × maand, 12 maanden toegang, korting 16,67 % (afgerond 17 %).
- Bedragen zijn hele centen in de servercode. De frontend stuurt alleen `plan` en `interval`; de server bepaalt het bedrag.
- Jaarbetaling wordt in één keer vooraf geïncasseerd, niet in maandtermijnen.
- Geen trials, geen gratis betaalperiodes, geen Early Access / First-100 (blijft beëindigd).

## 2. Gap-analyse: gewenste functies tegen wat er werkt

Gecontroleerd in `scripts/release-profile.mjs` (wat productie toont) en `kwinest/index.html`.

| Functie | Pakket | Status |
|---|---|---|
| Basisfacturen, klanten/relaties, omzetoverzicht, export, één gebruiker | Start | werkt |
| Inkomsten/uitgaven, bonnetjes, documentherkenning, btw-overzicht, winst en kosten, administratie-export | ZZP | werkt |
| Bankbestandimport (CSV) | ZZP | werkt (thread Bankimport) |
| Documentherkenning zonder scancredits | ZZP+ | werkt na migratie (`billing_plan_limit` = geen limiet) |
| Batch-upload | Pro | **deels**: meerdere bestanden tegelijk kiezen kan al, voor iedereen; geen aparte batchverwerking |
| Slimme boekingsregels | Pro | **ontbreekt** |
| Hergebruik bevestigde leveranciersgegevens | Pro | **deels**: leveranciersgeheugen in documentherkenning, voor iedereen |
| Terugkerende facturen | Pro | **ontbreekt in productie** (`recurringInvoices:false`) |
| Automatische betalingsherinneringen | Pro | **ontbreekt**: alleen handmatige herinnering |
| Uitgebreide rapportages | Pro/Business | **ontbreekt in productie** (`advancedReports:false`) |
| Meerdere gebruikers, rollen, boekhouder, teamworkflows | Business | **ontbreekt** |

Conclusie: Pro en Business hebben nog te weinig werkende, onderscheidende functies. Ze zijn volledig gemodelleerd (prijzen, Stripe, rechten, webhook, UI), maar **niet verkoopbaar**: `DEFAULT_SELLABLE_PLANS = ['zzp']`. Checkout weigert ze met `PLAN_NOT_AVAILABLE`; website en app tonen "Binnenkort beschikbaar". Vrijgeven per omgeving met de Edge-secret `BILLING_SELLABLE_PLANS=zzp,pro` en `sellable` in `kwinest/index.html` en `public/prijzen/`, pas als de functies er zijn.

Let op Start: vandaag kan een gratis gebruiker ook kosten, bonnetjes, btw en bankimport gebruiken. Dat blijft zo (geen stille afname van rechten). De website belooft bij Start alleen factureren. Of nieuwe Start-gebruikers later minder krijgen, is een productbesluit dat eerst gecommuniceerd moet worden.

## 3. Productiestand bij ontwerp (gemeten 8 oktober 2026, alleen lezen)

- 5 gebruikers. 0 actieve Stripe-abonnementen. 1 `billing_accounts`-rij (free), 1 inactieve oude Stripe-entitlement zonder abonnement, 2 interne `pro`-toegangen.
- Documentgebruik (`billing_usage_monthly`, `smart_document`): september 64, oktober 68 (tot nu).
- Er is dus geen bestaande betalende klant om te migreren; de migratie is toch volledig achterwaarts compatibel gebouwd.

## 4. Migratie (`20261008170000_pricing_v2_plans_and_intervals.sql`)

Additief, idempotent, geen abonnement wordt opgezegd, opnieuw aangemaakt of omgeprijsd.

- Plansleutels: `free` blijft de opslagsleutel van Start; `boekuna` wordt gelezen als `zzp`; `pro` blijft `pro`; `business` is nieuw. Nieuwe schrijfacties slaan `zzp`/`pro`/`business` op. Oude rijen blijven staan.
- Nieuwe kolommen: `billing_interval`, `stripe_price_id`, `unit_amount_cents` (billing_accounts) en `billing_interval`, `price_ref` (billing_entitlements).
- Historische prijzen: tabel `billing_subscription_prices` (elke Stripe-prijs die een abonnement ooit had).
- `billing_plan_limit`: geen maandlimiet voor alle betaalde plannen (ook oude `boekuna`, was 100). Start houdt 10 per maand. Gebruik blijft geteld voor kostenanalyse.
- `apply_stripe_subscription_state_v2` schrijft plan + interval + prijs, monotoon op event-tijd. De oude 9-argumentversie blijft werken en stuurt door.
- `get_subscription_details()` voor het abonnementsscherm, `has_plan(min)` voor toekomstige functiegrenzen (server-side, eigen account).
- `get_billing_summary` en `redeem_tester_invite_code` herkennen alle V2-plannen (zelfde API-vorm).
- Bestaande bescherming blijft: `account_closures`, RLS, service-role-only schrijvers, test/live-scheiding.

Deploy-volgorde maakt niet uit: nieuwe Edge Functions vallen terug op de oude schrijver als de migratie er nog niet is; oude functies werken op de nieuwe database.

## 5. Stripe

- Zes officiële recurring prices, gevonden via lookup key `boekuna_<plan>_<month|year>_v2`, één Product per pakket. Aanmaken: `scripts/stripe-pricing-v2-setup.mjs` (eerst dry run, dan `--apply` met test-key; live alleen met `--apply --live` na go).
- Checkout controleert bij elke sessie dat de gevonden prijs exact klopt (bedrag, EUR, interval, excl. btw). Klopt het niet: weigeren (`PRICE_MISMATCH`), niets afgeschreven. Bestaat de prijs nog niet: inline recurring price met dezelfde serverbedragen (huidig gedrag).
- Checkout toont pakket, bedrag, periode, btw (Stripe Tax, excl.), verlenging en opzeggen. Eén abonnement per account: database én Stripe worden gecontroleerd.
- Webhook en sync lezen plan en interval uit de prijs die de klant betaalt (lookup key → prijs-metadata → bedrag → subscription-metadata). Oude prijzen (€ 9,95 en € 19,95 per maand) worden ZZP en Pro.

### Wisselen en proratie (Customer Portal)

| Wissel | Wanneer | Betaling |
|---|---|---|
| ZZP maand → ZZP jaar | direct | Stripe rekent direct het jaarbedrag minus het ongebruikte deel van de maand af (interval wijzigt) |
| ZZP → Pro, Pro → Business | direct | verschil voor de rest van de periode op de volgende factuur |
| Business → Pro, Pro → ZZP | einde betaalde periode | geen verlies van vooruitbetaalde rechten |
| Jaar → maand | einde betaalde periode | jaar loopt uit, daarna maand |
| Opzeggen | einde betaalde periode | geen restitutie lopende periode (voorwaarden art. 8) |

Ingesteld door het setup-script. Zet daarna `STRIPE_PORTAL_CONFIGURATION_ID` op de `billing-portal` Edge Function. Alleen verkoopbare pakketten staan in het portaal. Klanten met interne of testtoegang krijgen geen portaalknop.

## 6. Geen scancredits

- Rechten: alle betaalde plannen `monthly_limit = null`. Een klant wordt niet geblokkeerd bij document 101.
- Capaciteit en misbruik: de documentprocessor heeft een snelheidsgrens (`RATE_LIMIT_MAX_REQUESTS=20` per `RATE_LIMIT_WINDOW_SECONDS=600`) en een wachtrij. Dat is geen maandquotum.
- Telemetrie: `billing_usage_monthly` blijft tellen.
- De publieke claim "onbeperkt" staat uit (`UNLIMITED_CLAIM_RELEASED=false`). De website zegt "geen scancredits en geen vaste maandlimiet" en noemt de snelheidsgrens.

## 7. Unit economics

Gemeten: documentaantallen (zie 3). **Niet gemeten**: kosten per document. De processor roept OpenAI aan (`OPENAI_MODEL`), maar tokengebruik wordt niet opgeslagen (`aiUsage` gaat alleen terug naar de app). Er zijn dus geen echte kosten per document; we verzinnen ze niet.

Wat wel vaststaat is de maximale kostprijs per document waarbij een klant nog winstgevend is. Netto-opbrengst ZZP maand ≈ € 9,95 minus Stripe-kosten (EU-kaart standaard 1,5 % + € 0,25 over € 12,04 incl. btw ≈ € 0,43; controleer het tarief in het Stripe-dashboard) ≈ € 9,52. Jaar: (€ 99,50 minus ≈ € 2,06 Stripe-kosten over € 120,40) / 12 ≈ € 8,12 per maand. Pro maand: € 19,95 minus ≈ € 0,61 ≈ € 19,34.

| Documenten per maand | Max. kosten per document (ZZP maand) | (ZZP jaar) | (Pro maand, € 19,95) |
|---:|---:|---:|---:|
| 50 | € 0,190 | € 0,162 | € 0,387 |
| 200 | € 0,048 | € 0,041 | € 0,097 |
| 500 | € 0,019 | € 0,016 | € 0,039 |
| 1.000 | € 0,0095 | € 0,0081 | € 0,0193 |

Vaste kosten (Render, Supabase) komen hier nog af. Besluit: de onbeperkt-claim blijft **niet vrijgegeven** tot de kosten per document gemeten zijn. Nodig: `aiUsage` (input/output tokens) per document opslaan in de processor (`kwinest/docprocessor/app.py`, deploy via `kwinest-hosting`) en 2–4 weken meten.

## 8. App Store en Google Play

Er is nog geen native build in productie. De app herkent een native shell (`window.Capacitor.isNativePlatform()` of user agent `BoekunaNative`) en toont dan geen Stripe-aankoop, geen prijzenlink en geen portaalknop. Een native aankoopflow (StoreKit / Play Billing, of de EU-regels voor externe betaling) valt buiten deze PR en vraagt een eigen beleidscheck vóór indiening. Entitlements zijn al provider-neutraal (`billing_entitlements.provider`).

## 9. Vijf rechters

- **Onderzoeker**: vier pakketten met een gratis start en een ZZP-prijs onder € 10 passen bij Nederlandse zzp'ers; "betaal voor functies, niet voor scans" is een helder verschil. Jaarprijs = 10 maanden is gangbaar en eerlijk uit te leggen.
- **Scepticus**: Pro en Business bieden vandaag te weinig extra. Daarom niet verkopen tot de functies werken. Nu er geen scanlimiet meer is, is ZZP voor bijna iedereen genoeg; Pro moet echte automatisering krijgen.
- **Factchecker**: bedragen getest (centen, 10×, 16,67 %, € 8,29/16,63/29,13). Btw excl. overal, Stripe Tax berekent. Verlengtekst en restitutie volgen voorwaarden art. 8. Geen "onbeperkt", geen "meest gekozen", geen reviews.
- **Tegenstander**: geen bestaand abonnement wordt aangeraakt; oude prijzen blijven herkend; dubbele en oude events veranderen niets; portaalwissels lezen de echte prijs; checkout tijdens accountverwijdering wordt geweigerd en een toch voltooide checkout direct opgezegd. Rest-risico: twee open checkouts tegelijk afgerond (twee tabbladen) kan twee abonnementen geven; de tweede checkout wordt geblokkeerd zodra Stripe het eerste abonnement kent.
- **Hoofdrechter**: **GO voor ZZP maand en jaar** na de Stripe-testmodusronde en Kwins go per productiestap. **NO-GO** voor commerciële activatie van Pro en Business. **NO-GO** voor de claim "onbeperkt".

## 10. Release-overdracht (elke stap vraagt Kwins go)

1. Merge deze PR.
2. Supabase-migratie `20261008170000_pricing_v2_plans_and_intervals.sql` toepassen (bevat `DROP CONSTRAINT`; de Supabase-connector vraagt bevestiging).
3. Edge Functions deployen: `billing-checkout`, `billing-webhook`, `billing-sync`, `billing-portal` (met `_shared/pricing.mjs` en `_shared/stripe-state.ts`).
4. App en website deployen in Render.
5. Stripe **testmodus**: `scripts/stripe-pricing-v2-setup.mjs --apply` met test-key, testcheckout ZZP maand en jaar met testkaart, webhook, portaalwissel en opzegging controleren.
6. Stripe **live**: zelfde script met `--apply --live`, daarna `STRIPE_PORTAL_CONFIGURATION_ID` zetten. Geen echte betaling zonder aparte toestemming.
7. Controle productie: checkout-sessie aanmaken (niet betalen), prijzen en btw-tekst in Stripe Checkout bekijken.
