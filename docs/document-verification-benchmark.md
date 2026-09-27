# Boekuna document-verificatie benchmark

Gebruik uitsluitend geanonimiseerde of synthetische bronstukken. Voor ieder document wordt vóór het testen handmatig de ground truth vastgelegd voor leverancier/relatie, datum, omschrijving, netto, btw-tarief, btw-bedrag en totaal.

## Metingen

De benchmark rapporteert:
- PASS 1 veldaccuratesse;
- onafhankelijke PASS 2 veldaccuratesse;
- hoeveel belangrijke PASS 1-fouten door PASS 2 of deterministische validatie worden gemarkeerd;
- het resterende percentage stille belangrijke fouten na de extra controle.

De laatste metric is belangrijker dan alleen "AI accuracy": Boekuna mag een twijfelgeval markeren zonder automatisch een alternatieve waarde te boeken.

## Uitvoeren

1. Maak `tests/fixtures/document-verification/manifest.json` op basis van `manifest.example.json`.
2. Leg per document `groundTruth`, `pass1`, `pass2` en `flaggedFields` vast.
3. Draai:
   `node tests/document-verification-benchmark.mjs tests/fixtures/document-verification/manifest.json`
4. Bewaar ook PASS 1- en PASS 2-verwerkingstijd, providerfouten en tokengebruik uit de documentmetadata.

Publiceer geen klantdocumenten of ongeanonimiseerde financiële gegevens in de repository.
