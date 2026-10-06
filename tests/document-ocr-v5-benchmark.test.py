import io
import json
import math
import os
import statistics
import sys
import time
from pathlib import Path

try:
    import resource
except ImportError:
    resource = None

import fitz
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


FIELDS = (
    "documentType",
    "supplier",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "subtotal",
    "vatAmount",
    "gross",
    "vatRate",
    "vatLines",
    "mixedRates",
    "currency",
    "iban",
    "vatId",
    "paymentReference",
    "amountPaid",
    "advancePaid",
    "amountDue",
)

MONEY_FIELDS = {"subtotal", "vatAmount", "gross", "amountPaid", "advancePaid", "amountDue"}


def rss_mb():
    if resource is None:
        return None
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw / (1024 * 1024) if sys.platform == "darwin" else raw / 1024


def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered) - 1) * p
    lo = math.floor(index)
    hi = math.ceil(index)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)


def font(size=44, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def render_lines(lines, *, size=(1500, 1900), font_size=44, long=False, background="white"):
    if long:
        size = (1050, 6200)
    image = Image.new("RGB", size, background)
    draw = ImageDraw.Draw(image)
    body = font(font_size if not long else max(31, font_size - 7))
    heading = font(font_size + 10 if not long else font_size + 3, True)
    y = 70
    if long:
        head = lines[:-5]
        tail = lines[-5:]
        for idx, line in enumerate(head):
            draw.text((55, y), line, fill="black", font=heading if idx == 0 else body)
            y += 105
        item = 1
        while y < 5000:
            draw.text((55, y), f"Product {item:03d}    EUR 1,00", fill="black", font=body)
            y += 88
            item += 1
        for line in tail:
            draw.text((55, y), line, fill="black", font=body)
            y += 105
    else:
        for idx, line in enumerate(lines):
            draw.text((70, y), line, fill="black", font=heading if idx == 0 else body)
            y += 105
    return image


def image_bytes(lines, *, fmt="JPEG", transform=None, size=(1500, 1900), font_size=44, long=False):
    image = render_lines(lines, size=size, font_size=font_size, long=long)
    if transform:
        image = transform(image)
    out = io.BytesIO()
    kwargs = {"quality": 90} if fmt.upper() in {"JPEG", "JPG"} else {}
    image.save(out, format=fmt, **kwargs)
    image.close()
    return out.getvalue()


def dark(image):
    out = ImageEnhance.Brightness(image).enhance(0.38)
    image.close()
    return out


def low_contrast(image):
    out = ImageEnhance.Contrast(image).enhance(0.34)
    image.close()
    return out


def blur(image):
    out = image.filter(ImageFilter.GaussianBlur(radius=1.5))
    image.close()
    return out


def low_res(image):
    out = image.resize((420, 540), Image.Resampling.LANCZOS)
    image.close()
    return out


def skew(image):
    out = image.rotate(4.0, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
    image.close()
    return out


def rotate90(image):
    out = image.rotate(90, expand=True, fillcolor="white")
    image.close()
    return out


def rotate180(image):
    out = image.rotate(180, expand=True, fillcolor="white")
    image.close()
    return out


def rotate270(image):
    out = image.rotate(270, expand=True, fillcolor="white")
    image.close()
    return out


def shadow(image):
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = image.size
    draw.polygon([(int(w * .48), 0), (w, 0), (w, h), (int(w * .64), h)], fill=(0, 0, 0, 115))
    out = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    overlay.close()
    image.close()
    return out


def perspective(image):
    w, h = image.size
    quad = (int(w * .08), int(h * .03), 0, int(h * .94), int(w * .92), h, w, int(h * .09))
    out = image.transform((w, h), Image.Transform.QUAD, quad, resample=Image.Resampling.BICUBIC, fillcolor="white")
    image.close()
    return out


def vector_pdf(page_sets):
    doc = fitz.open()
    for lines in page_sets:
        page = doc.new_page(width=595, height=842)
        y = 55
        for line in lines:
            page.insert_text((42, y), line, fontsize=11)
            y += 27
        while y < 630:
            page.insert_text((42, y), "BOEKUNA synthetische privacy-safe benchmark.", fontsize=7)
            y += 22
    raw = doc.tobytes()
    doc.close()
    return raw


def scanned_pdf(lines):
    png = image_bytes(lines, fmt="PNG", size=(1800, 2400))
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=png)
    raw = doc.tobytes()
    doc.close()
    return raw


def invoice_lines(
    supplier="BOEKUNA QA LEVERANCIER BV",
    number="INV-2026-1001",
    date="03-10-2026",
    due="31-10-2026",
    net="100,00",
    vat="21,00",
    gross="121,00",
    rate="21",
    extra=None,
):
    lines = [
        "FACTUUR",
        f"Leverancier: {supplier}",
        "BTW-nummer: NL123456789B01",
        "IBAN: NL91ABNA0417164300",
        f"Factuurnummer: {number}",
        f"Factuurdatum: {date}",
        f"Vervaldatum: {due}",
        "Betalingskenmerk: RF18539007547034",
        "Omschrijving: Zakelijke dienstverlening",
        f"Subtotaal: EUR {net}",
        f"BTW {rate}%: EUR {vat}",
        f"Totaal te betalen: EUR {gross}",
    ]
    if extra:
        insert_at = max(2, len(lines) - 3)
        for item in reversed(list(extra)):
            lines.insert(insert_at, item)
    return lines


def receipt_lines(name="BOEKUNA QA SUPERMARKT", *, rate="21", net="100,00", vat="21,00", gross="121,00"):
    return [
        name,
        "KASSABON",
        "Datum 03-10-2026",
        "Zakelijke aankoop",
        f"Subtotaal EUR {net}",
        f"BTW {rate}% EUR {vat}",
        f"Totaal EUR {gross}",
        f"PIN EUR {gross}",
    ]


def base_expected(**overrides):
    value = {
        "documentType": "purchase_invoice",
        "supplier": "BOEKUNA QA LEVERANCIER BV",
        "invoiceNumber": "INV-2026-1001",
        "invoiceDate": "2026-10-03",
        "dueDate": "2026-10-31",
        "subtotal": 100.0,
        "vatAmount": 21.0,
        "gross": 121.0,
        "vatRate": 21.0,
        "mixedRates": False,
        "currency": "EUR",
        "iban": "NL91ABNA0417164300",
        "vatId": "NL123456789B01",
        "paymentReference": "RF18539007547034",
    }
    value.update(overrides)
    return value


def cases():
    receipt = receipt_lines()
    formal = invoice_lines()
    long_receipt = receipt_lines("BOEKUNA QA ZEER LANGE SUPERMARKT")
    mixed = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA MIXED BV",
        "Factuurnummer: MIX-2026-1",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "BTW 9% grondslag EUR 100,00 BTW EUR 9,00 totaal EUR 109,00",
        "BTW 21% grondslag EUR 50,00 BTW EUR 10,50 totaal EUR 60,50",
        "Subtotaal EUR 150,00",
        "Totaal BTW EUR 19,50",
        "Totaal EUR 169,50",
    ]
    zero = invoice_lines(supplier="BOEKUNA QA NUL BV", number="ZERO-2026-1", vat="0,00", gross="100,00", rate="0")
    multi1 = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA MULTIPAGE BV",
        "Factuurnummer: MULTI-2026-1",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "IBAN: NL91ABNA0417164300",
        "BTW-nummer: NL123456789B01",
        "Betalingskenmerk: RF18539007547034",
    ]
    multi2 = [
        "Pagina 2",
        "Subtotaal EUR 100,00",
        "BTW 21% EUR 21,00",
        "Totaal te betalen EUR 121,00",
    ]
    candidates = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA NUMMERS BV",
        "KVK: 87654321",
        "Klantnummer: 998877",
        "PO: PO-556677",
        "Betalingskenmerk: RF18539007547034",
        "Factuurnummer:",
        "INV-2026-REAL",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "Subtotaal EUR 100,00",
        "BTW 21% EUR 21,00",
        "Totaal EUR 121,00",
    ]
    credit = [
        "CREDITNOTA",
        "Leverancier: BOEKUNA QA CREDIT BV",
        "Creditnota nummer: CR-2026-9",
        "Creditnota datum: 03-10-2026",
        "Oorspronkelijke factuur: INV-2026-8",
        "Subtotaal EUR -100,00",
        "BTW 21% EUR -21,00",
        "Totaal EUR -121,00",
    ]
    payment = invoice_lines(
        supplier="BOEKUNA QA PAYMENT BV",
        number="PAY-2026-1",
        extra=["Reeds betaald EUR 40,00", "Nog te betalen EUR 81,00"],
    )
    advance = invoice_lines(
        supplier="BOEKUNA QA ADVANCE BV",
        number="ADV-2026-1",
        net="454,00",
        vat="95,34",
        gross="549,34",
        extra=["Voorschot EUR 300,00", "Nog te betalen EUR 249,34"],
    )
    self_billing = [
        "SELF-BILLING FACTUUR",
        "Factuur uitgereikt door afnemer",
        "Leverancier: BOEKUNA QA SELF BILLING BV",
        "Factuurnummer: SELF-2026-1",
        "Factuurdatum: 03-10-2026",
        "Subtotaal EUR 100,00",
        "BTW 21% EUR 21,00",
        "Totaal EUR 121,00",
    ]
    factoring = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA FACTORING BV",
        "Factuurnummer: FAC-2026-1",
        "Factuurdatum: 03-10-2026",
        "Bedrag ex btw EUR 100,00",
        "BTW 21% EUR 21,00",
        "Factuurbedrag EUR 121,00",
        "Factoring 4.8% EUR 121,00 Bedrag ex btw EUR -4,80",
        "BTW 21% EUR -1,01",
        "Factuurbedrag EUR -5,81",
        "Eindbedrag EUR 115,19",
    ]
    missing = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA MISSING BV",
        "Factuurnummer: MISS-2026-1",
        "Factuurdatum: 03-10-2026",
        "Totaal EUR 121,00",
    ]

    receipt_expected = {
        "documentType": "receipt",
        "supplier": "BOEKUNA QA SUPERMARKT",
        "invoiceDate": "2026-10-03",
        "subtotal": 100.0,
        "vatAmount": 21.0,
        "gross": 121.0,
        "vatRate": 21.0,
        "mixedRates": False,
        "currency": "EUR",
    }

    return [
        {"id":"standard-invoice-image","kind":"image","name":"standard.jpg","mime":"image/jpeg","raw":image_bytes(formal),"expected":base_expected(),"tags":["image","simple"]},
        {"id":"smartphone-perspective-shadow","kind":"image","name":"phone.jpg","mime":"image/jpeg","raw":image_bytes(formal,transform=lambda im: shadow(perspective(im))),"expected":base_expected(),"tags":["image","difficult","perspective"]},
        {"id":"receipt-clear","kind":"image","name":"receipt.jpg","mime":"image/jpeg","raw":image_bytes(receipt),"expected":receipt_expected,"tags":["image","receipt","simple"]},
        {"id":"receipt-dark","kind":"image","name":"dark.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=dark),"expected":receipt_expected,"tags":["image","receipt","dark"]},
        {"id":"receipt-low-contrast","kind":"image","name":"contrast.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=low_contrast),"expected":receipt_expected,"tags":["image","receipt","low-contrast"]},
        {"id":"receipt-blur","kind":"image","name":"blur.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=blur),"expected":receipt_expected,"tags":["image","receipt","blur"]},
        {"id":"receipt-low-resolution","kind":"image","name":"low-res.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=low_res),"expected":receipt_expected,"tags":["image","receipt","low-res"]},
        {"id":"receipt-skew","kind":"image","name":"skew.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=skew),"expected":receipt_expected,"tags":["image","receipt","skew"]},
        {"id":"receipt-rotate-90","kind":"image","name":"rot90.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=rotate90),"expected":receipt_expected,"tags":["image","receipt","rotation"]},
        {"id":"receipt-rotate-180","kind":"image","name":"rot180.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=rotate180),"expected":receipt_expected,"tags":["image","receipt","rotation"]},
        {"id":"receipt-rotate-270","kind":"image","name":"rot270.jpg","mime":"image/jpeg","raw":image_bytes(receipt,transform=rotate270),"expected":receipt_expected,"tags":["image","receipt","rotation"]},
        {"id":"receipt-long","kind":"image","name":"long.jpg","mime":"image/jpeg","raw":image_bytes(long_receipt,long=True,font_size=39),"expected":{**receipt_expected,"supplier":"BOEKUNA QA ZEER LANGE SUPERMARKT"},"tags":["image","receipt","long"]},
        {"id":"receipt-very-long-small","kind":"image","name":"very-long.jpg","mime":"image/jpeg","raw":image_bytes(long_receipt,long=True,font_size=32,size=(900,7600)),"expected":{**receipt_expected,"supplier":"BOEKUNA QA ZEER LANGE SUPERMARKT"},"tags":["image","receipt","long","small-text"]},
        {"id":"restaurant-9","kind":"image","name":"restaurant.jpg","mime":"image/jpeg","raw":image_bytes(receipt_lines("BOEKUNA QA HORECA",rate="9",vat="9,00",gross="109,00")),"expected":{**receipt_expected,"supplier":"BOEKUNA QA HORECA","vatAmount":9.0,"gross":109.0,"vatRate":9.0},"tags":["image","receipt","horeca"]},
        {"id":"tankstation-21","kind":"image","name":"tank.jpg","mime":"image/jpeg","raw":image_bytes(receipt_lines("BOEKUNA QA TANKSTATION")),"expected":{**receipt_expected,"supplier":"BOEKUNA QA TANKSTATION"},"tags":["image","receipt","tank"]},
        {"id":"digital-pdf","kind":"pdf","name":"digital.pdf","mime":"application/pdf","raw":vector_pdf([formal]),"expected":base_expected(),"tags":["pdf","native"],"expect_no_ocr":True},
        {"id":"scanned-pdf","kind":"pdf","name":"scan.pdf","mime":"application/pdf","raw":scanned_pdf(invoice_lines(supplier="BOEKUNA QA SCAN BV",number="SCAN-2026-1")),"expected":base_expected(supplier="BOEKUNA QA SCAN BV",invoiceNumber="SCAN-2026-1"),"tags":["pdf","scanned"]},
        {"id":"image-only-pdf","kind":"pdf","name":"image-only.pdf","mime":"application/pdf","raw":scanned_pdf(receipt_lines("BOEKUNA QA PDF BON")),"expected":{**receipt_expected,"supplier":"BOEKUNA QA PDF BON"},"tags":["pdf","scanned","receipt"]},
        {"id":"multipage-pdf","kind":"pdf","name":"multi.pdf","mime":"application/pdf","raw":vector_pdf([multi1,multi2]),"expected":base_expected(supplier="BOEKUNA QA MULTIPAGE BV",invoiceNumber="MULTI-2026-1"),"tags":["pdf","native","multipage"],"expect_no_ocr":True},
        {"id":"mixed-vat","kind":"pdf","name":"mixed.pdf","mime":"application/pdf","raw":vector_pdf([mixed]),"expected":{"documentType":"purchase_invoice","supplier":"BOEKUNA QA MIXED BV","invoiceNumber":"MIX-2026-1","invoiceDate":"2026-10-03","dueDate":"2026-10-31","subtotal":150.0,"vatAmount":19.5,"gross":169.5,"mixedRates":True,"vatLines":[[9.0,100.0,9.0],[21.0,50.0,10.5]],"currency":"EUR"},"tags":["pdf","native","mixed-vat"],"expect_no_ocr":True},
        {"id":"zero-vat","kind":"pdf","name":"zero.pdf","mime":"application/pdf","raw":vector_pdf([zero]),"expected":base_expected(supplier="BOEKUNA QA NUL BV",invoiceNumber="ZERO-2026-1",vatAmount=0.0,gross=100.0,vatRate=0.0),"tags":["pdf","native","zero-vat"],"expect_no_ocr":True},
        {"id":"number-disambiguation","kind":"pdf","name":"numbers.pdf","mime":"application/pdf","raw":vector_pdf([candidates]),"expected":{"documentType":"purchase_invoice","supplier":"BOEKUNA QA NUMMERS BV","invoiceNumber":"INV-2026-REAL","invoiceDate":"2026-10-03","dueDate":"2026-10-31","subtotal":100.0,"vatAmount":21.0,"gross":121.0,"vatRate":21.0,"mixedRates":False,"currency":"EUR","paymentReference":"RF18539007547034"},"tags":["pdf","native","identifiers"],"expect_no_ocr":True},
        {"id":"credit-note","kind":"pdf","name":"credit.pdf","mime":"application/pdf","raw":vector_pdf([credit]),"expected":{"documentType":"credit_invoice","supplier":"BOEKUNA QA CREDIT BV","invoiceNumber":"CR-2026-9","invoiceDate":"2026-10-03","subtotal":-100.0,"vatAmount":-21.0,"gross":-121.0,"vatRate":21.0,"mixedRates":False,"currency":"EUR"},"tags":["pdf","native","credit"],"expect_no_ocr":True},
        {"id":"amount-paid-due","kind":"pdf","name":"paid.pdf","mime":"application/pdf","raw":vector_pdf([payment]),"expected":base_expected(supplier="BOEKUNA QA PAYMENT BV",invoiceNumber="PAY-2026-1",amountPaid=40.0,amountDue=81.0),"tags":["pdf","native","payments"],"expect_no_ocr":True},
        {"id":"advance-due","kind":"pdf","name":"advance.pdf","mime":"application/pdf","raw":vector_pdf([advance]),"expected":base_expected(supplier="BOEKUNA QA ADVANCE BV",invoiceNumber="ADV-2026-1",subtotal=454.0,vatAmount=95.34,gross=549.34,advancePaid=300.0,amountDue=249.34),"tags":["pdf","native","payments"],"expect_no_ocr":True},
        {"id":"self-billing","kind":"pdf","name":"self.pdf","mime":"application/pdf","raw":vector_pdf([self_billing]),"expected":{"documentType":"sales_invoice","invoiceNumber":"SELF-2026-1","invoiceDate":"2026-10-03","subtotal":100.0,"vatAmount":21.0,"gross":121.0,"vatRate":21.0,"mixedRates":False,"currency":"EUR"},"tags":["pdf","native","self-billing"],"expect_no_ocr":True},
        {"id":"factoring","kind":"pdf","name":"factoring.pdf","mime":"application/pdf","raw":vector_pdf([factoring]),"expected":{"documentType":"purchase_invoice","supplier":"BOEKUNA QA FACTORING BV","invoiceNumber":"FAC-2026-1","invoiceDate":"2026-10-03","subtotal":100.0,"vatAmount":21.0,"gross":121.0,"vatRate":21.0,"mixedRates":False,"currency":"EUR"},"tags":["pdf","native","factoring"],"expect_no_ocr":True},
        {"id":"missing-fields","kind":"pdf","name":"missing.pdf","mime":"application/pdf","raw":vector_pdf([missing]),"expected":{"documentType":"purchase_invoice","supplier":"BOEKUNA QA MISSING BV","invoiceNumber":"MISS-2026-1","invoiceDate":"2026-10-03","gross":121.0,"currency":"EUR"},"tags":["pdf","native","missing"],"expect_no_ocr":True},
    ]


def norm_text(value):
    return " ".join(str(value or "").strip().casefold().split())


def norm_supplier(value):
    text = "".join(ch for ch in norm_text(value) if ch.isalnum())
    for suffix in ("beslotenvennootschap", "bv"):
        if text.endswith(suffix):
            text = text[:-len(suffix)]
    return text


def money_cents(value):
    return processor.money_cents(value)


def vat_lines(value):
    out = []
    for row in value or []:
        if isinstance(row, (list, tuple)) and len(row) >= 3:
            rate, taxable, vat = row[:3]
        else:
            rate = getattr(row, "rate", None)
            taxable = getattr(row, "taxableAmount", None)
            vat = getattr(row, "vatAmount", None)
        out.append([round(float(rate), 4), money_cents(taxable), money_cents(vat)])
    return sorted(out)


def actual_fields(result):
    lines = result.amounts.vatLines or []
    rates = sorted({round(float(row.rate), 4) for row in lines if row.rate is not None})
    deriv = (result.processing or {}).get("amountDerivation") or {}
    return {
        "documentType": result.documentType,
        "supplier": result.supplier.name,
        "invoiceNumber": result.invoice.invoiceNumber,
        "invoiceDate": result.invoice.invoiceDate,
        "dueDate": result.invoice.dueDate,
        "subtotal": result.amounts.subtotal,
        "vatAmount": result.amounts.vatTotal,
        "gross": result.amounts.total,
        "vatRate": rates[0] if len(rates) == 1 else None,
        "vatLines": [[row.rate, row.taxableAmount, row.vatAmount] for row in lines],
        "mixedRates": bool(deriv.get("mixedRates") or len(rates) > 1),
        "currency": result.amounts.currency,
        "iban": result.supplier.iban,
        "vatId": result.supplier.vatNumber,
        "paymentReference": result.invoice.paymentReference,
        "amountPaid": result.amounts.alreadyPaid,
        "advancePaid": result.amounts.advancePayment,
        "amountDue": result.amounts.amountDue if result.amounts.amountDue is not None else result.amounts.outstandingAmount,
    }


def classify(field, expected, actual):
    if actual is None or actual == "":
        return "MISSING"
    if field == "supplier":
        if str(actual).strip() == str(expected).strip():
            return "EXACT"
        return "NORMALIZED" if norm_supplier(actual) == norm_supplier(expected) else "WRONG"
    if field in MONEY_FIELDS:
        return "EXACT" if money_cents(actual) == money_cents(expected) else "WRONG"
    if field == "vatRate":
        try:
            return "EXACT" if abs(float(actual) - float(expected)) < 1e-8 else "WRONG"
        except Exception:
            return "WRONG"
    if field == "vatLines":
        return "EXACT" if vat_lines(actual) == vat_lines(expected) else "WRONG"
    if field == "mixedRates":
        return "EXACT" if bool(actual) is bool(expected) else "WRONG"
    if field in {"iban", "vatId", "paymentReference"}:
        a = "".join(ch for ch in str(actual).upper() if ch.isalnum())
        e = "".join(ch for ch in str(expected).upper() if ch.isalnum())
        if str(actual).strip() == str(expected).strip():
            return "EXACT"
        return "NORMALIZED" if a == e else "WRONG"
    if str(actual) == str(expected):
        return "EXACT"
    return "NORMALIZED" if norm_text(actual) == norm_text(expected) else "WRONG"


def run():
    cold_started = time.perf_counter()
    engine = processor.get_ocr_engine()
    cold_ms = (time.perf_counter() - cold_started) * 1000
    assert engine is not None, "RapidOCR must be available for V5 benchmark"

    field_counts = {f: {"EXACT":0,"NORMALIZED":0,"MISSING":0,"WRONG":0,"applicable":0} for f in FIELDS}
    records = []
    durations = []
    cpu_times = []
    pass_counts = []
    roi_docs = 0
    full_correct = 0
    review_required = 0
    ocr_failures = 0
    parser_failures = 0
    start_rss = rss_mb()

    original_ocr_rows = processor.ocr_rows

    for case in cases():
        calls = {"count": 0}

        def counted_ocr_rows(engine, image):
            calls["count"] += 1
            return original_ocr_rows(engine, image)

        processor.ocr_rows = counted_ocr_rows
        started = time.perf_counter()
        cpu_started = time.process_time()
        doc = None
        result = None
        extract_error = None
        parser_error = None
        try:
            doc = processor.extract_document(case["name"], case["mime"], case["raw"])
        except Exception as exc:
            extract_error = f"{type(exc).__name__}:{getattr(exc, 'code', '')}"
            ocr_failures += 1
        if doc is not None:
            try:
                result = processor.heuristic_extract(doc, case["name"], {})
            except Exception as exc:
                parser_error = f"{type(exc).__name__}:{exc}"
                parser_failures += 1
        elapsed = (time.perf_counter() - started) * 1000
        cpu_elapsed = (time.process_time() - cpu_started) * 1000
        processor.ocr_rows = original_ocr_rows

        durations.append(elapsed)
        cpu_times.append(cpu_elapsed)
        pass_counts.append(calls["count"])

        actual = actual_fields(result) if result is not None else {}
        statuses = {}
        for field, expected in case["expected"].items():
            if field not in FIELDS:
                continue
            status = classify(field, expected, actual.get(field))
            statuses[field] = status
            field_counts[field][status] += 1
            field_counts[field]["applicable"] += 1

        correct = bool(statuses) and all(x in {"EXACT","NORMALIZED"} for x in statuses.values())
        if correct:
            full_correct += 1

        routing = ((result.processing or {}).get("reviewRouting") or {}) if result is not None else {}
        needs_review = result is None or routing.get("mode") == "FULL_REVIEW" or bool(routing.get("fields"))
        review_required += int(needs_review)

        roi_used = bool((doc or {}).get("financialFocusUsed") or (doc or {}).get("headerFocusUsed"))
        roi_docs += int(roi_used)

        native_no_ocr_ok = not case.get("expect_no_ocr") or not bool((doc or {}).get("ocrPages"))

        records.append({
            "id": case["id"],
            "tags": case["tags"],
            "durationMs": round(elapsed, 2),
            "cpuMs": round(cpu_elapsed, 2),
            "ocrPasses": calls["count"],
            "roiUsed": roi_used,
            "ocrVariant": (doc or {}).get("ocrVariant"),
            "qualityFlags": ((doc or {}).get("imageQuality") or {}).get("flags", []),
            "ocrPages": (doc or {}).get("ocrPages", []),
            "nativePdfNoOcrOk": native_no_ocr_ok,
            "extractError": extract_error,
            "parserError": parser_error,
            "reviewRequired": needs_review,
            "fullyCorrect": correct,
            "statuses": statuses,
            "actual": {k: actual.get(k) for k in case["expected"] if k in FIELDS},
        })

    processor.ocr_rows = original_ocr_rows
    peak_rss = rss_mb()
    field_accuracy = {}
    for field, stats in field_counts.items():
        total = stats["applicable"]
        field_accuracy[field] = round((stats["EXACT"] + stats["NORMALIZED"]) / total, 4) if total else None

    by_tag = {}
    tags = sorted({tag for case in cases() for tag in case["tags"]})
    for tag in tags:
        matching = [r for r in records if tag in r["tags"]]
        by_tag[tag] = {
            "documents": len(matching),
            "fullyCorrect": sum(1 for r in matching if r["fullyCorrect"]),
            "p50Ms": round(percentile([r["durationMs"] for r in matching], .50), 2),
            "p95Ms": round(percentile([r["durationMs"] for r in matching], .95), 2),
            "avgOcrPasses": round(statistics.mean([r["ocrPasses"] for r in matching]), 2),
        }

    payload = {
        "baselineSha": os.environ.get("GITHUB_SHA") or os.environ.get("BOOKUNA_BENCHMARK_SHA") or "local",
        "processorVersion": processor.PROCESSOR_VERSION,
        "processorRevision": processor.PROCESSOR_REVISION,
        "ocrStack": processor.ocr_stack_info(),
        "documents": len(records),
        "fieldStatus": field_counts,
        "fieldAccuracy": field_accuracy,
        "fullyCorrectDocuments": full_correct,
        "fullyCorrectRate": round(full_correct / len(records), 4),
        "reviewRequiredDocuments": review_required,
        "reviewRequiredRate": round(review_required / len(records), 4),
        "ocrFailures": ocr_failures,
        "parserFailures": parser_failures,
        "p50Ms": round(percentile(durations, .50), 2),
        "p95Ms": round(percentile(durations, .95), 2),
        "cpuP50Ms": round(percentile(cpu_times, .50), 2),
        "cpuP95Ms": round(percentile(cpu_times, .95), 2),
        "ocrColdStartMs": round(cold_ms, 2),
        "peakRssMb": round(peak_rss, 2) if peak_rss is not None else None,
        "rssStartMb": round(start_rss, 2) if start_rss is not None else None,
        "totalOcrPasses": sum(pass_counts),
        "avgOcrPasses": round(statistics.mean(pass_counts), 3),
        "roiDocuments": roi_docs,
        "roiRate": round(roi_docs / len(records), 4),
        "nativePdfNoOcr": all(r["nativePdfNoOcrOk"] for r in records),
        "byTag": by_tag,
        "records": records,
    }

    output = os.environ.get("BOOKUNA_OCR_V5_REPORT")
    if output:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    print("OCR_V5_BENCHMARK_JSON=" + json.dumps(payload, sort_keys=True))
    assert payload["documents"] >= 28
    assert payload["nativePdfNoOcr"] is True
    return payload


if __name__ == "__main__":
    run()
