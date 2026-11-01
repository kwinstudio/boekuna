# Lootjes – App Store checklist (handwerk in App Store Connect)

Wat de automatische stap al invult: ondertitel, beschrijving, trefwoorden, promotietekst,
support- en privacy-URL, categorieën, leeftijdsclassificatie, copyright en screenshots (iPhone en iPad, NL en EN).
Er wordt **nooit** automatisch ingediend.

## 1. App-privacy (App Store Connect > App-privacy)
Beantwoord "Ja, we verzamelen gegevens" en kies:

| Gegevenstype | Gebruik | Gekoppeld aan identiteit | Tracking |
|---|---|---|---|
| Contactgegevens > Naam | App-functionaliteit | Nee | Nee |
| Gebruikerscontent > Andere gebruikerscontent (verlanglijstjes, berichten) | App-functionaliteit | Nee | Nee |
| Diagnose > Crashgegevens | App-functionaliteit | Nee | Nee |
| Diagnose > Prestatiegegevens | App-functionaliteit | Nee | Nee |

Geen tracking, geen reclame, geen account.

## 2. Informatie voor de beoordeling (App Review)
- Inloggen nodig: **Nee**.
- Contactpersoon: jouw naam, e-mail en telefoonnummer (verplicht, vul zelf in).
- Notities (plak dit):

> Lootjes is a Dutch Secret Santa (Sinterklaas/Christmas) name-draw app. No account is needed.
> To test: tap "Nieuwe groep", fill in a name, add three names, tap through to "Trekken" (draw).
> Each participant then has a private link; the organizer cannot see who drew whom.
> Anonymous questions between a giver and receiver can be reported (long-press a message,
> "Meld dit bericht") and blocked (… menu in the chat). Reports are reviewed by us within 24 hours.
> The in-app shop browser only opens a fixed list of Dutch web shops; other sites open in Safari.

## 3. Prijs en beschikbaarheid
Gratis. Landen: Nederland en België (of alle landen, de app is Nederlandstalig).

## 4. Build kiezen
Kies de laatste TestFlight-build bij versie 1.0 en klik pas op "Ter beoordeling indienen" als jij er klaar voor bent.

## 5. Meldingen afhandelen
Gemelde berichten staan in Supabase (project kwinest), tabel `lt_reports` (`handled = false`).
Crashmeldingen staan in `lt_diag`.
