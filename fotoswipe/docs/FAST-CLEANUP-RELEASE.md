# Fotoswipe: snelle stapel en opruimtools

- De stapel houdt maximaal twintig lichte voorbeelden klaar, plus vijf recente voorbeelden voor teruggaan. Alleen de eerste drie krijgen een scherpere versie; lichte beelden krijgen voorrang en worden niet gewist tijdens een kwaliteitsupgrade.
- Wegleggen en bewaren vereisen een zichtbaar voorbeeld. Een ontbrekend iCloud-item toont opnieuw proberen; Later beslissen blijft mogelijk.
- Via Meer: Later beslissen, echt favoriet maken in Foto's, toevoegen aan een bestaand/nieuw album, groter bekijken of video afspelen, en vergelijkbare foto's zoeken.
- Via Categorie: Later beslissen, 30 willekeurige items, video's, bestaande categorieën/albums/maanden. Volgorde ondersteunt ook willekeurig. Een willekeurige sessie blijft dezelfde sessie tot je expliciet opnieuw kiest.
- De vergelijkingsscan start uitsluitend op verzoek en gebruikt alleen lokale kleine voorbeelden. Hij zoekt kandidaten binnen twee minuten van elkaar; dit is geen volledige of gegarandeerde duplicatendetector. Keuzes zijn handmatig, met minstens één overblijvend item per groep. Eerder weggelegde items worden bij opnieuw scannen uitgesloten.
- Video's krijgen alleen een stilstaand voorbeeld tijdens swipen. De video zelf wordt pas geladen bij afspelen, en stopt bij sluiten/achtergrond.
- Bewaren, wegleggen en Later worden lokaal opgeslagen. Bestaande build-3-keuzes blijven leesbaar. Een swipe verwijdert niets: de gezamenlijke selectie en iOS bevestigen de verwijdering apart.

Geen login, eigen server, analytics, nieuwe SDK of upload van foto's. FotoKit kan iCloud-data ophalen voor tonen of afspelen. Langzame cloudverbindingen kunnen nog wachttijd geven.

Verificatie: 44 tests op de checkbranch geslaagd; definitieve release voegt een test voor fastFormat/low-quality-preview gedrag toe en draait de volledige suite opnieuw. Code review en regressiefixes staan in het voortgangsdocument. Fysieke iPhone-prestaties en persoonlijke album/iCloud-situaties zijn niet door de cloudsimulator gemeten.
