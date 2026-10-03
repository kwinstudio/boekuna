# BOEKUNA document scan intelligence

Status: production-candidate documentation  
Processor source of truth: `kwinest/docprocessor/app.py`  
OCR stack: RapidOCR 3.9.2 + PP-OCRv6-small + ONNX Runtime 1.30.0

## Product goal

BOEKUNA does not treat OCR text as accounting truth. The pipeline extracts evidence,
ranks field candidates, reconciles financial relationships and sends only uncertain or
blocking fields to the beginner review.

The normal path is:

INGEST
→ FILE VALIDATION
→ PAGE EXTRACTION
→ IMAGE QUALITY
→ CONDITIONAL PREPROCESSING
→ OCR / DIGITAL TEXT
→ LAYOUT + TOKEN NORMALIZATION
→ FIELD CANDIDATES
→ FIELD RANKING
→ FINANCIAL VALIDATION
→ FIELD CONFIDENCE / REVIEW DECISION
→ RESULT

## Source of truth and legacy code

Production document processing uses `kwinest/docprocessor/app.py`. The older
`processor/` tree is not the production source of truth and must not receive scan fixes
unless a separate migration explicitly changes the production routing.

The Render production service is `kwinest-docprocessor`. Its production branch is
`kwinest-hosting`; deployment is manual because auto-deploy is disabled.

## File validation and safety

The processor keeps the existing upload limits, MIME/extension consistency checks,
PDF page limit, raster pixel/side limits, corrupt-file handling and Pillow decompression
bomb protection. Accuracy work must not relax these controls.

## Digital PDF and hybrid PDF strategy

Digital text is preferred. A page with a useful text layer is parsed without OCR.
Sparse/image-only pages are rasterized and OCR'd individually. Multipage documents are
combined across all pages, so invoice metadata can appear on page 1 while VAT/totals
appear later.

## Image quality

`image_quality.py` performs dependency-light, local inspection using Pillow and NumPy.
It can flag:

- `IMAGE_LOW_RESOLUTION`
- `IMAGE_DARK`
- `IMAGE_OVEREXPOSED`
- `IMAGE_BLUR`
- `IMAGE_LONG_RECEIPT`
- `IMAGE_SKEW`

The metrics are coarse and privacy-safe. They are used only to decide whether a
conservative OCR retry is useful and whether simple Dutch capture guidance should be
shown. White paper alone is not overexposure; blur is measured around text/ink edges
rather than across the white background.

A quality warning does not block a document when recognition is otherwise reliable.

## Preprocessing and multi-pass OCR

The original/normalized color image remains the primary candidate.

Conditional alternatives include:

- grayscale + autocontrast + mild sharpening for weak low-contrast scans;
- conservative deskew only when measured skew evidence is strong;
- a financial-region pass around total/VAT evidence;
- a header-region pass only when the first header evidence is genuinely weak;
- overlapping vertical tiles for long receipts when the cheap full-receipt pass lacks
  critical financial evidence.

Long receipts are normalized by width rather than squeezed to a 1000 px height before
tiling. Tile boxes are remapped to document coordinates and overlap rows are
deduplicated.

Second passes are conditional. A clear digital PDF never pays an OCR cost.

## Field extraction

Extraction is deterministic and context-aware.

### Supplier

Supplier evidence combines labeled party blocks, top-of-document layout, legal entity
signals, VAT/KVK/IBAN evidence and receipt-header heuristics. The app can then use
tenant-local supplier memory to normalize a previously confirmed supplier.

Supplier memory is not global training. It reads only the signed-in account's existing
contacts and expenses. Matching uses reliable identifiers first (VAT ID / valid IBAN)
then an exact normalized supplier name.

### Date

Invoice date labels outrank generic dates and due-date labels. Dutch and English numeric
dates plus common month names/abbreviations are normalized to ISO `YYYY-MM-DD`.

### Invoice number

Invoice-number labels are required evidence when available. Candidate scanning skips
nearby KVK, VAT ID, IBAN, order-number, date, email and phone labels. The extracted
identifier remains a string, so leading zeroes are preserved.

### Totals

Explicit total labels such as `Totaal te betalen`, `Grand total`, `Eindtotaal`
and `Total amount` outrank arbitrary amounts. Subtotal/VAT/discount rows are excluded
from the total anchor. Financial block parsing and reconciliation provide additional
evidence.

### Category suggestion

For purchase documents the app suggests, but never locks, a category. Priority:

1. most-used previously confirmed category for the same tenant-local supplier;
2. small deterministic vendor/description rules for clearly recognisable categories;
3. `Inkoop` fallback.

The field remains editable in review.

## VAT and financial validation

All financial equality checks use cents.

For single-rate documents, 9% and 21% are supported as normal rates. Missing one of
net/VAT/gross may be derived from two reliable explicit anchors. Explicit OCR values are
never silently replaced merely because arithmetic predicts a different value.

If explicit values conflict, the processor preserves them, lowers confidence and creates
a review warning. The app's Smart Financial Correction may propose a calculated set, but
the user must explicitly apply it.

For mixed VAT:

- a scalar VAT rate is not used as accounting truth;
- VAT lines contain rate, taxable/base amount and VAT amount;
- sum of taxable bases must equal net at cent precision;
- sum of VAT lines must equal VAT total at cent precision;
- net + VAT must equal gross at cent precision;
- an unresolved mismatch blocks saving.

A lone informational percentage is not enough to create mixed VAT. Rate detection needs
VAT-label, monetary or explicit multi-rate product/service context.

0%, exempt, reverse-charge and foreign/special VAT semantics are not silently collapsed
into one meaning.

## Field confidence and beginner review

Confidence is field-level internally. The normal user interface does not show raw
confidence percentages. It uses plain states such as recognised, check this, confirmed
and calculated.

The review keeps optional technical data collapsed and focuses on the fields that affect
the booking. Address/KVK/VAT-ID/IBAN/email/phone may be extracted but do not create
unnecessary normal cost-registration questions.

User-confirmed values remain authoritative across save, reload and reopen.

## Privacy and observability

No new external document processor or multimodal AI provider is enabled by this work.
`BOOKUNA_ENABLE_EXTERNAL_AI` remains off by default.

Ordinary processor logs may contain:

- processor/version/revision;
- OCR engine/model/runtime version;
- duration;
- page and OCR-page counts;
- quality flag names/class;
- extraction outcome/document type;
- field confidence classes;
- mixed-VAT boolean;
- external-AI enabled/used booleans.

Ordinary logs must not dump raw OCR text, full document content, full bank identifiers or
customer documents.

Production corrections are not copied into the repository. Regressions use synthetic or
anonymised fixtures that reproduce the pattern.

## Benchmark and release gate

The scan benchmark uses one deterministic synthetic/anonymised set for both the frozen
pre-change processor and the candidate. It reports per-field exact/normalised/missing/
wrong/ambiguous outcomes for supplier, date, invoice number, net, VAT, gross, VAT rate
and mixed VAT, plus corrections/document, zero-correction documents, P50/P95 duration
and process RSS.

Financial fields have priority over convenience. A release is rejected if a scanner
change improves one field while regressing financial accuracy or mixed-VAT safety.

The exact-head release gate also covers processor regressions, malformed inputs, HEIC,
digital/scanned/multipage PDFs, memory, Chromium, WebKit, document background
processing, beginner review, verification, tenant isolation and production calculations.

## Rollback

Before processor deployment, record the currently live Render deploy ID. Deploy only the
processor content from the merged release commit/production branch. Verify `/health`
and `/ready` for version, revision, OCR availability and external-AI state.

Rollback when processor failure rate, latency, memory or field correctness shows a
meaningful regression. The previous Render deploy is the immediate rollback target.

The app is deployed separately only when review/field metadata UI changed. Marketing is
outside this scanner release.
