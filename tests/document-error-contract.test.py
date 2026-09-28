import asyncio
import io
import json
import logging
import re
import sys
from pathlib import Path

from fastapi import Request

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def request(path="/analyze"):
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(b"origin", b"https://boekuna-boekhouding.onrender.com")],
        "client": ("127.0.0.1", 12345),
        "server": ("processor.test", 443),
    }
    return Request(scope)


class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def body(response):
    return json.loads(response.body.decode("utf-8"))


def test_public_server_error_never_leaks_internal_details():
    req = request()
    processor.set_processing_meta(
        req,
        stage="ai_provider",
        user_ref="internal-user-ref",
        file_mime="application/pdf",
        file_ext=".pdf",
        file_size=12345,
    )
    capture = Capture()
    processor.logger.addHandler(capture)
    try:
        response = processor.public_error_response(
            req,
            processor.BoekunaDocumentError(
                "PROCESSOR_UNAVAILABLE",
                status=503,
                internal_code="AI_PROVIDER_HTTP_ERROR",
                internal_error="ReferenceError: secretVariable is not defined token=abc123 sk-test-RAWSECRET",
                provider="openai",
                provider_status=500,
                provider_code="upstream_internal_error",
                provider_request_id="req_provider_123",
            ),
        )
    finally:
        processor.logger.removeHandler(capture)

    payload = body(response)
    assert response.status_code == 503
    assert payload["ok"] is False
    assert payload["error"]["code"] == "PROCESSOR_UNAVAILABLE"
    assert payload["error"]["category"] == "temporary"
    assert payload["error"]["retryable"] is True
    reference = payload["error"]["reference_id"]
    assert re.fullmatch(r"BK-[A-Z2-9]{6}", reference)
    assert payload["error"]["context"] == {}
    assert payload["error"]["state"] == "no_changes"

    public = json.dumps(payload)
    for forbidden in [
        "ReferenceError",
        "secretVariable",
        "abc123",
        "RAWSECRET",
        "upstream_internal_error",
        "req_provider_123",
        "internal-user-ref",
        "openai",
    ]:
        assert forbidden not in public

    logs = "\n".join(capture.messages)
    assert reference in logs
    assert "AI_PROVIDER_HTTP_ERROR" in logs
    assert '"provider_status": 500' in logs
    assert "req_provider_123" in logs
    assert "ReferenceError" in logs
    assert "RAWSECRET" not in logs
    assert "[REDACTED_KEY]" in logs


def test_unexpected_exception_is_wrapped_as_unknown():
    req = request()
    response = asyncio.run(
        processor.unexpected_document_error_handler(
            req,
            RuntimeError("SQL error: relation private_table missing; Bearer super-secret-token"),
        )
    )
    payload = body(response)
    assert response.status_code == 500
    assert payload["error"]["code"] == "UNKNOWN"
    assert payload["error"]["retryable"] is True
    assert re.fullmatch(r"BK-[A-Z2-9]{6}", payload["error"]["reference_id"])
    public = json.dumps(payload)
    assert "SQL error" not in public
    assert "private_table" not in public
    assert "super-secret-token" not in public


def test_safe_context_for_file_limits_and_types():
    req = request()
    too_large = processor.public_error_response(
        req,
        processor.BoekunaDocumentError(
            "DOCUMENT_TOO_LARGE",
            status=413,
            context={"max_size_mb": processor.MAX_SIZE_MB},
            internal_code="FILE_SIZE_LIMIT",
        ),
    )
    payload = body(too_large)
    assert payload["error"]["code"] == "DOCUMENT_TOO_LARGE"
    assert payload["error"]["context"]["max_size_mb"] == 15

    try:
        processor.extract_document("malware.exe", "application/octet-stream", b"MZ-not-a-supported-document")
    except processor.BoekunaDocumentError as exc:
        assert exc.code == "DOCUMENT_UNSUPPORTED_TYPE"
        assert ".pdf" in exc.context["supported_extensions"]
        assert ".heic" in exc.context["supported_extensions"]
    else:
        raise AssertionError("Unsupported files must fail with a stable public code")


def test_library_failures_are_mapped_without_exception_text():
    try:
        processor.extract_document("broken.pdf", "application/pdf", b"%PDF-corrupt")
    except processor.BoekunaDocumentError as exc:
        assert exc.code == "DOCUMENT_PDF_UNREADABLE"
        assert exc.internal_code == "PDF_OPEN_FAILED"
        assert str(exc) == "DOCUMENT_PDF_UNREADABLE"
    else:
        raise AssertionError("Corrupt PDF must fail")

    try:
        processor.extract_document("broken.jpg", "image/jpeg", b"not-an-image")
    except processor.BoekunaDocumentError as exc:
        assert exc.code == "DOCUMENT_IMAGE_UNREADABLE"
        assert exc.internal_code == "IMAGE_DECODE_FAILED"
        assert "PIL" not in str(exc)
    else:
        raise AssertionError("Corrupt image must fail")




class FakeAIResponse:
    def __init__(self, status_code, payload, headers=None):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {"x-request-id": "req-test"}

    def json(self):
        return self._payload


def minimal_ai_case():
    doc = {
        "kind": "pdf",
        "pageCount": 1,
        "text": """--- PAGE 1 ---
FACTUUR
Leverancier: Voorbeeld Leverancier B.V.
Factuurnummer: ERR-1
Factuurdatum: 28-09-2026
Omschrijving: Testdienst
Subtotaal € 100,00
BTW 21% € 21,00
Totaal € 121,00
""",
        "tables": [],
        "layout": [],
        "ocrPages": [],
        "warnings": [],
    }
    heur = processor.heuristic_extract(doc, "error-test.pdf", {})
    return doc, heur


def test_ai_timeout_503_and_malformed_response_are_explicit():
    doc, heur = minimal_ai_case()
    old_key = processor.OPENAI_API_KEY
    old_post = processor.requests.post
    processor.OPENAI_API_KEY = "test-key"
    try:
        def timeout_post(*args, **kwargs):
            raise processor.requests.Timeout("upstream timed out")

        processor.requests.post = timeout_post
        result, failure = processor.ai_extract(doc, "error-test.pdf", {}, heur)
        assert result is None
        assert failure["internal_code"] == "AI_PROVIDER_TIMEOUT"

        processor.requests.post = lambda *args, **kwargs: FakeAIResponse(
            503, {"error": {"code": "service_unavailable", "message": "temporary"}}
        )
        result, failure = processor.ai_extract(doc, "error-test.pdf", {}, heur)
        assert result is None
        assert failure["internal_code"] == "AI_PROVIDER_HTTP_ERROR"
        assert failure["provider_status"] == 503
        assert failure["provider_code"] == "service_unavailable"

        processor.requests.post = lambda *args, **kwargs: FakeAIResponse(
            200, {"output_text": "not-json"}
        )
        result, failure = processor.ai_extract(doc, "error-test.pdf", {}, heur)
        assert result is None
        assert failure["internal_code"] == "AI_RESPONSE_INVALID"
    finally:
        processor.OPENAI_API_KEY = old_key
        processor.requests.post = old_post


def test_verify_rejects_oversized_file_before_processing():
    old_auth = processor.require_authenticated_user
    old_allow = processor.allow_request
    old_access = processor.rpc_access_check
    old_key = processor.OPENAI_API_KEY
    processor.require_authenticated_user = lambda request: {"id": "qa-user"}
    processor.allow_request = lambda request, key_override=None: True
    processor.rpc_access_check = lambda request: True
    processor.OPENAI_API_KEY = "test-key"
    try:
        upload = processor.UploadFile(
            filename="too-large.pdf",
            file=io.BytesIO(b"x" * (processor.MAX_BYTES + 1)),
            headers={"content-type": "application/pdf"},
        )
        try:
            asyncio.run(processor.verify_document(request("/verify"), upload, "{}"))
        except processor.BoekunaDocumentError as exc:
            assert exc.code == "DOCUMENT_TOO_LARGE"
            assert exc.status == 413
            assert exc.context["max_size_mb"] == processor.MAX_SIZE_MB
        else:
            raise AssertionError("Oversized verification upload must fail before extraction")
    finally:
        processor.require_authenticated_user = old_auth
        processor.allow_request = old_allow
        processor.rpc_access_check = old_access
        processor.OPENAI_API_KEY = old_key


if __name__ == "__main__":
    tests = [
        test_public_server_error_never_leaks_internal_details,
        test_unexpected_exception_is_wrapped_as_unknown,
        test_safe_context_for_file_limits_and_types,
        test_library_failures_are_mapped_without_exception_text,
        test_ai_timeout_503_and_malformed_response_are_explicit,
        test_verify_rejects_oversized_file_before_processing,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("Document error contract regression: PASS")
