import base64, csv, hashlib, io, json, logging, math, os, re, secrets, tempfile, time
from datetime import datetime, date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Literal

import fitz
import pdfplumber
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

DEFAULT_APP_ORIGINS = {
    "https://boekuna-boekhouding.onrender.com",
    "https://kwinest-boekhouding.onrender.com",
    "https://boekuna.nl",
    "https://www.boekuna.nl",
    "https://boekuna-qa-staging.onrender.com",
    "https://boekuna-render-link-qa.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
_legacy_origin = os.getenv("APP_ORIGIN", "").strip().rstrip("/")
_extra_origins = {
    value.strip().rstrip("/")
    for value in os.getenv("APP_ORIGINS", "").split(",")
    if value.strip()
}
ALLOWED_ORIGINS = frozenset(DEFAULT_APP_ORIGINS | _extra_origins | ({_legacy_origin} if _legacy_origin else set()))
logger = logging.getLogger("boekuna.document_processor")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vuwfyhtejsxhdfyvkkeq.supabase.co").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_RESPONSES_URL = os.getenv("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")
MAX_BYTES = int(os.getenv("MAX_FILE_BYTES", str(15 * 1024 * 1024)))
MAX_SIZE_MB = max(1, MAX_BYTES // 1024 // 1024)
SUPPORTED_IMAGE_EXTENSIONS = frozenset({".jpg",".jpeg",".png",".webp",".heic",".heif",".tif",".tiff",".bmp",".gif"})
SUPPORTED_IMAGE_MIME_TYPES = frozenset({"image/jpeg","image/png","image/webp","image/heic","image/heif","image/tiff","image/bmp","image/gif"})
SUPPORTED_DOCUMENT_EXTENSIONS = (".pdf",".jpg",".jpeg",".png",".webp",".heic",".heif",".tif",".tiff",".bmp",".gif",".docx",".xlsx",".csv")
SUPPORTED_DOCUMENT_MIME_TYPES = (
    "application/pdf","image/jpeg","image/png","image/webp","image/heic","image/heif","image/tiff","image/bmp","image/gif",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","application/csv",
)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-sol")
REQUEST_TIMEOUT = float(os.getenv("AI_TIMEOUT_SECONDS", "55"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "600"))
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20"))
_REQUEST_TIMES: dict[str, list[float]] = {}

app = FastAPI(title="Kwinest Document Processor", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)

PUBLIC_ERROR_SPECS = {
    "DOCUMENT_PDF_UNREADABLE": {"category":"document","retryable":False,"status":422},
    "DOCUMENT_IMAGE_UNREADABLE": {"category":"document","retryable":False,"status":422},
    "DOCUMENT_UNSUPPORTED_TYPE": {"category":"document","retryable":False,"status":415},
    "DOCUMENT_TOO_LARGE": {"category":"document","retryable":False,"status":413},
    "AUTH_SESSION_EXPIRED": {"category":"auth","retryable":False,"status":401},
    "DOCUMENT_LIMIT_REACHED": {"category":"entitlement","retryable":False,"status":429},
    "ACCOUNT_READ_ONLY": {"category":"entitlement","retryable":False,"status":403},
    "RATE_LIMITED": {"category":"temporary","retryable":True,"status":429},
    "PROCESSING_TIMEOUT": {"category":"temporary","retryable":True,"status":504},
    "PROCESSOR_UNAVAILABLE": {"category":"temporary","retryable":True,"status":503},
    "PERMISSION_DENIED": {"category":"permission","retryable":False,"status":403},
    "INVALID_REQUEST": {"category":"request","retryable":False,"status":400},
    "UNKNOWN": {"category":"temporary","retryable":True,"status":500},
}

class BoekunaDocumentError(Exception):
    def __init__(self, code:str, *, status:int|None=None, context:dict[str,Any]|None=None,
                 state:str="no_changes", internal_code:str|None=None, internal_error:Any=None,
                 provider:str|None=None, provider_status:int|None=None, provider_code:str|None=None,
                 provider_request_id:str|None=None):
        super().__init__(code)
        self.code=code if code in PUBLIC_ERROR_SPECS else "UNKNOWN"
        spec=PUBLIC_ERROR_SPECS[self.code]
        self.status=int(status or spec["status"])
        self.context=dict(context or {})
        self.state=state if state in {"not_saved","stored_unprocessed","no_changes","unknown_state"} else "unknown_state"
        self.internal_code=internal_code or self.code
        self.internal_error=internal_error
        self.provider=provider
        self.provider_status=provider_status
        self.provider_code=provider_code
        self.provider_request_id=provider_request_id

def new_reference_id() -> str:
    alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BK-"+"".join(secrets.choice(alphabet) for _ in range(6))

def sanitize_log_value(value:Any, limit:int=500) -> str:
    text=str(value or "")
    text=re.sub(r"(?i)bearer\s+[A-Za-z0-9._~+\-/=]+","Bearer [REDACTED]",text)
    text=re.sub(r"(?i)\b(?:sk[-_][A-Za-z0-9_-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+)\b","[REDACTED_KEY]",text)
    text=re.sub(r"(?i)(authorization|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+",r"\1=[REDACTED]",text)
    return text[:limit]

def set_processing_meta(request:Request, **values:Any) -> None:
    current=dict(getattr(request.state,"processing_meta",{}) or {})
    for key,value in values.items():
        if value is not None: current[key]=value
    request.state.processing_meta=current

def public_error_response(request:Request, exc:BoekunaDocumentError) -> JSONResponse:
    spec=PUBLIC_ERROR_SPECS[exc.code]
    reference_id=new_reference_id()
    meta=dict(getattr(request.state,"processing_meta",{}) or {})
    log_event={
        "event":"document_processing_error",
        "reference_id":reference_id,
        "timestamp":datetime.utcnow().isoformat(timespec="milliseconds")+"Z",
        "route":request.url.path,
        "stage":meta.get("stage","unknown"),
        "internal_code":exc.internal_code,
        "public_code":exc.code,
        "http_status":exc.status,
        "retryable":bool(spec["retryable"]),
        "processing_state":exc.state,
        "user_ref":meta.get("user_ref"),
        "file_mime":meta.get("file_mime"),
        "file_ext":meta.get("file_ext"),
        "file_size":meta.get("file_size"),
        "provider":exc.provider,
        "provider_status":exc.provider_status,
        "provider_code":exc.provider_code,
        "provider_request_id":exc.provider_request_id,
        "internal_error":sanitize_log_value(exc.internal_error),
    }
    logger.error(json.dumps({k:v for k,v in log_event.items() if v not in (None,"")}, ensure_ascii=False))
    return JSONResponse(
        status_code=exc.status,
        content={"ok":False,"error":{
            "code":exc.code,
            "category":spec["category"],
            "retryable":bool(spec["retryable"]),
            "reference_id":reference_id,
            "context":exc.context,
            "state":exc.state,
        }},
    )

@app.exception_handler(BoekunaDocumentError)
async def boekuna_document_error_handler(request:Request, exc:BoekunaDocumentError):
    return public_error_response(request,exc)

@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request:Request, exc:RequestValidationError):
    return public_error_response(request,BoekunaDocumentError("INVALID_REQUEST",status=422,internal_code="REQUEST_VALIDATION_FAILED",internal_error=type(exc).__name__))

@app.exception_handler(HTTPException)
async def safe_http_error_handler(request:Request, exc:HTTPException):
    status=int(exc.status_code or 500)
    code={400:"INVALID_REQUEST",401:"AUTH_SESSION_EXPIRED",403:"PERMISSION_DENIED",413:"DOCUMENT_TOO_LARGE",415:"DOCUMENT_UNSUPPORTED_TYPE",429:"RATE_LIMITED",504:"PROCESSING_TIMEOUT"}.get(status,"PROCESSOR_UNAVAILABLE" if status>=500 else "INVALID_REQUEST")
    context={"max_size_mb":MAX_SIZE_MB} if code=="DOCUMENT_TOO_LARGE" else {}
    return public_error_response(request,BoekunaDocumentError(code,status=status,context=context,internal_code="LEGACY_HTTP_EXCEPTION",internal_error=type(exc.detail).__name__))

@app.exception_handler(Exception)
async def unexpected_document_error_handler(request:Request, exc:Exception):
    return public_error_response(request,BoekunaDocumentError("UNKNOWN",status=500,state="unknown_state",internal_code=type(exc).__name__,internal_error=exc))

def require_allowed_origin(request: Request) -> str:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin not in ALLOWED_ORIGINS:
        raise BoekunaDocumentError("PERMISSION_DENIED",status=403,internal_code="ORIGIN_NOT_ALLOWED",internal_error=origin[:200])
    return origin

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
    raw=line or ""
    for m in MONEY_RE.finditer(raw):
        n=norm_money(m.group(0))
        # PyMuPDF frequently yields negative currency as "-€ 24,00". Preserve
        # the sign even when the regex starts at the currency symbol.
        if n is not None and m.start()>0 and raw[m.start()-1]=="-" and n>0:
            n=-n
        if n is not None and abs(n)<1e9: out.append(n)
    return out

def money_cents(v:Any)->int|None:
    if v is None:return None
    try:
        d=Decimal(str(v)).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
        return int(d*100)
    except (InvalidOperation,ValueError,TypeError):
        return None

def money_equal(a:Any,b:Any)->bool:
    ca,cb=money_cents(a),money_cents(b)
    return ca is not None and cb is not None and ca==cb

def rounded_vat_cents(base:Any,rate:Any)->int|None:
    cb=money_cents(base)
    if cb is None:return None
    try:
        return int((Decimal(cb)*Decimal(str(rate))/Decimal("100")).quantize(Decimal("1"),rounding=ROUND_HALF_UP))
    except (InvalidOperation,ValueError,TypeError):
        return None

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
    cvat=re.sub(r"[\s.\-]","",str(company.get("vat") or company.get("vatNumber") or "")).upper()
    ckvk=re.sub(r"\D","",str(company.get("kvk") or ""))
    ciban=re.sub(r"\s+","",str(company.get("iban") or "")).upper()
    cemail=norm_text(str(company.get("email") or "")).lower()
    cnames=[norm_text(str(company.get(k) or "")).lower() for k in ("name","tradeName","contactName")]
    cnames=[x for x in cnames if len(x)>=3]
    bvat=re.sub(r"[\s.\-]","",str(block.get("vatNumber") or "")).upper()
    bkvk=re.sub(r"\D","",str(block.get("kvk") or ""))
    biban=re.sub(r"\s+","",str(block.get("iban") or "")).upper()
    bemail=norm_text(str(block.get("email") or "")).lower()
    bname=norm_text(str(block.get("name") or "")).lower()
    name_match=any(
        n==bname or (len(n)>=5 and len(bname)>=5 and (n in bname or bname in n))
        for n in cnames if bname
    )
    return bool(
        (cvat and bvat and bvat==cvat)
        or (ckvk and bkvk and bkvk==ckvk)
        or (ciban and biban and biban==ciban)
        or (cemail and bemail and bemail==cemail)
        or name_match
    )

def _clean_party_candidate(value:str)->str:
    cand=norm_text(value or "").strip(" |:#.-")
    cand=re.sub(r"^(?:leverancier|supplier|vendor|seller|from|van|factuur\s+aan|factureren\s+aan|bill\s+to|sold\s+to|customer|klant|debiteur|aan|to|verzender|sender)\s*[:#-]?\s*","",cand,flags=re.I)
    cand=re.split(r"\b(?:factuurnummer|factuurnr|invoice\s+(?:number|no)|factuurdatum|invoice\s+date|vervaldatum|due\s+date|betalingskenmerk|payment\s+reference|kvk\s*(?:nummer|nr)?|btw[- ]?(?:nummer|nr|id)|vat\s*(?:number|id))\b",cand,maxsplit=1,flags=re.I)[0]
    return cand.strip(" |:#.-")

def layout_fragments(doc:dict,max_y:float=330.0)->list[dict[str,Any]]:
    out=[]
    for page in (doc.get("layout") or [])[:2]:
        words=[w for w in (page.get("words") or []) if norm_text(str(w.get("text") or "")) and float(w.get("y0") or 0)<=max_y]
        words.sort(key=lambda w:(float(w.get("y0") or 0),float(w.get("x0") or 0)))
        line_groups=[]
        for w in words:
            y=float(w.get("y0") or 0)
            target=None
            for g in reversed(line_groups[-4:]):
                if abs(g["y"]-y)<=3.5:
                    target=g;break
            if target is None:
                target={"y":y,"words":[]};line_groups.append(target)
            target["words"].append(w)
        for g in line_groups:
            row=sorted(g["words"],key=lambda w:float(w.get("x0") or 0))
            current=[];last_x1=None
            for w in row:
                x0=float(w.get("x0") or 0);x1=float(w.get("x1") or x0)
                if current and last_x1 is not None and x0-last_x1>55:
                    txt=norm_text(" ".join(str(x.get("text") or "") for x in current))
                    if txt:out.append({"text":txt,"x0":float(current[0].get("x0") or 0),"y0":g["y"]})
                    current=[]
                current.append(w);last_x1=x1
            if current:
                txt=norm_text(" ".join(str(x.get("text") or "") for x in current))
                if txt:out.append({"text":txt,"x0":float(current[0].get("x0") or 0),"y0":g["y"]})
    return sorted(out,key=lambda x:(x["y0"],x["x0"]))

LEGAL_ENTITY_RE=re.compile(r"([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ0-9&'()., -]{1,80}?(?:B\.\s*V\.|BV\b|N\.\s*V\.|NV\b|V\.\s*O\.\s*F\.|VOF\b|LTD\.|LTD\b|LLC\b|GMBH\b))(?![A-Za-z0-9])",re.I)

def layout_legal_entity_name(doc:dict,company:dict)->str|None:
    candidates=[]
    for frag in layout_fragments(doc):
        for m in LEGAL_ENTITY_RE.finditer(frag["text"]):
            name=_clean_party_candidate(m.group(1))
            if len(name)<3 or own_matches({"name":name},company):continue
            score=1.0-(min(float(frag["y0"]),330.0)/3300.0)
            candidates.append((score,name))
    if candidates:
        candidates.sort(reverse=True)
        return candidates[0][1]
    return None

def layout_own_party_name(doc:dict,company:dict)->str|None:
    names=[norm_text(str(company.get(k) or "")) for k in ("name","tradeName","contactName")]
    names=[n for n in names if len(n)>=3]
    emails=[norm_text(str(company.get("email") or "")).lower()]
    for frag in layout_fragments(doc):
        low=frag["text"].lower()
        for n in names:
            nl=n.lower()
            if nl==low or (len(nl)>=5 and nl in low):
                return n
        if emails[0] and emails[0] in low:
            return next((n for n in names if n),None)
    return None

def generic_invoice_date(lines:list[str])->tuple[str|None,float]:
    for line in lines[:45]:
        low=line.lower()
        if re.search(r"\b(?:omschrijving|description|week|aantal|quantity)\b",low):
            continue
        anchored=bool(re.match(r"^\s*(?:datum|date)\s*[:#-]?",low) or re.search(r"\bfactuurnummer\b.*\bdatum\b",low))
        if not anchored:
            continue
        d=norm_date(line)
        if d:return d,.90
    return None,0.0

def table_vat_groups(doc:dict)->list[VatLine]:
    groups={}
    for table in (doc.get("tables") or [])[:30]:
        for row in (table.get("rows") or [])[:220]:
            cells=[norm_text(str(c or "")) for c in row]
            joined=" | ".join(cells)
            rm=re.search(r"\b(0|9|21)(?:[.,]0+)?\s*%",joined,re.I)
            if not rm:continue
            rate=float(rm.group(1))
            vals=[]
            for cell in cells:
                vals.extend(money_tokens(cell))
            vals=[abs(v) for v in vals]
            if rate==0 and vals:
                groups[rate]=VatLine(rate=rate,taxableAmount=round(vals[0],2),vatAmount=0.0)
                continue
            best=None
            for i,base in enumerate(vals):
                for j,tax in enumerate(vals):
                    if i==j:continue
                    ec=rounded_vat_cents(base,rate);tc=money_cents(tax)
                    if ec is None or tc is None or abs(ec-tc)>1:continue
                    gross_match=any(k not in (i,j) and money_cents(vals[k])==(money_cents(base) or 0)+(money_cents(tax) or 0) for k in range(len(vals)))
                    score=(1 if gross_match else 0,base)
                    if best is None or score>best[0]:best=(score,base,tax)
            if best:
                _,base,tax=best
                groups[rate]=VatLine(rate=rate,taxableAmount=round(base,2),vatAmount=round(tax,2))
    return [groups[k] for k in sorted(groups)]


def explicit_vat_groups(lines:list[str])->list[VatLine]:
    """Parse only explicit VAT summary rows with a stated taxable base."""
    groups={}
    base_label=re.compile(r"\b(?:belastbaar|taxable|grondslag|maatstaf|tax\s*base|base\s*amount)\b",re.I)
    for raw in lines or []:
        line=norm_text(raw)
        rm=re.search(r"\b(0|9|21)(?:[.,]0+)?\s*%",line,re.I)
        if not rm or not base_label.search(line):
            continue
        rate=float(rm.group(1))
        vals=[abs(v) for v in money_tokens(line)]
        if rate==0 and vals:
            groups[rate]=VatLine(rate=rate,taxableAmount=round(vals[0],2),vatAmount=0.0)
            continue
        best=None
        for i,base in enumerate(vals):
            for j,tax in enumerate(vals):
                if i==j:continue
                expected=rounded_vat_cents(base,rate); actual=money_cents(tax)
                if expected is None or actual is None or abs(expected-actual)>1:
                    continue
                score=(base, -j)
                if best is None or score>best[0]:
                    best=(score,base,tax)
        if best:
            _,base,tax=best
            groups[rate]=VatLine(rate=rate,taxableAmount=round(base,2),vatAmount=round(tax,2))
    return [groups[k] for k in sorted(groups)]

def allow_request(request: Request, key_override: str | None = None) -> bool:
    now=time.time()
    forwarded=(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip=forwarded or (request.client.host if request.client else "unknown")
    key=key_override or ip
    recent=[t for t in _REQUEST_TIMES.get(key,[]) if now-t<RATE_LIMIT_WINDOW]
    if len(recent)>=RATE_LIMIT_MAX:
        _REQUEST_TIMES[key]=recent
        return False
    recent.append(now)
    _REQUEST_TIMES[key]=recent
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
    try:
        doc=fitz.open(stream=raw,filetype="pdf")
    except Exception as exc:
        raise BoekunaDocumentError("DOCUMENT_PDF_UNREADABLE",status=422,internal_code="PDF_OPEN_FAILED",internal_error=exc)
    if doc.page_count>50:
        raise BoekunaDocumentError("INVALID_REQUEST",status=400,context={"max_pages":50},internal_code="PDF_PAGE_LIMIT_EXCEEDED")
    pages=[]; all_text=[]; layout=[]; tables=[]; ocr_pages=[]; warnings=[]; sparse_pages=[]
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
        if sparse_text:
            sparse_pages.append(idx+1)
            if not ocr_engine:
                warnings.append(f"Pagina {idx+1} bevat weinig digitale tekst; OCR-engine is niet beschikbaar.")
            else:
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
                    elif printable < 40:
                        warnings.append(f"Pagina {idx+1} kon niet betrouwbaar met OCR worden gelezen.")
                except Exception as exc:
                    logger.warning("pdf_ocr_failed page=%d error_type=%s", idx+1, type(exc).__name__)
                    warnings.append(f"Pagina {idx+1} kon niet met OCR worden verwerkt.")
        pages.append({"page":idx+1,"text":text,"charCount":len(text),"ocr":used_ocr,"ocrConfidence":ocr_conf,"tables":page_tables})
        all_text.append(f"--- PAGE {idx+1} ---\n{text}")
        layout.append({"page":idx+1,"words":page_layout[:2500]})
        if page_tables: tables.extend([{"page":idx+1,"rows":t} for t in page_tables])
    if plumber:
        try: plumber.close()
        except Exception: pass
    combined_text="\n\n".join(all_text)
    if sparse_pages and len(re.sub(r"\s+","",combined_text)) < 40:
        if not ocr_engine:
            raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="OCR_ENGINE_UNAVAILABLE")
        raise BoekunaDocumentError("DOCUMENT_PDF_UNREADABLE",status=422,internal_code="PDF_OCR_UNREADABLE")
    return {"kind":"pdf","pageCount":doc.page_count,"pages":pages,"text":combined_text,"layout":layout,"tables":tables,"ocrPages":ocr_pages,"ocrEngine":"RapidOCR 3 / ONNX" if ocr_pages and RAPIDOCR_GENERATION=="v3" else ("RapidOCR legacy" if ocr_pages else None),"ocrModel":OCR_MODEL_NAME if ocr_pages else None,"warnings":warnings}

def extract_image(raw:bytes) -> dict[str,Any]:
    if not RapidOCR:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="OCR_ENGINE_UNAVAILABLE")
    try:
        img=Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise BoekunaDocumentError("DOCUMENT_IMAGE_UNREADABLE",status=422,internal_code="IMAGE_DECODE_FAILED",internal_error=exc)
    try:
        best=run_best_ocr(img)
    except Exception as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="OCR_EXECUTION_FAILED",internal_error=exc)
    text=best["text"]
    layout=best["rows"]
    if len(re.sub(r"\s+","",text))<12:
        raise BoekunaDocumentError("DOCUMENT_IMAGE_UNREADABLE",status=422,internal_code="IMAGE_OCR_UNREADABLE")
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
    try:
        if raw[:4]==b"%PDF" or ext==".pdf" or c=="application/pdf": return extract_pdf(raw)
        if ext in SUPPORTED_IMAGE_EXTENSIONS or c in SUPPORTED_IMAGE_MIME_TYPES: return extract_image(raw)
        if ext==".docx" or c=="application/vnd.openxmlformats-officedocument.wordprocessingml.document": return extract_docx(raw)
        if ext==".xlsx" or c=="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return extract_xlsx(raw)
        if ext==".csv" or c in {"text/csv","application/csv"}: return extract_csv(raw)
    except BoekunaDocumentError:
        raise
    except Exception as exc:
        raise BoekunaDocumentError("INVALID_REQUEST",status=422,internal_code=f"DOCUMENT_DECODE_FAILED_{ext or 'UNKNOWN'}",internal_error=exc)
    raise BoekunaDocumentError(
        "DOCUMENT_UNSUPPORTED_TYPE",status=415,
        context={"supported_extensions":list(SUPPORTED_DOCUMENT_EXTENSIONS),"supported_mime_types":list(SUPPORTED_DOCUMENT_MIME_TYPES)},
        internal_code="DOCUMENT_TYPE_UNSUPPORTED",
    )

# ----------------------------- deterministic invoice parser -----------------------------
def contact_block(lines:list[str], labels:list[str], company:dict, role:str)->tuple[dict,float]:
    idx=None;matched_label=None
    for i,line in enumerate(lines[:120]):
        low=line.lower().strip()
        for lab in labels:
            lab=lab.lower().strip().rstrip(":")
            if low==lab or low.startswith(lab+":") or low.startswith(lab+" -"):
                idx=i;matched_label=lab;break
        if idx is not None:break
    block=lines[idx:idx+12] if idx is not None else lines[:18]
    block=[x for x in block if x and not re.match(r"^-{2,}\s*page\s+\d+\s*-{2,}$",x,re.I)]
    joined="\n".join(block)
    emails=re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",joined,re.I)
    vats=[re.sub(r"\s+","",x).upper() for x in re.findall(r"\b[A-Z]{2}\s?[A-Z0-9]{6,14}\b",joined,re.I)]
    nl_vats=[x for x in vats if re.fullmatch(r"NL\d{9}B\d{2}",x)]
    kvks=re.findall(r"(?:kvk|k\.v\.k\.|coc|chamber of commerce)(?:\s*(?:nr|nummer|number|no))?\s*[:#-]?\s*(\d{8})",joined,re.I)
    ibans=[re.sub(r"\s+","",x).upper() for x in re.findall(r"\b[A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]){11,30}\b",joined,re.I)]
    postal=re.search(r"\b([1-9]\d{3})\s*([A-Z]{2})\b(?:\s+([^\n,;|]{2,50}))?",joined,re.I)
    address_re=re.compile(r"\b\d+[A-Z-]*\b.*(?:straat|laan|weg|kade|plein|singel|dreef|gracht|boulevard|hof|street|road|avenue|lane|drive|place)|(?:straat|laan|weg|kade|plein|singel|dreef|gracht|boulevard|hof|street|road|avenue|lane|drive|place)[^\n]*\b\d+[A-Z-]*\b",re.I)
    address=next((x for x in block if address_re.search(x)),None)
    field_only=re.compile(r"^(?:leverancier|supplier|vendor|seller|from|van|factuur aan|factureren aan|bill to|sold to|customer|klant|debiteur|aan|to|verzender|sender|factuur|invoice|datum|date|totaal|total|btw|vat|kvk|iban|omschrijving|description|pagina|page)(?:\s*[:#-].*)?$",re.I)
    name=None
    if idx is not None and matched_label:
        line=lines[idx]
        pos=line.lower().find(matched_label)
        remainder=_clean_party_candidate(line[pos+len(matched_label):])
        if 2<=len(remainder)<=100 and not field_only.match(remainder) and not address_re.search(remainder) and not re.match(r"^\d",remainder):
            name=remainder
    if not name and idx is not None:
        for j in range(idx+1,min(len(lines),idx+7)):
            cand=_clean_party_candidate(lines[j])
            if not (2<=len(cand)<=100):continue
            if field_only.match(cand) or address_re.search(cand) or re.match(r"^\d",cand) or "@" in cand:continue
            if re.search(r"\b(?:kvk|btw|vat|iban)\b",cand,re.I):continue
            name=cand;break
    if not name and idx is not None:
        for back in range(max(0,idx-3),idx):
            cand=_clean_party_candidate(lines[back])
            if 2<=len(cand)<=100 and not field_only.match(cand) and not address_re.search(cand) and not re.match(r"^\d",cand) and "@" not in cand:
                if not re.search(r"factuur|invoice|creditnota|receipt",cand,re.I):
                    name=cand;break
    if not name:
        for rawline in block:
            cand=_clean_party_candidate(rawline)
            if not (2<=len(cand)<=100):continue
            if field_only.match(cand) or address_re.search(cand) or re.match(r"^\d",cand) or "@" in cand:continue
            if re.match(r"^-{2,}\s*page\s+\d+",cand,re.I):continue
            if re.search(r"\b(?:kvk|btw|vat|iban|factuurnr|factuurnummer|invoice no|invoice number)\b",cand,re.I):continue
            if re.search(r"\b(?:factuur|invoice|creditnota|receipt)\b",cand,re.I):continue
            name=cand;break
    data={"name":name,"address":address,"postalCode":f"{postal[1]} {postal[2].upper()}" if postal else None,"city":postal[3].strip() if postal and postal[3] else None,"country":"Nederland" if postal else None,
          "kvk":kvks[0] if kvks else None,"vatNumber":nl_vats[0] if nl_vats else None,"iban":next((x for x in ibans if valid_iban(x)),None),"email":emails[0] if emails else None}
    conf=.97 if idx is not None and name else (.62 if name else .20)
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


DESCRIPTION_LABEL_RE=re.compile(r"\b(?:omschrijving|beschrijving|description|diensten?|services?)\b",re.I)
DESCRIPTION_SUMMARY_RE=re.compile(
    r"^\s*(?:bedrag\s+excl|totaal\s+excl|subtotaal|subtotal|btw|vat|tax|"
    r"factuurbedrag|factuurtotaal|invoice\s+total|totaal|total|factoring|"
    r"eindbedrag|grand\s+total|amount\s+due)\b",re.I
)
DESCRIPTION_HEADER_WORDS_RE=re.compile(
    r"\b(?:aantal|qty|quantity|btw|vat|totaal|total|week|datum|date|"
    r"eenheid|unit|tarief|rate|prijs|price|excl|incl)\b",re.I
)

def extract_description(doc:dict,lines:list[str])->tuple[str|None,float,str|None]:
    # Prefer the first description cell below a recognized table header.
    for table in (doc.get("tables") or [])[:30]:
        rows=(table.get("rows") or [])[:180]
        header_index=None;description_col=None
        for ri,row in enumerate(rows[:30]):
            cells=[norm_text(str(cell or "")) for cell in row]
            for ci,cell in enumerate(cells):
                if DESCRIPTION_LABEL_RE.search(cell):
                    header_index=ri;description_col=ci;break
            if header_index is not None:break
        if header_index is None or description_col is None:
            continue
        for row in rows[header_index+1:header_index+8]:
            cells=[norm_text(str(cell or "")) for cell in row]
            if description_col>=len(cells):continue
            cand=cells[description_col].strip()
            if not cand or DESCRIPTION_SUMMARY_RE.search(cand):continue
            if len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]","",cand))<3:continue
            return cand[:500],.96,"table"

    # Text fallback: find a description heading and then the first meaningful
    # following line. Avoid returning the column headings themselves.
    for i,line in enumerate(lines[:220]):
        m=DESCRIPTION_LABEL_RE.search(line)
        if not m:continue
        rest=norm_text(line[m.end():]).lstrip(" :#.-|")
        if rest and len(DESCRIPTION_HEADER_WORDS_RE.findall(rest))<=1 and not DESCRIPTION_SUMMARY_RE.search(rest):
            if len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]","",rest))>=3:
                return rest[:500],.88,"label-inline"
        for j in range(i+1,min(len(lines),i+7)):
            cand=norm_text(lines[j])
            if not cand or DESCRIPTION_SUMMARY_RE.search(cand):break
            # Skip a second header row but accept actual service/product rows.
            if len(DESCRIPTION_HEADER_WORDS_RE.findall(cand))>=3 and not money_tokens(cand):
                continue
            if len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]","",cand))<3:
                continue
            cleaned=re.sub(r"\s+\d+(?:[.,]\d+)?\s+(?:(?:0|9|21)(?:[.,]0+)?\s*%\s+)?€.*$","",cand,flags=re.I).strip()
            if cleaned and len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]","",cleaned))>=3:
                return cleaned[:500],.82,"text-after-header"
    return None,.20,None

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
    supplier,sconf=contact_block(lines,["leverancier","supplier","vendor","seller","from","van"],company,"supplier")
    customer,cconf=contact_block(lines,["factuur aan","factureren aan","bill to","sold to","customer","klant","debiteur","aan","to","verzender","sender"],company,"customer")
    legal_entity=layout_legal_entity_name(doc,company)
    own_layout=layout_own_party_name(doc,company)
    supplier_own=own_matches(supplier,company); customer_own=own_matches(customer,company)
    if self_billing or (supplier_own and not customer_own): dtype="sales_invoice"
    else: dtype="purchase_invoice"
    if self_billing and own_layout and not supplier_own:
        supplier["name"]=own_layout;sconf=max(sconf,.96);supplier_own=True
    if dtype=="purchase_invoice":
        if legal_entity and (not supplier.get("name") or supplier_own or sconf<.85):
            supplier["name"]=legal_entity;sconf=max(sconf,.94);supplier_own=False
        if own_layout and (not customer.get("name") or not own_matches(customer,company)):
            customer["name"]=own_layout;cconf=max(cconf,.90);customer_own=True
    elif dtype=="sales_invoice" and legal_entity and (not customer.get("name") or customer_own):
        customer["name"]=legal_entity;cconf=max(cconf,.90);customer_own=False
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
    description,description_conf,description_source=extract_description(doc,lines)
    inv_date,inv_date_conf=labeled_date(lines,["factuurdatum","invoice date","date of invoice","document date"])
    if not inv_date:
        inv_date,inv_date_conf=generic_invoice_date(lines)
    if not inv_date and dtype=="receipt":
        for line in lines[:30]:
            d=norm_date(line)
            if d:
                inv_date,inv_date_conf=d,.76
                break
    due_date,due_conf=labeled_date(lines,["vervaldatum","due date","betalen voor","betaal voor","pay before","payment due"])
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

    detected_rates=detect_vat_rates(amount_lines)
    structured_rate=structured_primary.get("vatRate") if structured_primary else None
    rate_candidates=detected_rates or ([float(structured_rate)] if structured_rate in (0,9,21) else [])
    vat_lines=[]
    vat_line_source=None
    # For a single-rate document the trusted VAT group is reconstructed from the
    # printed/validated top-level net and VAT totals. Never infer it from arbitrary
    # money tokens on product rows.
    if len(rate_candidates)==1 and subtotal is not None and vat_total is not None:
        rate=float(rate_candidates[0])
        vat_lines=[VatLine(rate=rate,taxableAmount=round(float(subtotal),2),vatAmount=round(float(vat_total),2))]
        vat_line_source="validated-primary-totals"
    elif len(rate_candidates)>1:
        vat_lines=table_vat_groups(doc)
        if vat_lines:
            vat_line_source="explicit-vat-table"
        else:
            vat_lines=explicit_vat_groups(amount_lines)
            vat_line_source="explicit-vat-text" if vat_lines else "review-required-mixed-vat"

    structured_adjustments=[Adjustment(**a) for a in financial_structure.get("adjustments",[])]
    settlement_amount=financial_structure.get("settlementAmount")

    # A document that deducts factoring costs from an invoice total and exposes a
    # net payout is a sales/receivable settlement structure, not a purchase just
    # because the intermediary's logo is top-left.
    factoring_sale=bool(
        any(a.type=="factoring_fee" for a in structured_adjustments)
        and settlement_amount is not None
        and own_layout
    )
    if factoring_sale and dtype=="purchase_invoice":
        counterparty_name=legal_entity or supplier.get("name")
        supplier={**supplier,"name":own_layout}
        customer={**customer,"name":counterparty_name}
        sconf=max(sconf,.92);cconf=max(cconf,.88 if counterparty_name else cconf)
        dtype="sales_invoice"

    # Arithmetic recovery: derive only missing values. Explicit printed amounts
    # amount is a strong anchor, calculate the other amounts rather than trusting
    # weaker OCR reads. Never do this for mixed VAT or adjustment-heavy receipts.
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

    # Build the single-rate group only after candidate arithmetic recovery so a
    # missing top-level amount cannot leave an otherwise verified VAT group empty.
    if not vat_lines and len(rate_candidates)==1 and subtotal is not None and vat_total is not None:
        rate=float(rate_candidates[0])
        vat_lines=[VatLine(rate=rate,taxableAmount=round(float(subtotal),2),vatAmount=round(float(vat_total),2))]
        vat_line_source="validated-primary-totals"

    iban=None
    for x in re.findall(r"\b[A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]){11,30}\b",text,re.I):
        if valid_iban(x): iban=re.sub(r"\s+","",x).upper();break

    paid=bool(re.search(r"\b(reeds betaald|already paid|paid via|voldaan|betaald|totaal betaald|total paid|betaalbevestiging)\b",low))
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
        "description":description_conf,
        "subtotal":sub_conf,
        "vatTotal":vat_conf,
        "total":total_conf,
        "iban":.9 if iban else .1,
        "documentType":.99 if self_billing else (.94 if factoring_sale else (.90 if (supplier_own or customer_own) else .76)),
        "paymentStatus":.98 if paid else (.78 if status in {"open","overdue"} else .55),
        "vatLines":.99 if vat_line_source=="validated-primary-totals" else (.95 if vat_line_source=="explicit-vat-text" else (.92 if vat_line_source=="explicit-vat-table" else (.35 if len(detected_rates)>1 else .20))),
        "adjustments":.98 if structured_adjustments and financial_structure.get("adjustmentArithmeticOk") else (.45 if structured_adjustments else .80),
        "settlementAmount":.98 if settlement_amount is not None and financial_structure.get("settlementArithmeticOk") else (.25 if settlement_amount is None else .55),
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
        if isinstance(conflict.get("read"),dict):
            derivation_warnings.append("Expliciete bedragen spreken elkaar rekenkundig tegen; controleer netto, btw en totaal.")
        else:
            derivation_warnings.append(f"Rekenkundige controle wijkt af voor {conflict['field']}: gelezen {conflict['read']:.2f}, berekend {conflict['calculated']:.2f}.")
    result=ExtractionResult(
        documentType=dtype,originalFileName=filename,pageCount=doc.get("pageCount",1),
        supplier=Supplier(**supplier),customer=Customer(**customer),
        invoice=InvoiceMeta(invoiceNumber=invoice_no,invoiceDate=inv_date,dueDate=due_date,paymentTermDays=term,orderNumber=order_no,paymentReference=payref,description=description),
        amounts=Amounts(subtotal=abs(subtotal) if subtotal is not None else None,vatLines=vat_lines,vatTotal=abs(vat_total) if vat_total is not None else None,total=abs(total) if total is not None else None,settlementAmount=abs(settlement_amount) if settlement_amount is not None else None,discount=abs(discount) if discount is not None else None,shipping=abs(shipping) if shipping is not None else None,currency="EUR"),
        status=status,lineItems=[],adjustments=structured_adjustments,confidence=confidence,warnings=derivation_warnings,
        processing={"textEngine":"PyMuPDF","tableEngine":"pdfplumber" if doc.get("kind")=="pdf" else None,"ocrEngine":doc.get("ocrEngine") if doc.get("ocrPages") else None,"ocrModel":doc.get("ocrModel") if doc.get("ocrPages") else None,"ocrVariant":(doc.get("processingHints") or {}).get("ocrVariant"),"financialFocusUsed":bool((doc.get("processingHints") or {}).get("financialFocusUsed")),"ocrPages":doc.get("ocrPages",[]),"sourceKind":doc.get("kind"),"financialBlocks":{"verified":bool(financial_structure.get("verified")),"primaryArithmeticOk":bool(financial_structure.get("primaryArithmeticOk")),"adjustmentArithmeticOk":bool(financial_structure.get("adjustmentArithmeticOk")),"settlementArithmeticOk":bool(financial_structure.get("settlementArithmeticOk")),"adjustmentTotal":financial_structure.get("adjustmentTotal"),"settlementSource":financial_structure.get("settlementSource")},"amountDerivation":{"used":bool(derivation.get("used")),"rate":derivation.get("rate"),"anchorField":derivation.get("anchorField"),"derivedFields":derivation.get("derivedFields",[]),"mixedRates":len(detected_rates)>1},"vatLineSource":vat_line_source,"descriptionSource":description_source,"selfBilling":self_billing,"factoringSaleStructure":factoring_sale}
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

    if a.subtotal is not None and a.vatTotal is not None and a.total is not None:
        candidates=[money_cents(a.subtotal)+money_cents(a.vatTotal)]
        if a.shipping is not None or a.discount is not None:
            candidates.append(money_cents(a.subtotal)+money_cents(a.vatTotal)+(money_cents(a.shipping) or 0)-(money_cents(a.discount) or 0))
        total_cents=money_cents(a.total)
        if total_cents is None or all(expected!=total_cents for expected in candidates):
            expected=(candidates[0] or 0)/100
            w.append(f"Bedragen sluiten niet cent-exact aan: berekend {expected:.2f}, totaal {a.total:.2f}.")
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

    # Separate costs/corrections reconcile at currency minor-unit precision.
    adjustment_cents=0
    for adj in r.adjustments or []:
        if adj.total is None:
            continue
        subtotal_adj=money_cents(abs(float(adj.subtotal or 0))) or 0
        vat_adj=money_cents(abs(float(adj.vatTotal or 0))) or 0
        total_adj=money_cents(abs(float(adj.total or 0))) or 0
        adjustment_cents+=total_adj if adj.direction=="deduction" else -total_adj
        if subtotal_adj+vat_adj!=total_adj:
            w.append(f"Kostenblok '{adj.type}' sluit niet cent-exact aan: excl. + btw is niet gelijk aan totaal.")
            r.confidence["adjustments"]=min(r.confidence.get("adjustments",.5),.55)
        if adj.vatRate in {9,21} and adj.subtotal is not None and adj.vatTotal is not None:
            expected_adj=rounded_vat_cents(abs(float(adj.subtotal)),float(adj.vatRate))
            if expected_adj is not None and abs(expected_adj-vat_adj)>1:
                w.append(f"Kostenblok '{adj.type}' heeft een btw-bedrag dat niet past bij {adj.vatRate:g}%.")
                r.confidence["adjustments"]=min(r.confidence.get("adjustments",.5),.55)

    if a.settlementAmount is not None and a.total is not None and r.adjustments:
        total_cents=money_cents(a.total)
        settlement_cents=money_cents(a.settlementAmount)
        expected_cents=(total_cents-adjustment_cents) if total_cents is not None else None
        if expected_cents is None or settlement_cents!=expected_cents:
            expected_settlement=(expected_cents or 0)/100
            w.append(f"Uitbetaling sluit niet cent-exact aan: factuur {a.total:.2f} minus/plus correcties = {expected_settlement:.2f}, maar uitbetaling is {a.settlementAmount:.2f}.")
            r.confidence["settlementAmount"]=min(r.confidence.get("settlementAmount",.5),.55)
        else:
            r.confidence["settlementAmount"]=max(r.confidence.get("settlementAmount",0),.98)

    # VAT groups are persisted financial subdata and must reconcile independently.
    if a.vatLines:
        known_cents=sum((money_cents(v.vatAmount) or 0) for v in a.vatLines if v.vatAmount is not None)
        if a.vatTotal is not None and known_cents!=money_cents(a.vatTotal):
            w.append("Som van btw-groepen wijkt cent-exact af van totaal btw.")
            r.confidence["vatLines"]=min(r.confidence.get("vatLines",.5),.55)
        for v in a.vatLines:
            if v.rate not in {0,9,21} and not (0<=v.rate<=30):
                w.append(f"Ongebruikelijk btw-tarief: {v.rate}%.")
                r.confidence["vatLines"]=min(r.confidence.get("vatLines",.5),.55)
            if v.taxableAmount is not None and v.vatAmount is not None and v.rate>0:
                expected=rounded_vat_cents(v.taxableAmount,v.rate)
                actual=money_cents(v.vatAmount)
                # One cent is allowed for a printed VAT group because documents may
                # aggregate line-rounded VAT; the group total itself is never rewritten.
                if expected is not None and actual is not None and abs(expected-actual)>1:
                    w.append(f"Btw-groep {v.rate:g}% sluit niet aan op de belastbare grondslag.")
                    r.confidence["vatLines"]=min(r.confidence.get("vatLines",.5),.55)
    # normalize warning uniqueness
    # normalize warning uniqueness
    r.warnings=list(dict.fromkeys(w))
    return r

# ----------------------------- AI structured review -----------------------------
def verification_attachment(raw:bytes|None,content_type:str,filename:str)->dict[str,str]|None:
    if not raw:return None
    c=(content_type or "").lower()
    ext=Path(filename or "").suffix.lower()
    if raw[:4]==b"%PDF" or c=="application/pdf" or ext==".pdf":
        if len(raw)>12*1024*1024:return None
        return {"kind":"file","mime":"application/pdf","name":filename or "document.pdf","base64":base64.b64encode(raw).decode("ascii")}
    if c in {"image/jpeg","image/png","image/webp","image/gif"} or ext in {".jpg",".jpeg",".png",".webp",".gif"}:
        if len(raw)>12*1024*1024:return None
        mime=c if c.startswith("image/") else ("image/jpeg" if ext in {".jpg",".jpeg"} else f"image/{ext.lstrip('.')}")
        return {"kind":"image","mime":mime,"name":filename or "document-image","base64":base64.b64encode(raw).decode("ascii")}
    if c in SUPPORTED_IMAGE_MIME_TYPES or ext in {".heic",".heif",".tif",".tiff",".bmp"}:
        try:
            img=Image.open(io.BytesIO(raw))
            img=prepare_ocr_image(img)
            buf=io.BytesIO();img.save(buf,format="JPEG",quality=92,optimize=True)
            converted=buf.getvalue()
            if len(converted)>12*1024*1024:return None
            return {"kind":"image","mime":"image/jpeg","name":Path(filename or "document").stem+".jpg","base64":base64.b64encode(converted).decode("ascii")}
        except Exception:
            return None
    return None

def ai_extract(doc:dict,filename:str,company:dict,heuristic:ExtractionResult,independent:bool=False,raw:bytes|None=None,content_type:str="")->tuple[ExtractionResult|None,dict[str,Any]|None]:
    if not OPENAI_API_KEY:return None,{"internal_code":"AI_PROVIDER_NOT_CONFIGURED","provider":"openai"}
    compact_layout=[]
    for p in doc.get("layout",[])[:10]: compact_layout.append({"page":p.get("page"),"words":p.get("words",[])[:900]})
    context={
        "fileName":filename,"pageCount":doc.get("pageCount"),"company":company,
        "text":(doc.get("text") or "")[:70000],"financialText":(doc.get("financialText") or "")[:12000],"tables":doc.get("tables",[])[:20],"layout":compact_layout,
    }
    if not independent:
        context["heuristic"]=heuristic.model_dump()
    schema={
      "documentType":"purchase_invoice|sales_invoice|credit_invoice|receipt|bank_document|other",
      "originalFileName":"string","pageCount":"integer",
      "supplier":{"name":None,"address":None,"postalCode":None,"city":None,"country":None,"kvk":None,"vatNumber":None,"iban":None,"email":None},
      "customer":{"name":None,"address":None,"postalCode":None,"city":None,"country":None,"kvk":None,"vatNumber":None,"email":None},
      "invoice":{"invoiceNumber":None,"invoiceDate":None,"dueDate":None,"paymentTermDays":None,"orderNumber":None,"paymentReference":None,"description":None},
      "amounts":{"subtotal":None,"vatLines":[{"rate":21,"taxableAmount":None,"vatAmount":None}],"vatTotal":None,"total":None,"settlementAmount":None,"discount":None,"shipping":None,"currency":"EUR"},
      "status":"draft|open|paid|overdue|cancelled|credit|unknown","lineItems":[{"description":None,"quantity":None,"unitPrice":None,"vatRate":None,"lineTotal":None}],"adjustments":[{"type":"factoring_fee","description":None,"subtotal":None,"vatTotal":None,"total":None,"vatRate":21,"direction":"deduction","counterparty":None}],"confidence":{},"warnings":[],"processing":{}
    }
    independence=(
        "This is an INDEPENDENT SECOND VERIFICATION. Determine every field again from the original source and extracted source text. "
        "You are deliberately not given PASS 1 values. Do not try to confirm a previous answer. "
        if independent else
        "This is the primary structured extraction. The deterministic heuristic is only a weak hint and visible source evidence wins. "
    )
    instructions=(
        "You extract accounting documents for a Dutch bookkeeping application. Return ONLY a JSON object matching the supplied shape. "
        +independence+
        "Never invent a value. Use null when not explicit or strongly supported. Distinguish supplier and customer. The user's own company is context only. "
        "For self-billing, determine the commercial supplier/customer roles from the document, not page position. "
        "Interpret Dutch money formats correctly: 1.234,56 = 1234.56. Keep the commercial invoice subtotal/VAT/total strictly separate from factoring fees, commission, platform fees, withholding and payout. "
        "Put each fee/correction in adjustments. Put the final amount actually paid/settled in amounts.settlementAmount; never use settlementAmount as amounts.total. "
        "For VAT, preserve separate 0/9/21 percent lines. Dates must be YYYY-MM-DD. Do not turn headers or total rows into line items. "
        "Confidence values are 0..1 and must reflect visible evidence, OCR quality and arithmetic consistency; do not make all confidence values high. "
        "If evidence is ambiguous, keep the value empty and add a warning instead of guessing."
    )
    content=[{"type":"input_text","text":"Target JSON shape:\n"+json.dumps(schema)+"\n\nDocument context:\n"+json.dumps(context,ensure_ascii=False)}]
    if independent:
        attachment=verification_attachment(raw,content_type,filename)
        if attachment:
            data_url=f"data:{attachment['mime']};base64,{attachment['base64']}"
            if attachment["kind"]=="image":
                content.append({"type":"input_image","image_url":data_url,"detail":"high"})
            else:
                content.append({"type":"input_file","filename":attachment["name"],"file_data":data_url})
    payload={"model":OPENAI_MODEL,"input":[{"role":"system","content":[{"type":"input_text","text":instructions}]},{"role":"user","content":content}],"max_output_tokens":7000,"reasoning":{"effort":"medium" if independent else "medium"},"store":False}
    try:
        resp=requests.post(OPENAI_RESPONSES_URL,headers={"Authorization":f"Bearer {OPENAI_API_KEY}","Content-Type":"application/json"},json=payload,timeout=REQUEST_TIMEOUT)
    except requests.Timeout as exc:
        return None,{"internal_code":"AI_PROVIDER_TIMEOUT","provider":"openai","internal_error":exc}
    except requests.RequestException as exc:
        return None,{"internal_code":"AI_PROVIDER_UNAVAILABLE","provider":"openai","internal_error":exc}
    request_id=resp.headers.get("x-request-id") or resp.headers.get("openai-request-id")
    if resp.status_code>=400:
        provider_code=None;provider_message=""
        try:
            upstream=resp.json()
            provider_code=sanitize_log_value((upstream.get("error") or {}).get("code") or upstream.get("code"),120)
            provider_message=sanitize_log_value((upstream.get("error") or {}).get("message") or upstream.get("message"),300)
        except Exception:
            upstream=None
        return None,{
            "internal_code":"AI_PROVIDER_HTTP_ERROR","provider":"openai","provider_status":resp.status_code,
            "provider_code":provider_code,"provider_request_id":sanitize_log_value(request_id,120),"internal_error":provider_message,
        }
    try:
        body=resp.json();txt=body.get("output_text") or ""
        if not txt:
            for item in body.get("output",[]):
                if item.get("type")=="message":
                    for part in item.get("content",[]):
                        if part.get("type")=="output_text":txt+=part.get("text","")
        txt=txt.strip()
        if txt.startswith("```"):txt=re.sub(r"^```(?:json)?|```$","",txt,flags=re.I).strip()
        a,b=txt.find("{"),txt.rfind("}")
        if a>=0 and b>a:txt=txt[a:b+1]
        data=json.loads(txt)
        data["originalFileName"]=filename;data["pageCount"]=doc.get("pageCount",1)
        result=ExtractionResult.model_validate(data)
        result.processing={**heuristic.processing,"ai":True,"aiModel":OPENAI_MODEL,"aiUsage":body.get("usage") or None,"independentVerification":bool(independent)}
        return validate_result(result,company),None
    except Exception as exc:
        return None,{"internal_code":"AI_RESPONSE_INVALID","provider":"openai","provider_status":resp.status_code,"provider_request_id":sanitize_log_value(request_id,120),"internal_error":exc}

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
        s=money_cents(r.amounts.subtotal);v=money_cents(r.amounts.vatTotal);t=money_cents(r.amounts.total)
        if s is None or v is None or t is None or s+v!=t:
            return False
    return True

def require_authenticated_user(request: Request) -> dict:
    set_processing_meta(request,stage="auth")
    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        raise BoekunaDocumentError("AUTH_SESSION_EXPIRED",status=401,internal_code="AUTH_HEADER_MISSING")
    if not SUPABASE_PUBLISHABLE_KEY:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="AUTH_VERIFIER_NOT_CONFIGURED")
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization":auth_header,"apikey":SUPABASE_PUBLISHABLE_KEY},
            timeout=10,
        )
    except requests.Timeout as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="AUTH_SERVICE_TIMEOUT",internal_error=exc)
    except requests.RequestException as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="AUTH_SERVICE_UNAVAILABLE",internal_error=exc)
    if resp.status_code != 200:
        raise BoekunaDocumentError("AUTH_SESSION_EXPIRED",status=401,internal_code="AUTH_SESSION_INVALID",provider="supabase_auth",provider_status=resp.status_code)
    try:
        user = resp.json()
    except Exception as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="AUTH_RESPONSE_INVALID",internal_error=exc,provider="supabase_auth",provider_status=resp.status_code)
    if not user.get("id"):
        raise BoekunaDocumentError("AUTH_SESSION_EXPIRED",status=401,internal_code="AUTH_USER_MISSING")
    set_processing_meta(request,user_ref=str(user.get("id"))[:80])
    return user

def rpc_access_check(request:Request) -> bool:
    auth_header=(request.headers.get("authorization") or "").strip()
    if not SUPABASE_PUBLISHABLE_KEY or not auth_header:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="ACCESS_CHECK_NOT_CONFIGURED")
    set_processing_meta(request,stage="entitlement")
    try:
        resp=requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/can_operate_bookkeeping",
            headers={"Authorization":auth_header,"apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
            json={},timeout=8,
        )
    except requests.Timeout as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="ACCESS_CHECK_TIMEOUT",internal_error=exc)
    except requests.RequestException as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="ACCESS_CHECK_UNAVAILABLE",internal_error=exc)
    if resp.status_code>=400:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="ACCESS_CHECK_FAILED",provider="supabase_rest",provider_status=resp.status_code)
    try:
        return resp.json() is True
    except Exception as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="ACCESS_CHECK_RESPONSE_INVALID",internal_error=exc)

def billing_quota_status(request: Request) -> dict:
    """Check the monthly smart-document allowance after access-state validation."""
    auth_header = (request.headers.get("authorization") or "").strip()
    if not SUPABASE_PUBLISHABLE_KEY or not auth_header:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_CHECK_NOT_CONFIGURED")
    set_processing_meta(request,stage="quota")
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/check_document_quota",
            headers={"Authorization":auth_header,"apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
            json={},timeout=8,
        )
    except requests.Timeout as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_CHECK_TIMEOUT",internal_error=exc)
    except requests.RequestException as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_CHECK_UNAVAILABLE",internal_error=exc)
    if resp.status_code >= 400:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_CHECK_FAILED",provider="supabase_rest",provider_status=resp.status_code)
    try:
        data = resp.json()
    except Exception as exc:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_RESPONSE_INVALID",internal_error=exc)
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict):
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="QUOTA_RESPONSE_INVALID_SHAPE")
    return data

def record_billing_usage(request: Request) -> dict | None:
    """Consume one monthly smart-document unit after successful processing."""
    auth_header = (request.headers.get("authorization") or "").strip()
    if not SUPABASE_PUBLISHABLE_KEY or not auth_header:
        logger.error(json.dumps({"event":"document_usage_record_failed","reference_id":new_reference_id(),"internal_code":"USAGE_RECORD_NOT_CONFIGURED"}))
        return None
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/record_document_usage",
            headers={"Authorization":auth_header,"apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
            json={},timeout=8,
        )
        if resp.status_code >= 400:
            logger.error(json.dumps({
                "event":"document_usage_record_failed","reference_id":new_reference_id(),
                "internal_code":"USAGE_RECORD_HTTP_ERROR","provider":"supabase_rest","provider_status":resp.status_code,
                "user_ref":(getattr(request.state,"processing_meta",{}) or {}).get("user_ref"),
            }))
            return None
        data = resp.json()
        if isinstance(data, list):
            return data[0] if data else None
        if isinstance(data, dict):
            return data
        logger.error(json.dumps({"event":"document_usage_record_failed","reference_id":new_reference_id(),"internal_code":"USAGE_RECORD_INVALID_SHAPE"}))
        return None
    except Exception as exc:
        logger.error(json.dumps({
            "event":"document_usage_record_failed","reference_id":new_reference_id(),
            "internal_code":"USAGE_RECORD_EXCEPTION","internal_error":sanitize_log_value(exc),
            "user_ref":(getattr(request.state,"processing_meta",{}) or {}).get("user_ref"),
        }))
        return None

@app.get("/health")
def health():
    return {
        "ok":True,
        "service":"boekuna-document-processor",
        "aiConfigured":bool(OPENAI_API_KEY),
        "verificationConfigured":bool(OPENAI_API_KEY),
        "ocrAvailable":bool(RapidOCR),
        "ocrGeneration":RAPIDOCR_GENERATION,
        "ocrModel":OCR_MODEL_NAME,
        "authRequired":True,
        "billingQuota":True,
        "version":"3.0",
        "limits":{"maxSizeMb":MAX_SIZE_MB,"maxPdfPages":50},
        "supportedExtensions":list(SUPPORTED_DOCUMENT_EXTENSIONS),
        "supportedMimeTypes":list(SUPPORTED_DOCUMENT_MIME_TYPES),
    }

@app.post("/verify")
async def verify_document(request:Request,file:UploadFile=File(...),company_json:str=Form("{}")):
    require_allowed_origin(request)
    user=require_authenticated_user(request)
    set_processing_meta(
        request,stage="rate_limit",
        file_mime=(file.content_type or "application/octet-stream")[:120],
        file_ext=Path(file.filename or "").suffix.lower(),
    )
    if not allow_request(request,f"verify:{user.get('id','unknown')}"):
        raise BoekunaDocumentError("RATE_LIMITED",status=429,internal_code="VERIFY_RATE_LIMIT")
    if not rpc_access_check(request):
        raise BoekunaDocumentError("ACCOUNT_READ_ONLY",status=403,internal_code="ENTITLEMENT_READ_ONLY")
    # PASS 2 is an integrity check of an already accepted document and never consumes
    # or requires a second monthly smart-document quota unit.
    if not OPENAI_API_KEY:
        raise BoekunaDocumentError("PROCESSOR_UNAVAILABLE",status=503,internal_code="AI_PROVIDER_NOT_CONFIGURED")
    set_processing_meta(request,stage="receive")
    raw=await file.read(MAX_BYTES+1)
    set_processing_meta(request,file_size=len(raw))
    if len(raw)>MAX_BYTES:
        raise BoekunaDocumentError("DOCUMENT_TOO_LARGE",status=413,context={"max_size_mb":MAX_SIZE_MB},internal_code="FILE_SIZE_LIMIT")
    if not raw:
        raise BoekunaDocumentError("INVALID_REQUEST",status=400,internal_code="EMPTY_FILE")
    try:
        company=json.loads(company_json or "{}")
    except Exception:
        company={}
    started=time.time()
    set_processing_meta(request,stage="extract")
    doc=extract_document(file.filename or "document",file.content_type or "",raw)
    heur=heuristic_extract(doc,file.filename or "document",company)
    set_processing_meta(request,stage="ai_verify")
    ai,ai_failure=ai_extract(doc,file.filename or "document",company,heur,independent=True,raw=raw,content_type=file.content_type or "")
    if not ai:
        failure=ai_failure or {"internal_code":"AI_VERIFICATION_UNAVAILABLE","provider":"openai"}
        is_timeout=failure.get("internal_code")=="AI_PROVIDER_TIMEOUT"
        raise BoekunaDocumentError(
            "PROCESSING_TIMEOUT" if is_timeout else "PROCESSOR_UNAVAILABLE",
            status=504 if is_timeout else 503,
            internal_code=str(failure.get("internal_code") or "AI_VERIFICATION_UNAVAILABLE"),
            internal_error=failure.get("internal_error"),
            provider=failure.get("provider"),
            provider_status=failure.get("provider_status"),
            provider_code=failure.get("provider_code"),
            provider_request_id=failure.get("provider_request_id"),
            state="stored_unprocessed",
        )
    result=reconcile(ai,heur)
    result=validate_result(result,company)
    result.processing={**result.processing,"verificationMode":"independent","durationMs":round((time.time()-started)*1000),"pages":doc.get("pageCount"),"tablesFound":len(doc.get("tables",[])),"overallConfidence":round(overall_confidence(result),3)}
    return {"ok":True,"data":result.model_dump()}

@app.post("/analyze")
async def analyze(request:Request,file:UploadFile=File(...),company_json:str=Form("{}"),existing_json:str=Form("[]"),ocr_text:str=Form("")):
    require_allowed_origin(request)
    user=require_authenticated_user(request)
    set_processing_meta(
        request,stage="rate_limit",
        file_mime=(file.content_type or "application/octet-stream")[:120],
        file_ext=Path(file.filename or "").suffix.lower(),
    )
    if not allow_request(request,f"user:{user.get('id','unknown')}"):
        raise BoekunaDocumentError("RATE_LIMITED",status=429,internal_code="DOCUMENT_PROCESSOR_RATE_LIMIT")
    if not rpc_access_check(request):
        raise BoekunaDocumentError("ACCOUNT_READ_ONLY",status=403,internal_code="ENTITLEMENT_READ_ONLY")
    quota=billing_quota_status(request)
    if quota.get("allowed") is False:
        raise BoekunaDocumentError(
            "DOCUMENT_LIMIT_REACHED",status=429,internal_code="DOCUMENT_MONTHLY_LIMIT",
            context={"monthly_limit":quota.get("monthly_limit"),"remaining":quota.get("remaining")},
        )
    set_processing_meta(request,stage="receive")
    raw=await file.read(MAX_BYTES+1)
    set_processing_meta(request,file_size=len(raw))
    if len(raw)>MAX_BYTES:
        raise BoekunaDocumentError("DOCUMENT_TOO_LARGE",status=413,context={"max_size_mb":MAX_SIZE_MB},internal_code="FILE_SIZE_LIMIT")
    if not raw:
        raise BoekunaDocumentError("INVALID_REQUEST",status=400,internal_code="EMPTY_FILE")
    logger.info(
        json.dumps({
            "event":"document_analysis_started","route":request.url.path,
            "file_mime":(file.content_type or "application/octet-stream")[:120],
            "file_ext":Path(file.filename or "").suffix.lower(),"file_size":len(raw),
        })
    )
    try:
        company=json.loads(company_json or "{}")
    except Exception:
        company={}
    try:
        existing=json.loads(existing_json or "[]")
    except Exception:
        existing=[]
    started=time.time()
    set_processing_meta(request,stage="extract")
    doc=extract_document(file.filename or "document",file.content_type or "",raw)
    logger.info(json.dumps({
        "event":"document_analysis_extracted","kind":doc.get("kind"),"pages":doc.get("pageCount"),
        "ocr_pages":len(doc.get("ocrPages") or []),"tables":len(doc.get("tables") or []),
        "duration_ms":round((time.time()-started)*1000),
    }))
    if ocr_text and len((doc.get("text") or "").replace(" ","")) < 320:
        doc["text"] = (doc.get("text") or "") + "\n\n--- CLIENT OCR ---\n" + ocr_text[:70000]
        doc.setdefault("processingHints", {})["clientOcrUsed"] = True
    heur=heuristic_extract(doc,file.filename or "document",company)
    fast_path=deterministic_fast_path_ready(doc,heur)
    ai_failure=None
    if fast_path:
        ai=None
    else:
        set_processing_meta(request,stage="ai_extract")
        ai,ai_failure=ai_extract(doc,file.filename or "document",company,heur)
    result=reconcile(ai,heur) if ai else heur
    if ai_failure:
        degraded_ref=new_reference_id()
        logger.warning(json.dumps({
            "event":"document_ai_degraded","reference_id":degraded_ref,
            "timestamp":datetime.utcnow().isoformat(timespec="milliseconds")+"Z",
            "route":request.url.path,"stage":"ai_extract",
            "internal_code":ai_failure.get("internal_code"),
            "provider":ai_failure.get("provider"),
            "provider_status":ai_failure.get("provider_status"),
            "provider_code":ai_failure.get("provider_code"),
            "provider_request_id":ai_failure.get("provider_request_id"),
            "internal_error":sanitize_log_value(ai_failure.get("internal_error")),
            "user_ref":str(user.get("id"))[:80],
            "file_mime":(file.content_type or "application/octet-stream")[:120],
            "file_ext":Path(file.filename or "").suffix.lower(),"file_size":len(raw),
        }))
        result.warnings.append("Extra AI-controle was tijdelijk niet beschikbaar; controleer onzekere velden handmatig.")
    result=validate_result(result,company)
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
    if ai_failure:
        processing["aiStatus"]="degraded"
    usage=record_billing_usage(request)
    if usage:
        processing["billing"]={"plan":usage.get("plan"),"monthlyLimit":usage.get("monthly_limit"),"used":usage.get("used"),"remaining":usage.get("remaining")}
    result.processing=processing
    return {"ok":True,"data":result.model_dump(),"preview":{"text":(doc.get("text") or "")[:30000],"pages":doc.get("pages",[])[:50],"tables":doc.get("tables",[])[:20]},"duplicateCandidates":dup}
