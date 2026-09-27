import base64, csv, hashlib, io, json, math, os, re, tempfile, time
from datetime import datetime, date
from pathlib import Path
from typing import Any, Literal

import fitz
import pdfplumber
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
import numpy as np
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass
from docx import Document as DocxDocument
from openpyxl import load_workbook
from receipt_math import detect_vat_rates, has_complex_adjustments, derive_single_rate_amounts, enforce_single_rate_consistency
from financial_blocks import parse_financial_blocks

RAPIDOCR_GENERATION = "none"
try:
    from rapidocr import RapidOCR
    RAPIDOCR_GENERATION = "v3"
except Exception:
    try:
        from rapidocr_onnxruntime import RapidOCR
        RAPIDOCR_GENERATION = "legacy"
    except Exception:
        RapidOCR = None

_OCR_ENGINE = None
_OCR_ENGINE_ERROR = None
OCR_MODEL_NAME = "PP-OCRv6-small" if RAPIDOCR_GENERATION == "v3" else ("RapidOCR legacy" if RAPIDOCR_GENERATION == "legacy" else None)

APP_ORIGIN = os.getenv("APP_ORIGIN", "https://boekuna-boekhouding.onrender.com").rstrip("/")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vuwfyhtejsxhdfyvkkeq.supabase.co").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MAX_BYTES = int(os.getenv("MAX_FILE_BYTES", str(15 * 1024 * 1024)))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-sol")
REQUEST_TIMEOUT = float(os.getenv("AI_TIMEOUT_SECONDS", "55"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "600"))
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20"))
_REQUEST_TIMES: dict[str, list[float]] = {}

app = FastAPI(title="Kwinest Document Processor", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[APP_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)

# ----------------------------- schema -----------------------------
class Supplier(BaseModel):
    name: str | None = None
    address: str | None = None
    postalCode: str | None = None
    city: str | None = None
    country: str | None = None
    kvk: str | None = None
    vatNumber: str | None = None
    iban: str | None = None
    email: str | None = None

class Customer(BaseModel):
    name: str | None = None
    address: str | None = None
    postalCode: str | None = None
    city: str | None = None
    country: str | None = None
    kvk: str | None = None
    vatNumber: str | None = None
    email: str | None = None

class InvoiceMeta(BaseModel):
    invoiceNumber: str | None = None
    invoiceDate: str | None = None
    dueDate: str | None = None
    paymentTermDays: int | None = None
    orderNumber: str | None = None
    paymentReference: str | None = None
    description: str | None = None

class VatLine(BaseModel):
    rate: float
    taxableAmount: float | None = None
    vatAmount: float | None = None

class Adjustment(BaseModel):
    type: str = "other_fee"
    description: str | None = None
    subtotal: float | None = None
    vatTotal: float | None = None
    total: float | None = None
    vatRate: float | None = None
    direction: Literal["deduction", "addition"] = "deduction"
    counterparty: str | None = None

class Amounts(BaseModel):
    subtotal: float | None = None
    vatLines: list[VatLine] = Field(default_factory=list)
    vatTotal: float | None = None
    total: float | None = None
    settlementAmount: float | None = None
    discount: float | None = None
    shipping: float | None = None
    currency: str = "EUR"

class LineItem(BaseModel):
    description: str | None = None
    quantity: float | None = None
    unitPrice: float | None = None
    vatRate: float | None = None
    lineTotal: float | None = None

class ExtractionResult(BaseModel):
    documentType: Literal["purchase_invoice", "sales_invoice", "credit_invoice", "receipt", "bank_document", "other"] = "other"
    originalFileName: str
    pageCount: int = 1
    supplier: Supplier = Field(default_factory=Supplier)
    customer: Customer = Field(default_factory=Customer)
    invoice: InvoiceMeta = Field(default_factory=InvoiceMeta)
    amounts: Amounts = Field(default_factory=Amounts)
    status: Literal["draft", "open", "paid", "overdue", "cancelled", "credit", "unknown"] = "unknown"
    lineItems: list[LineItem] = Field(default_factory=list)
    adjustments: list[Adjustment] = Field(default_factory=list)
    confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    processing: dict[str, Any] = Field(default_factory=dict)

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v):
        return {str(k): max(0.0, min(1.0, float(val))) for k, val in (v or {}).items() if _finite(val)}

# ----------------------------- helpers -----------------------------
MONEY_RE = re.compile(r"(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d+(?:[.,]\d{2})(?!\w)", re.I)
DATE_RES = [
    re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b"),
    re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b"),
]
MONTHS = {"januari":1,"februari":2,"maart":3,"april":4,"mei":5,"juni":6,"juli":7,"augustus":8,"september":9,"oktober":10,"november":11,"december":12,
          "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,"july":7,"august":8,"september":9,"october":10,"november":11,"december":12}

def _finite(x):
    try: return math.isfinite(float(x))
    except Exception: return False

def norm_text(s: str) -> str:
    return re.sub(r"[ \t]+", " ", (s or "").replace("\u00a0", " ")).strip()

def norm_money(v: Any) -> float | None:
    if v is None: return None
    s = str(v).strip().replace("€", "").replace("EUR", "").replace("euro", "").replace(" ", "")
    s = re.sub(r"[^0-9,\.\-+]", "", s)
    if not s: return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts[-1]) == 2:
            s = "".join(parts[:-1]).replace(".", "") + "." + parts[-1]
        else:
            s = s.replace(",", "")
    elif s.count(".") > 1:
        parts = s.split(".")
        if len(parts[-1]) == 2:
            s = "".join(parts[:-1]) + "." + parts[-1]
        else:
            s = "".join(parts)
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except Exception:
        return None

def money_tokens(line: str) -> list[float]:
    out=[]
    for m in MONEY_RE.finditer(line or ""):
        n=norm_money(m.group(0))
        if n is not None and abs(n)<1e9: out.append(n)
    return out

def norm_date(s: str) -> str | None:
    if not s: return None
    st = norm_text(s).lower()
    m=DATE_RES[0].search(st)
    if m:
        try: return date(int(m[1]),int(m[2]),int(m[3])).isoformat()
        except Exception: pass
    m=DATE_RES[1].search(st)
    if m:
        try: return date(int(m[3]),int(m[2]),int(m[1])).isoformat()
        except Exception: pass
    m=re.search(r"\b(\d{1,2})\s+("+"|".join(MONTHS)+r")\s+(20\d{2})\b", st)
    if m:
        try: return date(int(m[3]),MONTHS[m[2]],int(m[1])).isoformat()
        except Exception: pass
    return None

def line_after_label(lines:list[str], labels:list[str], max_ahead=2) -> tuple[str|None,int|None]:
    low_labels=[x.lower() for x in labels]
    for i,line in enumerate(lines):
        low=line.lower()
        for lab in low_labels:
            pos=low.find(lab)
            if pos>=0:
                rest=line[pos+len(lab):].lstrip(" :#.-")
                if rest: return rest,i
                for j in range(i+1,min(len(lines),i+1+max_ahead)):
                    if lines[j].strip(): return lines[j].strip(),j
    return None,None

def labeled_amount(lines:list[str], labels:list[str], exclude:list[str]=[]) -> tuple[float|None,float]:
    candidates=[]
    for i,line in enumerate(lines):
        low=line.lower()
        if any(x in low for x in exclude): continue
        for rank,lab in enumerate(labels):
            if lab in low:
                vals=money_tokens(line)
                if not vals and i+1<len(lines): vals=money_tokens(lines[i+1])
                if vals:
                    score=0.98-rank*0.015 + (0.01 if i>len(lines)*.5 else 0)
                    candidates.append((vals[-1],min(score,.99)))
    return max(candidates,key=lambda x:x[1]) if candidates else (None,0.0)

def labeled_date(lines:list[str], labels:list[str]) -> tuple[str|None,float]:
    for rank,lab in enumerate(labels):
        for i,line in enumerate(lines):
            if lab in line.lower():
                for j in range(i,min(len(lines),i+3)):
                    d=norm_date(lines[j])
                    if d: return d,max(.7,.96-rank*.03)
    return None,0.0

def valid_iban(v:str|None)->bool:
    if not v:return False
    s=re.sub(r"\s+","",v).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}",s):return False
    rearr=s[4:]+s[:4]
    digits="".join(str(ord(c)-55) if c.isalpha() else c for c in rearr)
    try:return int(digits)%97==1
    except Exception:return False

def vat_plausible(v:str|None)->bool:
    if not v:return False
    s=re.sub(r"[\s.\-]","",v).upper()
    return bool(re.fullmatch(r"NL\d{9}B\d{2}",s) or re.fullmatch(r"[A-Z]{2}[A-Z0-9]{6,14}",s))

def kvk_plausible(v:str|None)->bool:
    return bool(v and re.fullmatch(r"\d{8}",re.sub(r"\D","",v)))

def own_matches(block:dict, company:dict)->bool:
    cvat=re.sub(r"\s+","",str(company.get("vat") or company.get("vatNumber") or "")).upper()
    ckvk=re.sub(r"\D","",str(company.get("kvk") or ""))
    cname=norm_text(str(company.get("name") or company.get("tradeName") or "")).lower()
    bvat=re.sub(r"\s+","",str(block.get("vatNumber") or "")).upper()
    bkvk=re.sub(r"\D","",str(block.get("kvk") or ""))
    bname=norm_text(str(block.get("name") or "")).lower()
    return bool((cvat and bvat==cvat) or (ckvk and bkvk==ckvk) or (cname and bname and (cname in bname or bname in cname)))

def allow_request(request: Request) -> bool:
    now=time.time()
    forwarded=(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip=forwarded or (request.client.host if request.client else "unknown")
    recent=[t for t in _REQUEST_TIMES.get(ip,[]) if now-t<RATE_LIMIT_WINDOW]
    if len(recent)>=RATE_LIMIT_MAX:
        _REQUEST_TIMES[ip]=recent
        return False
    recent.append(now)
    _REQUEST_TIMES[ip]=recent
    if len(_REQUEST_TIMES)>5000:
        cutoff=now-RATE_LIMIT_WINDOW
        for key in list(_REQUEST_TIMES.keys())[:2500]:
            kept=[t for t in _REQUEST_TIMES.get(key,[]) if t>=cutoff]
            if kept:_REQUEST_TIMES[key]=kept
            else:_REQUEST_TIMES.pop(key,None)
    return True

def best_vat_pair(rate: float, vals: list[float]) -> tuple[float|None,float|None]:
    nums=[abs(float(v)) for v in vals if _finite(v)]
    if not nums:return None,None
    if rate==0:
        return (max(nums),0.0)
    if len(nums)==1:
        return None,nums[0]
    best=None
    for i,base in enumerate(nums):
        for j,tax in enumerate(nums):
            if i==j:continue
            expected=base*rate/100
            err=abs(expected-tax)
            rel=err/max(.05,expected)
            # Prefer arithmetically consistent pairs; totals/gross amounts score poorly as tax.
            score=rel+(0.002*j)
            if best is None or score<best[0]:best=(score,base,tax)
    if best and best[0]<=.12:
        return best[1],best[2]
    # Fallback: on a VAT row the smallest positive monetary value is usually the tax.
    tax=min(nums)
    base=tax*100/rate if rate else None
    return base,tax

# ----------------------------- document extraction -----------------------------
def get_ocr_engine():
    global _OCR_ENGINE, _OCR_ENGINE_ERROR
    if _OCR_ENGINE is not None:
        return _OCR_ENGINE
    if RapidOCR is None:
        return None
    try:
        if RAPIDOCR_GENERATION == "v3":
            # RapidOCR 3.9.x ships the PP-OCRv6 small ONNX models in the wheel.
            # This keeps Boekuna free/lightweight while using current PaddleOCR-derived models.
            _OCR_ENGINE = RapidOCR(params={
                "Global.text_score": 0.30,
                "Global.max_side_len": 2600,
                "Global.min_side_len": 30,
                "Global.use_preprocess_img": True,
                "Global.log_level": "warning",
            })
        else:
            _OCR_ENGINE = RapidOCR()
        _OCR_ENGINE_ERROR = None
    except Exception as exc:
        _OCR_ENGINE_ERROR = f"{type(exc).__name__}: {exc}"
        _OCR_ENGINE = None
    return _OCR_ENGINE

def prepare_ocr_image(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    w,h = img.size
    longest=max(w,h)
    if longest < 1800:
        scale=min(2.2,1800/max(1,longest))
        img=img.resize((max(1,int(w*scale)),max(1,int(h*scale))),Image.Resampling.LANCZOS)
    elif longest > 4200:
        scale=4200/longest
        img=img.resize((max(1,int(w*scale)),max(1,int(h*scale))),Image.Resampling.LANCZOS)
    return img

def enhanced_receipt_variant(img: Image.Image) -> Image.Image:
    gray=ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=1)
    gray=ImageEnhance.Contrast(gray).enhance(1.28)
    gray=gray.filter(ImageFilter.UnsharpMask(radius=1.2, percent=135, threshold=3))
    return gray.convert("RGB")

def _legacy_ocr_rows(result: Any) -> list[dict[str,Any]]:
    rows=[]
    legacy=result
    if isinstance(result,tuple) and len(result)>=1:
        legacy=result[0]
    for row in legacy or []:
        if not isinstance(row,(list,tuple)) or len(row)<3:
            continue
        try:
            box=row[0]
            txt=norm_text(str(row[1]))
            conf=float(row[2])
        except Exception:
            continue
        if txt:
            rows.append({"box":box,"text":txt,"confidence":conf})
    return rows

def ocr_rows(engine: Any, img: Image.Image) -> list[dict[str,Any]]:
    result=engine(np.asarray(img))
    txts=getattr(result,"txts",None)
    scores=getattr(result,"scores",None)
    boxes=getattr(result,"boxes",None)
    if txts is None or scores is None:
        return _legacy_ocr_rows(result)
    rows=[]
    boxes_list=boxes.tolist() if hasattr(boxes,"tolist") else (list(boxes) if boxes is not None else [])
    for i,txt in enumerate(txts or []):
        clean=norm_text(str(txt or ""))
        if not clean:
            continue
        try: conf=float(scores[i])
        except Exception: conf=0.0
        box=boxes_list[i] if i<len(boxes_list) else None
        rows.append({"box":box,"text":clean,"confidence":conf})
    def pos(row):
        box=row.get("box") or []
        try:
            xs=[float(p[0]) for p in box]; ys=[float(p[1]) for p in box]
            return (min(ys),min(xs))
        except Exception:
            return (1e9,1e9)
    rows.sort(key=pos)
    return rows

def ocr_candidate_score(rows:list[dict[str,Any]]) -> float:
    if not rows:
        return -1.0
    text="\n".join(r["text"] for r in rows)
    confs=[float(r.get("confidence") or 0) for r in rows]
    avg=sum(confs)/len(confs) if confs else 0
    printable=len(re.sub(r"\s+","",text))
    money_count=len(MONEY_RE.findall(text))
    keyword_count=len(re.findall(r"\b(?:totaal|total|btw|vat|datum|date|pin|eur|euro|subtotal|subtotaal)\b",text,re.I))
    return avg*100 + min(printable,1600)/35 + min(money_count,14)*4 + min(keyword_count,10)*3

FINANCIAL_FOCUS_RE=re.compile(r"\b(?:totaal|total|te betalen|amount due|subtotaal|subtotal|btw|vat|tax|incl\.?|excl\.?|9\s*%|21\s*%)\b",re.I)

def _ocr_row_bounds(row:dict[str,Any])->tuple[float,float,float,float]|None:
    box=row.get("box") or []
    try:
        xs=[float(p[0]) for p in box];ys=[float(p[1]) for p in box]
        if not xs or not ys:return None
        return min(xs),min(ys),max(xs),max(ys)
    except Exception:
        return None

def targeted_financial_ocr(img:Image.Image,rows:list[dict[str,Any]],engine:Any)->dict[str,Any]:
    """Re-scan only the financial band after the first full-page OCR."""
    bounds=[]
    for row in rows or []:
        txt=str(row.get("text") or "")
        if FINANCIAL_FOCUS_RE.search(txt) or (money_tokens(txt) and re.search(r"\b(?:eur|euro|€)\b",txt,re.I)):
            b=_ocr_row_bounds(row)
            if b:bounds.append(b)
    if not bounds:
        return {"text":"","rows":[],"confidence":None,"used":False}
    w,h=img.size
    y0=max(0,int(min(b[1] for b in bounds)-h*.07))
    y1=min(h,int(max(b[3] for b in bounds)+h*.10))
    if y1-y0<max(180,int(h*.10)):
        mid=(y0+y1)//2
        half=max(160,int(h*.12))
        y0=max(0,mid-half);y1=min(h,mid+half)
    # If nearly the whole receipt was selected, a focused pass adds no value.
    if y1-y0>h*.88:
        return {"text":"","rows":[],"confidence":None,"used":False}
    crop=img.crop((0,y0,w,y1))
    if crop.height<720:
        scale=min(2.0,720/max(1,crop.height))
        crop=crop.resize((max(1,int(crop.width*scale)),max(1,int(crop.height*scale))),Image.Resampling.LANCZOS)
    focus_rows=ocr_rows(engine,enhanced_receipt_variant(crop))
    text="\n".join(r["text"] for r in focus_rows)
    if len(MONEY_RE.findall(text))<1:
        return {"text":"","rows":[],"confidence":None,"used":False}
    confs=[float(r.get("confidence") or 0) for r in focus_rows]
    return {"text":text,"rows":focus_rows,"confidence":sum(confs)/len(confs) if confs else None,"used":True}

def run_best_ocr(img:Image.Image) -> dict[str,Any]:
    engine=get_ocr_engine()
    if not engine:
        raise RuntimeError(_OCR_ENGINE_ERROR or "OCR-engine is niet beschikbaar")
    primary=prepare_ocr_image(img)
    rows1=ocr_rows(engine,primary)
    score1=ocr_candidate_score(rows1)
    text1="\n".join(r["text"] for r in rows1)
    conf1=sum(float(r.get("confidence") or 0) for r in rows1)/len(rows1) if rows1 else 0
    money1=len(MONEY_RE.findall(text1))
    keywords1=bool(re.search(r"\b(?:totaal|total|te betalen|amount due)\b",text1,re.I))
    best_rows,best_score,best_variant=rows1,score1,"normalized-color"
    # A second pass is only run when the first pass looks weak. This avoids doubling
    # CPU on clear receipts but helps low contrast, shadows and thermal paper.
    if conf1 < .90 or len(re.sub(r"\s+","",text1)) < 220 or money1 < 2 or not keywords1:
        rows2=ocr_rows(engine,enhanced_receipt_variant(primary))
        score2=ocr_candidate_score(rows2)
        if score2 > best_score + .5:
            best_rows,best_score,best_variant=rows2,score2,"enhanced-grayscale"
    text="\n".join(r["text"] for r in best_rows)
    confs=[float(r.get("confidence") or 0) for r in best_rows]
    focus=targeted_financial_ocr(primary,best_rows,engine)
    return {
        "text":text,
        "rows":best_rows,
        "confidence":sum(confs)/len(confs) if confs else None,
        "variant":best_variant,
        "qualityScore":round(best_score,2),
        "financialText":focus.get("text") or "",
        "financialFocusUsed":bool(focus.get("used")),
        "financialConfidence":focus.get("confidence"),
        "engine":"RapidOCR 3 / ONNX" if RAPIDOCR_GENERATION=="v3" else "RapidOCR legacy",
        "model":OCR_MODEL_NAME,
    }

def extract_pdf(raw:bytes) -> dict[str,Any]:
    doc=fitz.open(stream=raw,filetype="pdf")
    if doc.page_count>50: raise HTTPException(400,"PDF bevat meer dan 50 pagina's.")
    pages=[]; all_text=[]; layout=[]; tables=[]; ocr_pages=[]
    # pdfplumber is separate because its table finder is useful on vector PDFs
    plumber=None
    try: plumber=pdfplumber.open(io.BytesIO(raw))
    except Exception: plumber=None
    ocr_engine=get_ocr_engine()
    for idx in range(doc.page_count):
        page=doc[idx]
        words=page.get_text("words", sort=True)
        blocks=page.get_text("blocks", sort=True)
        text=page.get_text("text", sort=True) or ""
        text=norm_text(text.replace("\r","\n")).replace(" \n","\n")
        page_layout=[{"x0":round(w[0],1),"y0":round(w[1],1),"x1":round(w[2],1),"y1":round(w[3],1),"text":norm_text(w[4])} for w in words if norm_text(w[4])]
        page_tables=[]
        if plumber and idx<len(plumber.pages):
            try:
                for table in plumber.pages[idx].extract_tables() or []:
                    clean=[[norm_text(c or "") for c in row] for row in table if row]
                    if clean: page_tables.append(clean)
            except Exception: pass
        printable=len(re.sub(r"\s+","",text))
        used_ocr=False; ocr_conf=None
        sparse_text=printable < 180 or (len(words) < 35 and not page_tables)
        if sparse_text and ocr_engine:
            pix=page.get_pixmap(matrix=fitz.Matrix(2.45,2.45), alpha=False)
            img=Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            try:
                best=run_best_ocr(img)
                ocr_text=best["text"]
                ocr_printable=len(re.sub(r"\s+","",ocr_text))
                if ocr_printable > max(printable + 30, int(printable * 1.12)):
                    text=ocr_text
                    used_ocr=True
                elif ocr_printable >= 120 and printable < 260:
                    text=(text+"\n--- OCR LAYER ---\n"+ocr_text).strip()
                    used_ocr=True
                if used_ocr:
                    ocr_conf=best.get("confidence")
                    ocr_pages.append(idx+1)
            except Exception:
                pass
        pages.append({"page":idx+1,"text":text,"charCount":len(text),"ocr":used_ocr,"ocrConfidence":ocr_conf,"tables":page_tables})
        all_text.append(f"--- PAGE {idx+1} ---\n{text}")
        layout.append({"page":idx+1,"words":page_layout[:2500]})
        if page_tables: tables.extend([{"page":idx+1,"rows":t} for t in page_tables])
    if plumber:
        try: plumber.close()
        except Exception: pass
    return {"kind":"pdf","pageCount":doc.page_count,"pages":pages,"text":"\n\n".join(all_text),"layout":layout,"tables":tables,"ocrPages":ocr_pages,"ocrEngine":"RapidOCR 3 / ONNX" if ocr_pages and RAPIDOCR_GENERATION=="v3" else ("RapidOCR legacy" if ocr_pages else None),"ocrModel":OCR_MODEL_NAME if ocr_pages else None}

def extract_image(raw:bytes) -> dict[str,Any]:
    if not RapidOCR:
        raise HTTPException(503,"OCR-engine is niet beschikbaar op de server.")
    try:
        img=Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(415,f"Deze foto kon niet worden geopend ({type(exc).__name__}). Gebruik een normale foto of exporteer hem als JPG/PNG.")
    try:
        best=run_best_ocr(img)
    except Exception as exc:
        raise HTTPException(503,f"OCR kon niet worden gestart ({type(exc).__name__}). Probeer het opnieuw.")
    text=best["text"]
    layout=best["rows"]
    if len(re.sub(r"\s+","",text))<12:
        raise HTTPException(422,"Er is te weinig leesbare tekst op deze bon gevonden. Maak een scherpere foto met de volledige bon in beeld.")
    return {
        "kind":"image","pageCount":1,
        "pages":[{"page":1,"text":text,"charCount":len(text),"ocr":True,"ocrConfidence":best.get("confidence"),"tables":[]}],
        "text":text,"financialText":best.get("financialText") or "","layout":[{"page":1,"words":layout}],"tables":[],"ocrPages":[1],
        "ocrEngine":best.get("engine"),"ocrModel":best.get("model"),
        "processingHints":{"ocrVariant":best.get("variant"),"ocrQualityScore":best.get("qualityScore"),"financialFocusUsed":bool(best.get("financialFocusUsed")),"financialConfidence":best.get("financialConfidence")}
    }

def extract_docx(raw:bytes)->dict[str,Any]:
    doc=DocxDocument(io.BytesIO(raw)); chunks=[]; tables=[]
    for p in doc.paragraphs:
        if norm_text(p.text):chunks.append(norm_text(p.text))
    for t in doc.tables:
        rows=[[norm_text(c.text) for c in r.cells] for r in t.rows];tables.append({"page":1,"rows":rows});chunks.extend(" | ".join(r) for r in rows)
    text="\n".join(chunks)
    return {"kind":"docx","pageCount":1,"pages":[{"page":1,"text":text,"charCount":len(text),"ocr":False,"tables":tables}],"text":text,"layout":[],"tables":tables,"ocrPages":[]}

def extract_xlsx(raw:bytes)->dict[str,Any]:
    wb=load_workbook(io.BytesIO(raw),data_only=True,read_only=True); lines=[]; tables=[]
    for ws in wb.worksheets:
        rows=[]
        for row in ws.iter_rows(values_only=True):
            vals=["" if v is None else str(v) for v in row]
            if any(vals): rows.append(vals); lines.append(" | ".join(vals))
        if rows: tables.append({"sheet":ws.title,"rows":rows[:1000]})
    text="\n".join(lines)
    return {"kind":"xlsx","pageCount":len(wb.worksheets),"pages":[],"text":text,"layout":[],"tables":tables,"ocrPages":[]}

def extract_csv(raw:bytes)->dict[str,Any]:
    text=raw.decode("utf-8-sig",errors="replace")
    sniffer=csv.Sniffer()
    try: dialect=sniffer.sniff(text[:4000],delimiters=",;\t|")
    except Exception: dialect=csv.excel
    rows=[row for row in csv.reader(io.StringIO(text),dialect) if any(c.strip() for c in row)]
    joined="\n".join(" | ".join(row) for row in rows)
    return {"kind":"csv","pageCount":1,"pages":[],"text":joined,"layout":[],"tables":[{"sheet":"CSV","rows":rows[:5000]}],"ocrPages":[]}

def extract_document(filename:str,content_type:str,raw:bytes)->dict[str,Any]:
    ext=Path(filename).suffix.lower(); c=(content_type or "").lower()
    if raw[:4]==b"%PDF" or ext==".pdf" or c=="application/pdf": return extract_pdf(raw)
    if ext in {".png",".jpg",".jpeg",".webp",".heic",".heif",".tif",".tiff",".bmp",".gif"} or c.startswith("image/"): return extract_image(raw)
    if ext==".docx" or c=="application/vnd.openxmlformats-officedocument.wordprocessingml.document": return extract_docx(raw)
    if ext==".xlsx" or c=="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return extract_xlsx(raw)
    if ext==".csv" or c in {"text/csv","application/csv"}: return extract_csv(raw)
    raise HTTPException(415,"Dit bestandstype wordt nog niet ondersteund door de documentprocessor.")

# ----------------------------- deterministic invoice parser -----------------------------
def contact_block(lines:list[str], labels:list[str], company:dict, role:str)->tuple[dict,float]:
    idx=None; matched_label=None
    for i,line in enumerate(lines[:120]):
        low=line.lower().strip()
        for lab in labels:
            lab=lab.lower().strip()
            if low==lab or low.startswith(lab+':') or low.startswith(lab+' -'):
                idx=i; matched_label=lab; break
        if idx is not None: break
    block=lines[idx:idx+12] if idx is not None else lines[:18]
    block=[x for x in block if x and not re.match(r"^-{2,}\s*page\s+\d+\s*-{2,}$",x,re.I)]
    joined="\n".join(block)
    emails=re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",joined,re.I)
    vats=[re.sub(r"\s+","",x).upper() for x in re.findall(r"\b[A-Z]{2}\s?[A-Z0-9]{6,14}\b",joined,re.I)]
    nl_vats=[x for x in vats if re.fullmatch(r"NL\d{9}B\d{2}",x)]
    kvks=re.findall(r"(?:kvk|k\.v\.k\.|coc|chamber of commerce)(?:\s*(?:nr|nummer|number|no))?\s*[:#-]?\s*(\d{8})",joined,re.I)
    ibans=[re.sub(r"\s+","",x).upper() for x in re.findall(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b",joined,re.I)]
    postal=re.search(r"\b([1-9]\d{3})\s*([A-Z]{2})\b(?:\s+([^\n,;|]{2,50}))?",joined,re.I)
    address_re=re.compile(r"\b\d+[A-Z-]*\b.*(?:straat|laan|weg|kade|plein|singel|dreef|gracht|boulevard|hof|street|road|avenue|lane|drive|place)|(?:straat|laan|weg|kade|plein|singel|dreef|gracht|boulevard|hof|street|road|avenue|lane|drive|place)[^\n]*\b\d+[A-Z-]*\b",re.I)
    address=next((x for x in block if address_re.search(x)),None)
    own_names=[norm_text(str(company.get(k) or "")).lower() for k in ("name","tradeName")]
    field_only=re.compile(r"^(?:leverancier|supplier|vendor|seller|from|factuur aan|bill to|sold to|customer|klant|debiteur|factuur|invoice|datum|date|totaal|total|btw|vat|kvk|iban|omschrijving|description|pagina|page)(?:\s*[:#-].*)?$",re.I)
    name=None
    # Strongest signal: value on the same line as the role label.
    if idx is not None and matched_label:
        line=lines[idx]
        pos=line.lower().find(matched_label)
        remainder=line[pos+len(matched_label):].lstrip(" :#.-")
        if 2<=len(remainder)<=100 and not field_only.match(remainder) and not address_re.search(remainder) and not re.match(r"^\d",remainder):
            name=remainder
    if not name and idx is not None:
        # Many invoices print a heading like "Leverancier" below the actual company name.
        for back in range(max(0,idx-3),idx):
            cand=lines[back].strip()
            if 2<=len(cand)<=100 and not field_only.match(cand) and not address_re.search(cand) and not re.match(r"^\d",cand) and "@" not in cand and not re.fullmatch(r"(?:B\.?V\.?|N\.?V\.?|VOF|CV|LLC|LTD\.?|INC\.?)",cand,re.I):
                if not re.match(r"^-{2,}\s*page\s+\d+",cand,re.I) and not re.search(r"factuur|invoice|creditnota|receipt",cand,re.I) and not any(o and o in cand.lower() for o in own_names):
                    name=cand;break
    if not name:
        for rawline in block:
            cand=re.sub(r"^(?:leverancier|supplier|vendor|seller|from|factuur aan|bill to|sold to|customer|klant|debiteur)\s*[:#-]?\s*","",rawline,flags=re.I).strip()
            if not (2<=len(cand)<=100): continue
            if field_only.match(cand) or address_re.search(cand) or re.match(r"^\d",cand) or "@" in cand: continue
            if re.match(r"^-{2,}\s*page\s+\d+",cand,re.I): continue
            if re.match(r"^(?:factuurdatum|factuurnummer|factuurnr|invoice date|invoice number|vervaldatum|due date|subtotaal|totaal|btw|vat|kvk|iban)\b",cand,re.I): continue
            if re.fullmatch(r"(?:B\.?V\.?|N\.?V\.?|VOF|CV|LLC|LTD\.?|INC\.?)",cand,re.I): continue
            if re.fullmatch(r"(?:onvolledige\s+)?(?:factuur|invoice|creditnota|receipt)",cand,re.I): continue
            if re.search(r"\b(?:kvk|btw|vat|iban|factuurnr|factuurnummer|invoice no|invoice number)\b",cand,re.I): continue
            if any(o and o in cand.lower() for o in own_names): continue
            name=cand;break
    data={"name":name,"address":address,"postalCode":f"{postal[1]} {postal[2].upper()}" if postal else None,"city":postal[3].strip() if postal and postal[3] else None,"country":"Nederland" if postal else None,
          "kvk":kvks[0] if kvks else None,"vatNumber":nl_vats[0] if nl_vats else None,"iban":next((x for x in ibans if valid_iban(x)),None),"email":emails[0] if emails else None}
    conf=.95 if idx is not None and name else (.68 if name else .25)
    return data,conf

def receipt_merchant_name(lines:list[str], company:dict)->str|None:
    own_names=[norm_text(str(company.get(k) or "")).lower() for k in ("name","tradeName")]
    skip=re.compile(r"^(?:bon|kassabon|receipt|factuur|invoice|datum|date|tijd|time|totaal|total|subtotaal|subtotal|btw|vat|pin|cash|contant|wisselgeld|change|bedankt|thank you|www\.|https?://)",re.I)
    for line in lines[:18]:
        cand=norm_text(line)
        low=cand.lower()
        if not (2<=len(cand)<=90):continue
        if skip.search(cand) or "@" in cand or re.fullmatch(r"[\d\s€$£.,:+*/#-]+",cand):continue
        if re.search(r"\b\d{4}\s?[A-Z]{2}\b|\b\d{2}[:.]\d{2}\b|\b(?:kvk|btw|vat|iban|tel|phone)\b",cand,re.I):continue
        if any(o and o in low for o in own_names):continue
        return cand
    return None

def strong_total_anchor(lines:list[str])->tuple[float|None,float]:
    """Find a receipt total that is explicitly labelled, avoiding VAT/subtotal rows."""
    candidates=[]
    for i,line in enumerate(lines or []):
        low=line.lower()
        if not re.search(r"\b(?:totaal|total|te betalen|amount due|grand total)\b",low,re.I):
            continue
        if re.search(r"\b(?:subtotaal|subtotal|btw|vat|tax|excl|korting|discount)\b",low,re.I):
            continue
        vals=money_tokens(line)
        if not vals:
            continue
        score=.955
        if re.search(r"\b(?:te betalen|amount due|grand total)\b",low,re.I):score=.985
        elif re.match(r"^\s*(?:totaal|total)\b",low,re.I):score=.975
        if "€" in line or re.search(r"\b(?:eur|euro)\b",low,re.I):score=min(.99,score+.005)
        if i>=max(0,len(lines)-12):score=min(.99,score+.005)
        candidates.append((abs(vals[-1]),score))
    return max(candidates,key=lambda x:x[1]) if candidates else (None,0.0)

def heuristic_extract(doc:dict, filename:str, company:dict)->ExtractionResult:
    text=doc.get("text") or ""
    table_lines=[]
    for table in doc.get("tables",[])[:30]:
        for row in (table.get("rows") or [])[:160]:
            line=" | ".join(norm_text(str(cell or "")) for cell in row)
            if norm_text(line): table_lines.append(line)
    if table_lines:
        text=(text+"\n\n--- STRUCTURED TABLES ---\n"+"\n".join(table_lines)).strip()
    lines=[norm_text(x) for x in text.splitlines() if norm_text(x)]
    financial_text=norm_text(doc.get("financialText") or "").replace(" \n","\n")
    financial_lines=[norm_text(x) for x in financial_text.splitlines() if norm_text(x)]
    amount_lines=[];seen_amount_lines=set()
    for line in financial_lines+lines:
        key=line.lower()
        if key not in seen_amount_lines:
            seen_amount_lines.add(key);amount_lines.append(line)
    low=text.lower()
    self_billing=bool(re.search(r"factuur\s+uitgereikt\s+door\s+afnemer|self[- ]?billing|self[- ]?billed",low))
    supplier,sconf=contact_block(lines,["leverancier","supplier","vendor","seller","from:"],company,"supplier")
    customer,cconf=contact_block(lines,["factuur aan","factureren aan","bill to","sold to","customer","klant","debiteur"],company,"customer")
    supplier_own=own_matches(supplier,company); customer_own=own_matches(customer,company)
    if self_billing or supplier_own and not customer_own: dtype="sales_invoice"
    else: dtype="purchase_invoice"
    if re.search(r"creditnota|credit note|creditfactuur|credit invoice",low): dtype="credit_invoice"
    if re.search(r"\bbon\b|receipt|kassabon",low) and not re.search(r"factuur|invoice",low): dtype="receipt"
    if dtype=="receipt" and not supplier.get("name"):
        merchant=receipt_merchant_name(lines,company)
        if merchant:supplier["name"]=merchant;sconf=max(sconf,.72)
    # if role extraction guessed own party, try to avoid assigning it as counterparty
    if supplier_own and dtype=="purchase_invoice": supplier={k:None for k in supplier}
    if customer_own and dtype=="sales_invoice": customer={k:None for k in customer}

    invno_raw,idx=line_after_label(lines,["factuurnummer","factuurnr","factuur nr","invoice number","invoice no","invoice #","document number"])
    invoice_no=None
    if invno_raw:
        m=re.search(r"([A-Z0-9][A-Z0-9._\-/]{1,50})",invno_raw,re.I); invoice_no=m.group(1) if m else None
    inv_date,inv_date_conf=labeled_date(lines,["factuurdatum","invoice date","date of invoice","document date"])
    if not inv_date and dtype=="receipt":
        for line in lines[:30]:
            d=norm_date(line)
            if d:
                inv_date,inv_date_conf=d,.76
                break
    due_date,due_conf=labeled_date(lines,["vervaldatum","due date","betaal voor","pay before","payment due"])
    order_raw,_=line_after_label(lines,["bestelnummer","ordernummer","order number","purchase order","po number"]); order_no=order_raw[:60] if order_raw else None
    ref_raw,_=line_after_label(lines,["betalingskenmerk","payment reference","payment ref","kenmerk"]); payref=ref_raw[:80] if ref_raw else None

    total,total_conf=labeled_amount(amount_lines,["totaal te betalen","te voldoen","amount due","balance due","grand total","totaal incl. btw","total incl. vat","invoice total","factuurbedrag","factuurtotaal"],["subtotaal","subtotal","excl"])
    subtotal,sub_conf=labeled_amount(amount_lines,["totaal excl. btw","bedrag excl. btw","total excl. vat","tax exclusive","net amount","subtotaal","subtotal"])
    vat_total,vat_conf=labeled_amount(amount_lines,["totaal btw","btw totaal","vat total","tax amount","btw-bedrag","btw bedrag"],["btw nr","btw-id","vat id"])
    discount,disc_conf=labeled_amount(amount_lines,["korting","discount"])
    shipping,ship_conf=labeled_amount(amount_lines,["verzendkosten","shipping","freight"])
    strong_total,strong_total_conf=strong_total_anchor(amount_lines)
    if strong_total is not None and strong_total_conf>total_conf:
        total,total_conf=strong_total,strong_total_conf
    if total is None:
        cands=[]
        for i,l in enumerate(amount_lines):
            if re.search(r"\b(totaal|total|te betalen|amount due)\b",l,re.I) and not re.search(r"subtotaal|subtotal|excl|btw|vat",l,re.I):
                vals=money_tokens(l)
                if vals:cands.append((abs(vals[-1]),.72+(i/len(lines) if lines else 0)*.08))
        if cands: total,total_conf=max(cands,key=lambda x:x[1])
    if subtotal is not None and vat_total is None and total is not None:
        candidate=round(total-subtotal,2)
        if candidate>=0 and candidate<=max(total*.3,1): vat_total,vat_conf=candidate,.75
    if total is None and subtotal is not None and vat_total is not None: total,total_conf=round(subtotal+vat_total,2),.76
    if subtotal is None and total is not None and vat_total is not None: subtotal,sub_conf=round(total-vat_total,2),.76

    financial_structure=parse_financial_blocks(amount_lines)
    structured_primary=financial_structure.get("primary") or {}
    if structured_primary:
        subtotal=structured_primary.get("subtotal")
        vat_total=structured_primary.get("vatTotal")
        total=structured_primary.get("total")
        section_conf=.995 if financial_structure.get("verified") else .92
        sub_conf=max(sub_conf,section_conf)
        vat_conf=max(vat_conf,section_conf)
        total_conf=max(total_conf,section_conf)

    vat_lines=[]
    for i,l in enumerate(amount_lines):
        rm=re.search(r"\b(0|9|21)(?:[.,]0+)?\s*%",l)
        if not rm: continue
        vals=money_tokens(l); rate=float(rm.group(1))
        taxable,tax=best_vat_pair(rate,vals)
        if tax is not None:
            vat_lines.append(VatLine(rate=rate,taxableAmount=round(taxable,2) if taxable is not None else None,vatAmount=round(tax,2)))
    # De-duplicate repeated VAT summaries. Prefer rows with a taxable base.
    unique=[]; seen=set()
    for v in sorted(vat_lines,key=lambda x:(x.taxableAmount is None,)):
        key=(v.rate,round(v.vatAmount or 0,2))
        if key not in seen:
            seen.add(key);unique.append(v)
    vat_lines=unique[:8]
    structured_rate=structured_primary.get("vatRate") if structured_primary else None
    if not vat_lines and structured_rate in (0,9,21) and subtotal is not None and vat_total is not None:
        vat_lines=[VatLine(rate=float(structured_rate),taxableAmount=round(float(subtotal),2),vatAmount=round(float(vat_total),2))]

    structured_adjustments=[Adjustment(**a) for a in financial_structure.get("adjustments",[])]
    settlement_amount=financial_structure.get("settlementAmount")

    # Arithmetic recovery: if exactly one taxable VAT rate is unambiguous and one
    # amount is a strong anchor, calculate the other amounts rather than trusting
    # weaker OCR reads. Never do this for mixed VAT or adjustment-heavy receipts.
    detected_rates=detect_vat_rates(amount_lines)
    derivation=derive_single_rate_amounts(
        rate=detected_rates[0] if len(detected_rates)==1 else None,
        subtotal=subtotal,vat_total=vat_total,total=total,
        subtotal_conf=sub_conf,vat_conf=vat_conf,total_conf=total_conf,
        allow=(len(detected_rates)==1 and not has_complex_adjustments(financial_text or "\n".join(amount_lines))),
    )
    if derivation.get("used") or derivation.get("conflicts"):
        subtotal=derivation.get("subtotal")
        vat_total=derivation.get("vatTotal")
        total=derivation.get("total")
        sub_conf=derivation.get("subtotalConfidence",sub_conf)
        vat_conf=derivation.get("vatConfidence",vat_conf)
        total_conf=derivation.get("totalConfidence",total_conf)

    iban=None
    for x in re.findall(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b",text,re.I):
        if valid_iban(x): iban=re.sub(r"\s+","",x).upper();break

    paid=bool(re.search(r"\b(reeds betaald|already paid|paid via|voldaan|betaald)\b",low))
    status="credit" if dtype=="credit_invoice" else ("paid" if (paid or dtype=="receipt") else "open")
    if due_date and status=="open":
        try:
            if date.fromisoformat(due_date)<date.today():status="overdue"
        except Exception: pass

    term=None
    if inv_date and due_date:
        try: term=(date.fromisoformat(due_date)-date.fromisoformat(inv_date)).days
        except Exception: pass
    if term is None:
        m=re.search(r"(?:betalingstermijn|payment term)[^\d]{0,20}(\d{1,3})\s*(?:dagen|days)",text,re.I)
        if m:term=int(m.group(1))

    confidence={
        "supplierName":sconf if supplier.get("name") else .15,
        "customerName":cconf if customer.get("name") else .15,
        "invoiceNumber":.92 if invoice_no else .15,
        "invoiceDate":inv_date_conf,
        "dueDate":due_conf if due_date else .25,
        "subtotal":sub_conf,
        "vatTotal":vat_conf,
        "total":total_conf,
        "iban":.9 if iban else .1,
    }
    if doc.get("ocrPages"):
        for k in list(confidence): confidence[k]*=.9
    if derivation.get("used") and derivation.get("anchorField"):
        anchor_key={"subtotal":"subtotal","vatTotal":"vatTotal","total":"total"}.get(derivation["anchorField"])
        anchor_conf=confidence.get(anchor_key,0) if anchor_key else 0
        for field in derivation.get("derivedFields",[]):
            if field in confidence:
                confidence[field]=max(confidence[field],max(.70,min(.98,anchor_conf*.985)))
    derivation_warnings=[]
    for conflict in derivation.get("conflicts",[]):
        derivation_warnings.append(f"Rekenkundige controle wijkt af voor {conflict['field']}: gelezen {conflict['read']:.2f}, berekend {conflict['calculated']:.2f}.")
    result=ExtractionResult(
        documentType=dtype,originalFileName=filename,pageCount=doc.get("pageCount",1),
        supplier=Supplier(**supplier),customer=Customer(**customer),
        invoice=InvoiceMeta(invoiceNumber=invoice_no,invoiceDate=inv_date,dueDate=due_date,paymentTermDays=term,orderNumber=order_no,paymentReference=payref),
        amounts=Amounts(subtotal=abs(subtotal) if subtotal is not None else None,vatLines=vat_lines,vatTotal=abs(vat_total) if vat_total is not None else None,total=abs(total) if total is not None else None,settlementAmount=abs(settlement_amount) if settlement_amount is not None else None,discount=abs(discount) if discount is not None else None,shipping=abs(shipping) if shipping is not None else None,currency="EUR"),
        status=status,lineItems=[],adjustments=structured_adjustments,confidence=confidence,warnings=derivation_warnings,
        processing={"textEngine":"PyMuPDF","tableEngine":"pdfplumber" if doc.get("kind")=="pdf" else None,"ocrEngine":doc.get("ocrEngine") if doc.get("ocrPages") else None,"ocrModel":doc.get("ocrModel") if doc.get("ocrPages") else None,"ocrVariant":(doc.get("processingHints") or {}).get("ocrVariant"),"financialFocusUsed":bool((doc.get("processingHints") or {}).get("financialFocusUsed")),"ocrPages":doc.get("ocrPages",[]),"sourceKind":doc.get("kind"),"financialBlocks":{"verified":bool(financial_structure.get("verified")),"primaryArithmeticOk":bool(financial_structure.get("primaryArithmeticOk")),"adjustmentArithmeticOk":bool(financial_structure.get("adjustmentArithmeticOk")),"settlementArithmeticOk":bool(financial_structure.get("settlementArithmeticOk")),"adjustmentTotal":financial_structure.get("adjustmentTotal"),"settlementSource":financial_structure.get("settlementSource")},"amountDerivation":{"used":bool(derivation.get("used")),"rate":derivation.get("rate"),"anchorField":derivation.get("anchorField"),"derivedFields":derivation.get("derivedFields",[]),"mixedRates":len(detected_rates)>1}}
    )
    return validate_result(result,company)

# ----------------------------- validation -----------------------------
def validate_result(r:ExtractionResult,company:dict)->ExtractionResult:
    w=list(r.warnings or [])
    a=r.amounts

    # Final accounting guardrail after OCR + AI reconciliation. Confidence can never
    # overrule VAT mathematics. For one unambiguous 9%/21% rate and no adjustments,
    # correct impossible amount combinations from the strongest accounting anchor.
    positive_rates=sorted({float(v.rate) for v in (a.vatLines or []) if v.rate in {9,21}})
    deriv_meta=(r.processing or {}).get("amountDerivation") or {}
    meta_rate=deriv_meta.get("rate")
    if len(positive_rates)==1:
        guard_rate=positive_rates[0]
    elif not positive_rates and meta_rate in (9,21) and not deriv_meta.get("mixedRates"):
        guard_rate=float(meta_rate)
    else:
        guard_rate=None
    guard_allowed=bool(
        guard_rate in (9,21)
        and not deriv_meta.get("mixedRates")
        and a.discount is None
        and a.shipping is None
    )
    guard=enforce_single_rate_consistency(
        rate=guard_rate,
        subtotal=a.subtotal,vat_total=a.vatTotal,total=a.total,
        subtotal_conf=r.confidence.get("subtotal",0),
        vat_conf=r.confidence.get("vatTotal",0),
        total_conf=r.confidence.get("total",0),
        allow=guard_allowed,
    )
    if guard.get("used"):
        a.subtotal=guard.get("subtotal")
        a.vatTotal=guard.get("vatTotal")
        a.total=guard.get("total")
        r.confidence["subtotal"]=guard.get("subtotalConfidence",r.confidence.get("subtotal",0))
        r.confidence["vatTotal"]=guard.get("vatConfidence",r.confidence.get("vatTotal",0))
        r.confidence["total"]=guard.get("totalConfidence",r.confidence.get("total",0))
        r.processing={**(r.processing or {}),"finalAmountGuard":{
            "used":True,"rate":guard_rate,"anchorField":guard.get("anchorField"),
            "correctedFields":guard.get("correctedFields",[]),"reason":guard.get("reason")
        }}
        corrected=", ".join(guard.get("correctedFields",[]))
        if corrected:
            w.append(f"Bedragen automatisch herberekend op basis van {guard_rate:g}% btw en het betrouwbare {guard.get('anchorField')} bedrag ({corrected}).")
    elif guard.get("reason")=="inconsistent_single_rate_amounts":
        w.append(f"Bedragen zijn niet rekenkundig consistent met {guard_rate:g}% btw; controleer deze bedragen handmatig.")
        for key in ("subtotal","vatTotal","total"):
            r.confidence[key]=min(r.confidence.get(key,.5),.65)

    tol=max(.05,abs(a.total or 0)*.002)
    if a.subtotal is not None and a.vatTotal is not None and a.total is not None:
        # Some invoices show subtotal after discount/shipping, others before. Accept the equation that best matches.
        candidates=[a.subtotal+a.vatTotal]
        if a.shipping is not None or a.discount is not None:
            candidates.append(a.subtotal+a.vatTotal+(a.shipping or 0)-(a.discount or 0))
        expected=min(candidates,key=lambda x:abs(x-a.total))
        if abs(expected-a.total)>tol:
            w.append(f"Bedragen sluiten niet aan: berekend {expected:.2f}, totaal {a.total:.2f}.")
            for key in ("subtotal","vatTotal","total"):r.confidence[key]=min(r.confidence.get(key,.5),.65)
    if r.invoice.invoiceDate:
        try: date.fromisoformat(r.invoice.invoiceDate)
        except Exception: w.append("Factuurdatum is ongeldig.");r.invoice.invoiceDate=None;r.confidence["invoiceDate"]=.1
    if r.invoice.dueDate:
        try:
            dd=date.fromisoformat(r.invoice.dueDate)
            if r.invoice.invoiceDate and dd<date.fromisoformat(r.invoice.invoiceDate):w.append("Vervaldatum ligt vóór factuurdatum.");r.confidence["dueDate"]=min(r.confidence.get("dueDate",.5),.45)
        except Exception:w.append("Vervaldatum is ongeldig.");r.invoice.dueDate=None;r.confidence["dueDate"]=.1
    if r.supplier.iban and not valid_iban(r.supplier.iban):w.append("IBAN van leverancier heeft geen geldige checksum.");r.supplier.iban=None;r.confidence["iban"]=.1
    if r.supplier.kvk and not kvk_plausible(r.supplier.kvk):w.append("KVK-nummer heeft geen plausibel Nederlands formaat.");r.confidence["supplierKvk"]=.35
    if r.supplier.vatNumber and not vat_plausible(r.supplier.vatNumber):w.append("BTW-nummer van leverancier heeft geen plausibel formaat.");r.confidence["supplierVatNumber"]=.35
    if a.total is not None and a.total<0 and r.documentType!="credit_invoice":w.append("Negatief totaal gevonden op document dat niet als creditfactuur is herkend.")
    if r.documentType!="credit_invoice" and a.total is not None:a.total=abs(a.total)
    if own_matches(r.supplier.model_dump(),company) and r.documentType=="purchase_invoice":w.append("Leverancier lijkt het eigen bedrijf te zijn; controleer leverancier vs. klant.");r.confidence["supplierName"]=min(r.confidence.get("supplierName",.5),.4)
    if own_matches(r.customer.model_dump(),company) and r.documentType=="sales_invoice":w.append("Klant lijkt het eigen bedrijf te zijn; controleer leverancier vs. klant.");r.confidence["customerName"]=min(r.confidence.get("customerName",.5),.4)
    if not r.invoice.invoiceNumber and r.documentType in {"purchase_invoice","sales_invoice","credit_invoice"}:w.append("Factuurnummer niet betrouwbaar gevonden.")
    if not r.supplier.name and r.documentType in {"purchase_invoice","credit_invoice"}:w.append("Leverancier niet betrouwbaar gevonden.")
    if not r.supplier.name and r.documentType=="receipt":w.append("Winkel/leverancier op de bon niet betrouwbaar gevonden.")
    if a.total is None:w.append("Totaalbedrag niet betrouwbaar gevonden.")

    # Separate costs/corrections must reconcile independently from the invoice.
    adjustment_total=0.0
    for adj in r.adjustments or []:
        if adj.total is None:
            continue
        subtotal_adj=abs(float(adj.subtotal or 0))
        vat_adj=abs(float(adj.vatTotal or 0))
        total_adj=abs(float(adj.total or 0))
        adjustment_total+=total_adj if adj.direction=="deduction" else -total_adj
        if abs((subtotal_adj+vat_adj)-total_adj)>max(.05,total_adj*.004):
            w.append(f"Kostenblok '{adj.type}' sluit niet aan: excl. + btw is niet gelijk aan totaal.")
        if adj.vatRate in {9,21} and adj.subtotal is not None and adj.vatTotal is not None:
            expected_adj=subtotal_adj*float(adj.vatRate)/100
            if abs(expected_adj-vat_adj)>max(.05,expected_adj*.02):
                w.append(f"Kostenblok '{adj.type}' heeft een btw-bedrag dat niet past bij {adj.vatRate:g}%.")

    if a.settlementAmount is not None and a.total is not None and r.adjustments:
        expected_settlement=round(float(a.total)-adjustment_total,2)
        if abs(expected_settlement-float(a.settlementAmount))>max(.08,abs(float(a.total))*.003):
            w.append(f"Uitbetaling sluit niet aan: factuur {a.total:.2f} minus/plus correcties = {expected_settlement:.2f}, maar uitbetaling is {a.settlementAmount:.2f}.")
            r.confidence["settlementAmount"]=min(r.confidence.get("settlementAmount",.5),.55)
        else:
            r.confidence["settlementAmount"]=max(r.confidence.get("settlementAmount",0),.98)

    # VAT line consistency
    if a.vatLines:
        known=sum(v.vatAmount or 0 for v in a.vatLines)
        if a.vatTotal is not None and known and abs(known-a.vatTotal)>max(.05,a.vatTotal*.01):w.append("Som van btw-regels wijkt af van totaal btw.")
        for v in a.vatLines:
            if v.rate not in {0,9,21} and not (0<=v.rate<=30):w.append(f"Ongebruikelijk btw-tarief: {v.rate}%.")
            if v.taxableAmount is not None and v.vatAmount is not None and v.rate>0:
                expected=v.taxableAmount*v.rate/100
                if abs(expected-v.vatAmount)>max(.05,expected*.02):w.append(f"Btw-regel {v.rate:g}% sluit rekenkundig niet aan.")
    # normalize warning uniqueness
    r.warnings=list(dict.fromkeys(w))
    return r

# ----------------------------- AI structured review -----------------------------
def ai_extract(doc:dict,filename:str,company:dict,heuristic:ExtractionResult)->ExtractionResult|None:
    if not OPENAI_API_KEY:return None
    compact_layout=[]
    for p in doc.get("layout",[])[:10]: compact_layout.append({"page":p.get("page"),"words":p.get("words",[])[:900]})
    context={
        "fileName":filename,"pageCount":doc.get("pageCount"),"company":company,"heuristic":heuristic.model_dump(),
        "text":(doc.get("text") or "")[:70000],"financialText":(doc.get("financialText") or "")[:12000],"tables":doc.get("tables",[])[:20],"layout":compact_layout,
    }
    schema={
      "documentType":"purchase_invoice|sales_invoice|credit_invoice|receipt|bank_document|other",
      "originalFileName":"string","pageCount":"integer",
      "supplier":{"name":None,"address":None,"postalCode":None,"city":None,"country":None,"kvk":None,"vatNumber":None,"iban":None,"email":None},
      "customer":{"name":None,"address":None,"postalCode":None,"city":None,"country":None,"kvk":None,"vatNumber":None,"email":None},
      "invoice":{"invoiceNumber":None,"invoiceDate":None,"dueDate":None,"paymentTermDays":None,"orderNumber":None,"paymentReference":None,"description":None},
      "amounts":{"subtotal":None,"vatLines":[{"rate":21,"taxableAmount":None,"vatAmount":None}],"vatTotal":None,"total":None,"settlementAmount":None,"discount":None,"shipping":None,"currency":"EUR"},
      "status":"draft|open|paid|overdue|cancelled|credit|unknown","lineItems":[{"description":None,"quantity":None,"unitPrice":None,"vatRate":None,"lineTotal":None}],"adjustments":[{"type":"factoring_fee","description":None,"subtotal":None,"vatTotal":None,"total":None,"vatRate":21,"direction":"deduction","counterparty":None}],"confidence":{},"warnings":[],"processing":{}
    }
    instructions=(
        "You extract accounting documents for a Dutch bookkeeping application. Return ONLY a JSON object matching the supplied shape. "
        "Never invent a value. Use null when not explicit or strongly supported. Distinguish supplier and customer. The user's own company is context only. "
        "For self-billing, determine the commercial supplier/customer roles from the document, not page position. "
        "Interpret Dutch money formats correctly: 1.234,56 = 1234.56. Keep the commercial invoice subtotal/VAT/total strictly separate from factoring fees, commission, platform fees, withholding and payout. "
        "Put each fee/correction in adjustments. Put the final amount actually paid/settled in amounts.settlementAmount; never use settlementAmount as amounts.total. "
        "For VAT, preserve separate 0/9/21 percent lines. Dates must be YYYY-MM-DD. Do not turn headers or total rows into line items. "
        "Confidence values are 0..1 and must reflect visible evidence, OCR quality and arithmetic consistency; do not make all confidence values high. "
        "If the heuristic result conflicts with the document, prefer the document and add a warning explaining the conflict."
    )
    payload={"model":OPENAI_MODEL,"input":[{"role":"system","content":[{"type":"input_text","text":instructions}]},{"role":"user","content":[{"type":"input_text","text":"Target JSON shape:\n"+json.dumps(schema)+"\n\nDocument context:\n"+json.dumps(context,ensure_ascii=False)}]}],"max_output_tokens":7000,"reasoning":{"effort":"medium"}}
    try:
        resp=requests.post("https://api.openai.com/v1/responses",headers={"Authorization":f"Bearer {OPENAI_API_KEY}","Content-Type":"application/json"},json=payload,timeout=REQUEST_TIMEOUT)
        if resp.status_code>=400: return None
        body=resp.json();txt=body.get("output_text") or ""
        if not txt:
            for item in body.get("output",[]):
                if item.get("type")=="message":
                    for c in item.get("content",[]):
                        if c.get("type")=="output_text":txt+=c.get("text","")
        txt=txt.strip()
        if txt.startswith("```"):txt=re.sub(r"^```(?:json)?|```$","",txt,flags=re.I).strip()
        a,b=txt.find("{"),txt.rfind("}")
        if a>=0 and b>a:txt=txt[a:b+1]
        data=json.loads(txt)
        data["originalFileName"]=filename;data["pageCount"]=doc.get("pageCount",1)
        result=ExtractionResult.model_validate(data)
        result.processing={**heuristic.processing,"ai":True,"aiModel":OPENAI_MODEL}
        return validate_result(result,company)
    except Exception:
        return None

def reconcile(primary:ExtractionResult,heuristic:ExtractionResult)->ExtractionResult:
    # AI is primary when present, but deterministic parser may fill only missing low-risk fields.
    p=primary.model_copy(deep=True); h=heuristic
    simple=[("supplier","name"),("supplier","address"),("supplier","postalCode"),("supplier","city"),("supplier","kvk"),("supplier","vatNumber"),("supplier","iban"),("supplier","email"),("customer","name"),("invoice","invoiceNumber"),("invoice","invoiceDate"),("invoice","dueDate"),("invoice","paymentReference")]
    for obj,field in simple:
        po=getattr(p,obj); ho=getattr(h,obj); pv=getattr(po,field); hv=getattr(ho,field)
        confkey={"name":"supplierName" if obj=="supplier" else "customerName","invoiceNumber":"invoiceNumber","invoiceDate":"invoiceDate","dueDate":"dueDate","iban":"iban"}.get(field,field)
        if (pv is None or pv=="") and hv not in (None,"") and h.confidence.get(confkey,0)>=.8:setattr(po,field,hv);p.confidence[confkey]=h.confidence.get(confkey,.8)
    for field,key in [("subtotal","subtotal"),("vatTotal","vatTotal"),("total","total")]:
        if getattr(p.amounts,field) is None and getattr(h.amounts,field) is not None and h.confidence.get(key,0)>=.8:setattr(p.amounts,field,getattr(h.amounts,field));p.confidence[key]=h.confidence.get(key,.8)
    if not p.amounts.vatLines and h.amounts.vatLines:p.amounts.vatLines=h.amounts.vatLines

    hblocks=(h.processing or {}).get("financialBlocks") or {}
    if hblocks.get("verified") and h.adjustments:
        # A deterministic, arithmetically verified multi-block document is more
        # reliable for money separation than a flat AI/OCR total.
        for field,key in [("subtotal","subtotal"),("vatTotal","vatTotal"),("total","total")]:
            hv=getattr(h.amounts,field)
            if hv is not None:
                setattr(p.amounts,field,hv)
                p.confidence[key]=max(p.confidence.get(key,0),h.confidence.get(key,.98))
        p.amounts.settlementAmount=h.amounts.settlementAmount
        p.adjustments=h.adjustments
        if h.amounts.vatLines:p.amounts.vatLines=h.amounts.vatLines
        p.processing={**(p.processing or {}),"financialBlocks":hblocks,"moneyStructureSource":"deterministic-section-parser"}
    else:
        if p.amounts.settlementAmount is None and h.amounts.settlementAmount is not None:
            p.amounts.settlementAmount=h.amounts.settlementAmount
        if not p.adjustments and h.adjustments:
            p.adjustments=h.adjustments
    return p

# ----------------------------- duplicate candidate + response -----------------------------
def overall_confidence(r:ExtractionResult)->float:
    critical=["supplierName","invoiceNumber","invoiceDate","subtotal","vatTotal","total"]
    vals=[r.confidence.get(k,0) for k in critical if k in r.confidence]
    if not vals:return .2
    base=sum(vals)/len(vals)
    return max(0,min(1,base-len(r.warnings)*.025))

def deterministic_fast_path_ready(doc:dict,r:ExtractionResult)->bool:
    """Skip a paid/slow AI round only when deterministic extraction is already strong."""
    if not OPENAI_API_KEY:
        return False
    if doc.get("kind")!="pdf":
        return False
    if doc.get("ocrPages"):
        return False
    if len(re.sub(r"\s+","",doc.get("text") or ""))<320:
        return False
    if r.documentType not in {"purchase_invoice","sales_invoice","credit_invoice","receipt"}:
        return False
    if r.warnings:
        return False
    if r.amounts.total is None or r.amounts.subtotal is None:
        return False
    if r.documentType!="receipt" and not r.invoice.invoiceNumber:
        return False
    if not r.invoice.invoiceDate:
        return False
    if overall_confidence(r)<.90:
        return False
    # Multi-block documents are only fast-pathed when all blocks reconcile.
    blocks=(r.processing or {}).get("financialBlocks") or {}
    if r.adjustments and not blocks.get("verified"):
        return False
    if r.amounts.vatTotal is not None:
        expected=float(r.amounts.subtotal)+float(r.amounts.vatTotal)
        if abs(expected-float(r.amounts.total))>max(.08,abs(float(r.amounts.total))*.003):
            return False
    return True

def require_authenticated_user(request: Request) -> dict:
    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    if not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(503, "Authentication verifier is not configured")
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": auth_header,
                "apikey": SUPABASE_PUBLISHABLE_KEY,
            },
            timeout=10,
        )
    except requests.RequestException:
        raise HTTPException(503, "Authentication service unavailable")
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    try:
        user = resp.json()
    except Exception:
        raise HTTPException(401, "Invalid session response")
    if not user.get("id"):
        raise HTTPException(401, "Invalid session")
    return user

@app.get("/health")
def health():
    return {"ok":True,"service":"boekuna-document-processor","aiConfigured":bool(OPENAI_API_KEY),"ocrAvailable":bool(RapidOCR),"ocrGeneration":RAPIDOCR_GENERATION,"ocrModel":OCR_MODEL_NAME,"authRequired":True,"version":"2.7"}

@app.post("/analyze")
async def analyze(request:Request,file:UploadFile=File(...),company_json:str=Form("{}"),existing_json:str=Form("[]"),ocr_text:str=Form("")):
    origin=(request.headers.get("origin") or "").rstrip("/")
    if origin!=APP_ORIGIN: raise HTTPException(403,"Origin not allowed")
    require_authenticated_user(request)
    if not allow_request(request): raise HTTPException(429,"Te veel documentverwerkingen. Probeer het over enkele minuten opnieuw.")
    raw=await file.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise HTTPException(413,"Bestand is te groot. Maximum is 15 MB.")
    if not raw:raise HTTPException(400,"Bestand is leeg.")
    try: company=json.loads(company_json or "{}")
    except Exception: company={}
    try: existing=json.loads(existing_json or "[]")
    except Exception: existing=[]
    started=time.time()
    try:
        doc=extract_document(file.filename or "document",file.content_type or "",raw)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422,f"Document kon niet worden verwerkt ({type(exc).__name__}). Controleer of het bestand geldig en niet beschadigd is.")
    if ocr_text and len((doc.get("text") or "").replace(" ","")) < 320:
        doc["text"] = (doc.get("text") or "") + "\n\n--- CLIENT OCR ---\n" + ocr_text[:70000]
        doc.setdefault("processingHints", {})["clientOcrUsed"] = True
    heur=heuristic_extract(doc,file.filename or "document",company)
    fast_path=deterministic_fast_path_ready(doc,heur)
    ai=None if fast_path else ai_extract(doc,file.filename or "document",company,heur)
    result=reconcile(ai,heur) if ai else heur
    result=validate_result(result,company)
    # duplicate scoring against client-provided invoice index; server does not silently save anything
    dup=[]
    if result.documentType=="sales_invoice":
        counterparty=result.customer.name
    elif result.documentType=="credit_invoice":
        if own_matches(result.supplier.model_dump(),company):counterparty=result.customer.name
        else:counterparty=result.supplier.name
    else:
        counterparty=result.supplier.name
    sup=(counterparty or "").lower().strip(); no=(result.invoice.invoiceNumber or "").lower().strip(); dt=result.invoice.invoiceDate; total=result.amounts.total
    for row in existing if isinstance(existing,list) else []:
        score=0; reasons=[]
        if no and no==str(row.get("invoiceNumber") or row.get("number") or "").lower().strip():score+=.5;reasons.append("factuurnummer")
        rn=str(row.get("supplier") or row.get("party") or "").lower().strip()
        if sup and rn and (sup==rn or sup in rn or rn in sup):score+=.2;reasons.append("leverancier")
        if dt and dt==row.get("invoiceDate"):score+=.15;reasons.append("datum")
        try:
            if total is not None and abs(float(row.get("total"))-total)<=.05:score+=.15;reasons.append("totaal")
        except Exception:pass
        if score>=.65:dup.append({"id":row.get("id"),"score":round(score,2),"reasons":reasons})
    if dup:result.warnings.append("Mogelijk bestaat deze factuur al.")
    processing={**result.processing,"ai":bool(ai),"fastPath":"deterministic" if fast_path else None,"durationMs":round((time.time()-started)*1000),"pages":doc.get("pageCount"),"tablesFound":len(doc.get("tables",[])),"duplicateCandidates":dup,"overallConfidence":round(overall_confidence(result),3)}
    result.processing=processing
    return {"ok":True,"data":result.model_dump(),"preview":{"text":(doc.get("text") or "")[:30000],"pages":doc.get("pages",[])[:50],"tables":doc.get("tables",[])[:20]},"duplicateCandidates":dup}