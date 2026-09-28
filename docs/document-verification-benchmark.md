# Boekuna document-verificatie benchmark

Deze benchmark is een launch-gate voor documentaccuratesse. Gebruik uitsluitend geanonimiseerde of synthetische fixtures in Git. Echte klant- of gebruikersdocumenten mogen als private benchmarkbron worden gebruikt, maar worden niet in de repository gepubliceerd.

Voor ieder document wordt **vóór** de OCR-run handmatig ground truth vastgelegd voor minimaal leverancier/relatie, datum, omschrijving, netto, btw-tarief, btw-bedrag en totaal.

## Meetregels

- Geldvelden worden exact op eurocenten vergeleken. Geen percentage-tolerantie en geen automatische marge van vijf cent.
- Een ontbrekend veld en een verkeerd veld worden afzonderlijk geteld.
- Een PASS 1/PASS 2-verschil is op zichzelf **geen** bewijs dat een fout is ontdekt.
- Een financiële PASS 1-fout telt pas als gedetecteerd wanneer de uiteindelijke validation/reviewlaag het relevante veld of de financiële inconsistentie expliciet markeert.
- Meet afzonderlijk of PASS 2 een PASS 1-fout herstelt én of PASS 2 nieuwe fouten introduceert.
- Meet false confidence: foutieve velden die als hoog vertrouwen zijn aangemerkt.
- Ground truth moet zelf financieel consistent zijn; de benchmark faalt als netto + btw niet gelijk is aan totaal of aangeleverde regel-/btw-sommen niet aansluiten.

## Verplichte uitkomsten

De benchmark rapporteert minimaal:

- per kernveld: correct, fout, ontbrekend, accuracy en correctiepercentage;
- per document: volledig correct, kleine correctie, belangrijke financiële correctie of onbruikbaar;
- percentage volledig correcte documenten;
- percentage documenten met handmatige correctie;
- financiële error-detection rate;
- aantal stille financiële fouten;
- false-high-confidence rate;
- PASS 2-fixes;
- door PASS 2 geïntroduceerde fouten en stille nieuwe fouten;
- PASS 1/PASS 2/totale verwerkingstijden;
- provider/failure-cases en of de flow veilig degradeert.

## Representatieve corpus

De vaste corpus moet vóór launch minimaal de categorieën uit `manifest.example.json` afdekken. Gebruik meerdere leveranciers/layouts; verschillende beeldvarianten van één document tellen als acquisition-varianten maar niet als onafhankelijke layouts.

Voor foto-/scanvarianten mag een geanonimiseerd bronstuk gecontroleerd worden gerasterd, gedraaid of donkerder gemaakt, zolang de financiële ground truth identiek blijft en de transformatie wordt vastgelegd.

## Uitvoeren

1. Maak een private `tests/fixtures/document-verification/manifest.json` op basis van `manifest.example.json`.
2. Leg ground truth vast vóór PASS 1.
3. Draai ieder bronstuk door de actuele Boekuna-flow en leg PASS 1, field confidence en timing vast.
4. Laat conditionele PASS 2 uitvoeren waar de productionlogica dat voorschrijft; forceer daarnaast in de benchmark een onafhankelijke PASS 2-sample zodat de waarde van de tweede controle meetbaar is.
5. Leg finale review flags en deterministische financial issues vast.
6. Draai:
   `node tests/document-verification-benchmark.mjs tests/fixtures/document-verification/manifest.json`
7. Bewaar de JSON-uitkomst als regressie-evidence met commit/deployversie en datum.
8. Herhaal exact dezelfde corpus na iedere relevante OCR-, prompt-, parser- of financial-validationwijziging.

## Production smoke

Vóór launch moeten minimaal één echte PDF-factuur en één echte bonfoto via een ingelogde gebruiker door de actuele pre-launchomgeving:

upload → extractie → review → eventuele correctie → opslag → opnieuw openen.

Controleer dat het opgeslagen resultaat exact overeenkomt met de bevestigde reviewwaarden en dat PASS 2 bevestigde data niet stil overschrijft.

## Privacy

Publiceer geen ongeanonimiseerde facturen, bonnetjes, adressen, IBANs, btw-ID's, klantnamen of andere financiële persoonsgegevens in Git. Benchmarkrapportage gebruikt document-ID's/pseudoniemen en geaggregeerde metrics.
