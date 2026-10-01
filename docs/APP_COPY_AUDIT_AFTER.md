# App copy audit — after

De 16 hoofdschermen, auth, Nieuw, factuuracties, documentacties en herstel/accountmeldingen zijn op herhaling en jargon gecontroleerd. De voorinventaris staat in `APP_COPY_AUDIT_BEFORE.json`; de keuzes zijn ook machineleesbaar in `APP_COPY_AUDIT_AFTER.json`.

| Voor | Na |
|---|---|
| Voorbelasting | Btw op kosten |
| Verschuldigde btw 21% | Btw op omzet 21% |
| Verschuldigde btw 9% | Btw op omzet 9% |
| Verschuldigde btw | Btw op omzet |
| Ongekoppelde bankmutaties blijven op rekening 2300 tot ze zijn toegewezen. | Niet gekoppelde transacties blijven op rekening 2300. |
| E-factuur readiness | E-factuurcontrole |
| Cloudaccount | Account |
| Klant, regels en gegevens aanpassen | (uitleg verwijderd) |
| Open factuur en PDF | (uitleg verwijderd) |
| Herinnering voorbereiden | (uitleg verwijderd) |
| Verwijder dit concept | (uitleg verwijderd) |
| Opvolgmail voorbereiden | (uitleg verwijderd) |
| Bestand niet gevonden in de cloud | Bestand niet gevonden |
| Fiscale spelregels in deze MVP | Fiscale spelregels |
| De MVP ondersteunt 21%, 9% en 0% | Boekuna ondersteunt 21%, 9% en 0% |
| Cloudaccounts | Accounts |
| Factuurprefix | Voorvoegsel factuurnummer |
| Boekingsregels</h2> | Boekingen</h2> |
| Cloud opgeslagen | Opgeslagen ✓ |
| Cloud opslaan… | Opslaan… |
| Offline · lokaal bewaard | Niet opgeslagen + Opnieuw proberen |
| Meer (bottom nav) | Actie nodig |
| Account & gegevens | Data & import/export; Beveiliging; Account; Geavanceerd |
| Nieuwe foto kiezen | Ander bestand (onder ⋯) |
| Je documenten zijn ontvangen. Je kunt ondertussen verder werken. | Ontvangen. Je kunt verder werken. |
| Debiteuren | Openstaande facturen |
| Versies | Herstelpunten |

“Journaal”, “debet”, “credit”, rekeningnummers, KOR, btw-identificatienummer en fiscale waarschuwingen blijven waar hun precieze betekenis nodig is. Journaal en Auditlog zijn nu secundaire exportlabels. Verwijderen en het vervangen van een herstelversie blijven expliciete waarschuwingen met bestaande bevestigingen. Auth, financiële exportkolommen en wettelijke teksten zijn niet blind herschreven.

Documenten toont één Upload, korte status en de noodzakelijke controleactie. Extra handelingen staan onder Documentacties. Instellingen heeft zes herkenbare groepen. Factuuracties herhalen hun label niet met een tweede beschrijving.
