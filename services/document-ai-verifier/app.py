from __future__ import annotations

import asyncio
import hmac
import json
import os
import time
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

SERVICE_NAME = "boekuna-document-ai-verifier"
SERVICE_VERSION = "0.1.0"
DEFAULT_MODEL = "Qwen3-VL-2B-Instruct"
MAX_OCR_CHARS = 20_000
MAX_FIELDS = 24
MAX_CANDIDATES = 8
MAX_IMAGE_DATA_URL_CHARS = 12_000_000
CIRCUIT_FAILURE_THRESHOLD = max(1, int(os.getenv("VERIFIER_CIRCUIT_FAILURE_THRESHOLD", "3")))
CIRCUIT_OPEN_SECONDS = max(1, int(os.getenv("VERIFIER_CIRCUIT_OPEN_SECONDS", "60")))
VERIFY_TIMEOUT_SECONDS = max(1.0, float(os.getenv("VERIFIER_TIMEOUT_SECONDS", "45")))
CONCURRENCY = max(1, int(os.getenv("VERIFIER_CONCURRENCY", "1")))

FieldName = Literal[
    "documentType",
    "supplier",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "currency",
    "subtotal",
    "vatTotal",
    "gross",
    "vatRate",
    "vatLines",
    "mixedRates",
    "iban",
    "bic",
    "vatId",
    "amountPaid",
    "advancePaid",
    "amountDue",
    "paymentReference",
    "factoringFeeTotal",
    "payoutAmount",
]

Verdict = Literal["agree", "disagree", "uncertain"]


class VerifierUnavailable(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class FieldCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: FieldName
    parserValue: str | None = Field(default=None, max_length=400)
    parserConfidence: float = Field(ge=0.0, le=1.0)
    parserCandidates: list[str] = Field(default_factory=list, max_length=MAX_CANDIDATES)
    userConfirmed: bool = False

    @field_validator("parserCandidates")
    @classmethod
    def _bound_candidates(cls, values: list[str]) -> list[str]:
        clean: list[str] = []
        for value in values:
            value = str(value).strip()
            if not value:
                continue
            if len(value) > 400:
                raise ValueError("candidate too long")
            if value not in clean:
                clean.append(value)
        return clean


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    documentImageDataUrl: str = Field(min_length=1, max_length=MAX_IMAGE_DATA_URL_CHARS)
    ocrText: str = Field(default="", max_length=MAX_OCR_CHARS)
    documentType: str = Field(default="unknown", max_length=80)
    qualityFlags: list[str] = Field(default_factory=list, max_length=16)
    fields: list[FieldCheck] = Field(min_length=1, max_length=MAX_FIELDS)

    @field_validator("documentImageDataUrl")
    @classmethod
    def _image_only(cls, value: str) -> str:
        allowed = (
            "data:image/png;base64,",
            "data:image/jpeg;base64,",
            "data:image/webp;base64,",
        )
        if not value.startswith(allowed):
            raise ValueError("only normalized PNG/JPEG/WebP document images are accepted")
        return value

    @field_validator("qualityFlags")
    @classmethod
    def _quality_flags(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        for value in values:
            value = str(value).strip()[:80]
            if value and value not in out:
                out.append(value)
        return out


class VerdictRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: FieldName
    parserValue: str | None
    verifierValue: str | None
    verdict: Verdict
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: str = Field(max_length=240)
    candidateMatch: bool


app = FastAPI(
    title="BOEKUNA Document AI Verifier",
    version=SERVICE_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_semaphore = asyncio.Semaphore(CONCURRENCY)
_failure_count = 0
_circuit_open_until = 0.0


def reset_runtime_state_for_tests() -> None:
    global _failure_count, _circuit_open_until, _semaphore
    _failure_count = 0
    _circuit_open_until = 0.0
    _semaphore = asyncio.Semaphore(CONCURRENCY)


def _circuit_open() -> bool:
    return time.monotonic() < _circuit_open_until


def _record_failure() -> None:
    global _failure_count, _circuit_open_until
    _failure_count += 1
    if _failure_count >= CIRCUIT_FAILURE_THRESHOLD:
        _circuit_open_until = time.monotonic() + CIRCUIT_OPEN_SECONDS


def _record_success() -> None:
    global _failure_count, _circuit_open_until
    _failure_count = 0
    _circuit_open_until = 0.0


def _error(code: str, status: int = 503) -> HTTPException:
    return HTTPException(
        status_code=status,
        detail={
            "code": code,
            "fallback": "deterministic_pipeline_and_human_review",
        },
    )


def _authorized(authorization: str | None) -> bool:
    expected = os.getenv("BOOKUNA_DOCUMENT_AI_TOKEN", "")
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    supplied = authorization[7:]
    return hmac.compare_digest(supplied, expected)


def _backend_url() -> str:
    return os.getenv("LOCAL_VLM_URL", "").strip().rstrip("/")


def _model_name() -> str:
    return os.getenv("LOCAL_VLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _normalize_candidate(value: str | None) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _response_schema(fields: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "verdicts": {
                "type": "array",
                "maxItems": len(fields),
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "field": {"type": "string", "enum": fields},
                        "verdict": {"type": "string", "enum": ["agree", "disagree", "uncertain"]},
                        "verifierValue": {"type": "string", "maxLength": 400},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "evidence": {"type": "string", "maxLength": 240},
                    },
                    "required": ["field", "verdict", "verifierValue", "confidence", "evidence"],
                },
            }
        },
        "required": ["verdicts"],
    }


def _prompt(request: VerifyRequest) -> str:
    field_payload = [
        {
            "field": row.field,
            "parserValue": row.parserValue,
            "parserConfidence": row.parserConfidence,
            "parserCandidates": row.parserCandidates,
        }
        for row in request.fields
    ]
    return (
        "You are BOEKUNA's document semantic verifier. You are not a bookkeeper and you may not "
        "invent, calculate, reconcile or post financial values. Inspect only visible document evidence. "
        "For each requested field return agree, disagree, or uncertain. A disagree value must be text "
        "that is directly visible in the supplied document. If evidence is insufficient, use uncertain. "
        "Never collapse mixed VAT into a single rate. Do not infer a value from arithmetic. "
        "Keep evidence short and quote/describe only the local visible clue.\n\n"
        f"Document type hint: {request.documentType}\n"
        f"Quality flags: {json.dumps(request.qualityFlags, ensure_ascii=False)}\n"
        f"OCR text (supporting evidence, may be wrong):\n{request.ocrText}\n\n"
        f"Parser fields to verify:\n{json.dumps(field_payload, ensure_ascii=False)}"
    )


async def backend_ready() -> bool:
    url = _backend_url()
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(url + "/health")
        return 200 <= response.status_code < 300
    except Exception:
        return False


async def query_local_vlm(request: VerifyRequest) -> dict[str, Any]:
    url = _backend_url()
    if not url:
        raise VerifierUnavailable("VERIFIER_BACKEND_NOT_CONFIGURED")

    fields = [row.field for row in request.fields]
    body = {
        "model": _model_name(),
        "temperature": 0,
        "max_tokens": 320,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": request.documentImageDataUrl}},
                    {"type": "text", "text": _prompt(request)},
                ],
            }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "boekuna_document_verifier",
                "strict": True,
                "schema": _response_schema(fields),
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=VERIFY_TIMEOUT_SECONDS) as client:
            response = await client.post(url + "/v1/chat/completions", json=body)
    except httpx.TimeoutException as exc:
        raise VerifierUnavailable("VERIFIER_TIMEOUT") from exc
    except Exception as exc:
        raise VerifierUnavailable("VERIFIER_BACKEND_UNAVAILABLE") from exc

    if response.status_code < 200 or response.status_code >= 300:
        raise VerifierUnavailable("VERIFIER_BACKEND_UNAVAILABLE")

    try:
        envelope = response.json()
        content = envelope["choices"][0]["message"]["content"]
        if isinstance(content, str):
            return json.loads(content)
        if isinstance(content, dict):
            return content
    except Exception as exc:
        raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID") from exc
    raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")


def _validate_model_result(
    raw: dict[str, Any],
    request: VerifyRequest,
) -> list[VerdictRow]:
    if not isinstance(raw, dict) or not isinstance(raw.get("verdicts"), list):
        raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

    requested = {row.field: row for row in request.fields}
    seen: set[str] = set()
    result: list[VerdictRow] = []

    for item in raw["verdicts"]:
        if not isinstance(item, dict):
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")
        field = item.get("field")
        if field not in requested or field in seen:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")
        seen.add(field)

        verdict = item.get("verdict")
        if verdict not in {"agree", "disagree", "uncertain"}:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

        value = item.get("verifierValue")
        if value is None:
            value = ""
        if not isinstance(value, str) or len(value) > 400:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

        evidence = item.get("evidence")
        if not isinstance(evidence, str) or len(evidence) > 240:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

        try:
            confidence = float(item.get("confidence"))
        except Exception as exc:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID") from exc
        if confidence < 0 or confidence > 1:
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

        parser = requested[field]
        if verdict == "agree" and _normalize_candidate(value) != _normalize_candidate(parser.parserValue):
            raise VerifierUnavailable("VERIFIER_RESPONSE_INVALID")

        candidate_set = {
            _normalize_candidate(candidate)
            for candidate in parser.parserCandidates
            if _normalize_candidate(candidate)
        }
        candidate_match = bool(_normalize_candidate(value)) and (
            _normalize_candidate(value) in candidate_set
        )

        result.append(
            VerdictRow(
                field=field,
                parserValue=parser.parserValue,
                verifierValue=value or None,
                verdict=verdict,
                confidence=confidence,
                evidence=evidence,
                candidateMatch=candidate_match,
            )
        )
    return result


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "scope": "documents-only",
        "model": _model_name(),
        "backendConfigured": bool(_backend_url()),
        "circuitOpen": _circuit_open(),
        "financialSourceOfTruth": False,
        "storesDocuments": False,
        "databaseAccess": False,
        "generalChat": False,
    }


@app.get("/ready")
async def ready() -> dict[str, Any]:
    if _circuit_open():
        raise _error("VERIFIER_CIRCUIT_OPEN")
    if not await backend_ready():
        raise _error("MODEL_NOT_READY")
    return {"ok": True, "service": SERVICE_NAME, "modelReady": True}


@app.post("/verify")
async def verify(
    request: VerifyRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not _authorized(authorization):
        raise _error("UNAUTHORIZED", 401)
    if _circuit_open():
        raise _error("VERIFIER_CIRCUIT_OPEN")

    model_fields = [row for row in request.fields if not row.userConfirmed]
    if not model_fields:
        return {
            "ok": True,
            "service": SERVICE_NAME,
            "model": _model_name(),
            "sourceOfTruth": "boekuna-deterministic-pipeline",
            "mayBook": False,
            "verdicts": [],
            "processingMs": 0,
        }

    model_request = request.model_copy(update={"fields": model_fields})
    started = time.perf_counter()

    try:
        async with _semaphore:
            raw = await query_local_vlm(model_request)
        verdicts = _validate_model_result(raw, model_request)
    except VerifierUnavailable as exc:
        _record_failure()
        raise _error(exc.code) from exc
    except Exception as exc:
        _record_failure()
        raise _error("VERIFIER_RESPONSE_INVALID") from exc

    _record_success()
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "model": _model_name(),
        "sourceOfTruth": "boekuna-deterministic-pipeline",
        "mayBook": False,
        "verdicts": [row.model_dump() for row in verdicts],
        "processingMs": round((time.perf_counter() - started) * 1000, 2),
    }
