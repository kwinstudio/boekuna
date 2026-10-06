import json

import httpx
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as verifier  # noqa: E402


@pytest.fixture(autouse=True)
def _safe_env(monkeypatch):
    monkeypatch.setenv("BOOKUNA_DOCUMENT_AI_TOKEN", "qa-secret")
    monkeypatch.setenv("LOCAL_VLM_URL", "http://local-vlm.test")
    verifier.reset_runtime_state_for_tests()


@pytest.fixture
def client():
    return TestClient(verifier.app)


def payload(**overrides):
    body = {
        "documentImageDataUrl": "data:image/png;base64,aGVsbG8=",
        "ocrText": "FACTUUR\nLeverancier Voorbeeld BV\nTotaal 121,00\nBTW 21,00",
        "documentType": "purchase_invoice",
        "qualityFlags": [],
        "fields": [
            {
                "field": "supplier",
                "parserValue": "Voorbeeld BV",
                "parserConfidence": 0.62,
                "parserCandidates": ["Voorbeeld BV", "Voorbeeld Holding BV"],
            },
            {
                "field": "gross",
                "parserValue": "121.00",
                "parserConfidence": 0.99,
                "parserCandidates": ["121.00"],
            },
        ],
    }
    body.update(overrides)
    return body


def auth():
    return {"Authorization": "Bearer qa-secret"}


def test_health_is_document_only_and_secret_free(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["service"] == "boekuna-document-ai-verifier"
    assert body["scope"] == "documents-only"
    assert body["financialSourceOfTruth"] is False
    assert body["storesDocuments"] is False
    assert "qa-secret" not in json.dumps(body)
    assert "OPENAI" not in json.dumps(body).upper()


def test_verify_requires_service_auth(client):
    r = client.post("/verify", json=payload())
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "UNAUTHORIZED"


def test_request_forbids_account_or_database_identifiers(client):
    r = client.post("/verify", headers=auth(), json=payload(userId="user-123"))
    assert r.status_code == 422
    r = client.post("/verify", headers=auth(), json=payload(accountId="acct-123"))
    assert r.status_code == 422


def test_request_accepts_only_document_verification_fields(client):
    bad = payload()
    bad["fields"][0]["field"] = "bankAccountBalance"
    r = client.post("/verify", headers=auth(), json=bad)
    assert r.status_code == 422


def test_model_disagreement_never_becomes_booking_instruction(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "disagree",
                    "verifierValue": "Voorbeeld Holding BV",
                    "confidence": 0.94,
                    "evidence": "Naam staat bovenaan de factuur.",
                },
                {
                    "field": "gross",
                    "verdict": "disagree",
                    "verifierValue": "999.00",
                    "confidence": 0.99,
                    "evidence": "Model test output.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 200
    body = r.json()
    assert body["sourceOfTruth"] == "boekuna-deterministic-pipeline"
    assert body["mayBook"] is False
    rows = {x["field"]: x for x in body["verdicts"]}
    assert rows["supplier"]["candidateMatch"] is True
    assert rows["gross"]["candidateMatch"] is False
    assert rows["gross"]["verifierValue"] == "999.00"
    assert "acceptedValue" not in rows["gross"]


def test_user_confirmed_fields_are_not_sent_to_model(client, monkeypatch):
    seen = {}

    async def fake_backend(request):
        seen["fields"] = [x.field for x in request.fields]
        return {"verdicts": [{"field": "supplier", "verdict": "agree", "verifierValue": "Voorbeeld BV", "confidence": 0.9, "evidence": "Zichtbaar."}]}

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    body = payload()
    body["fields"][1]["userConfirmed"] = True
    r = client.post("/verify", headers=auth(), json=body)
    assert r.status_code == 200
    assert seen["fields"] == ["supplier"]
    assert {x["field"] for x in r.json()["verdicts"]} == {"supplier"}


def test_unknown_or_duplicate_model_fields_fail_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {"field": "supplier", "verdict": "agree", "verifierValue": "Voorbeeld BV", "confidence": 0.9, "evidence": "A"},
                {"field": "supplier", "verdict": "disagree", "verifierValue": "Anders", "confidence": 0.9, "evidence": "B"},
                {"field": "bankAccountBalance", "verdict": "agree", "verifierValue": "10000", "confidence": 0.9, "evidence": "C"},
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"



def test_empty_verdicts_fail_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {"verdicts": []}

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"] == {
        "code": "VERIFIER_RESPONSE_INVALID",
        "fallback": "deterministic_pipeline_and_human_review",
    }


def test_incomplete_verdict_set_fails_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "Naam zichtbaar.",
                }
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_complete_exact_verdict_set_succeeds(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "Naam zichtbaar.",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.99,
                    "evidence": "Totaal zichtbaar.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 200
    assert {row["field"] for row in r.json()["verdicts"]} == {"supplier", "gross"}


def test_missing_verifier_value_property_fails_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "uncertain",
                    "confidence": 0.5,
                    "evidence": "Onduidelijk.",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.99,
                    "evidence": "Totaal zichtbaar.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def _mixed_vat_fields():
    return [
        {
            "field": "mixedRates",
            "parserValue": "true",
            "parserConfidence": 0.99,
            "parserCandidates": ["true"],
        },
        {
            "field": "vatRate",
            "parserValue": None,
            "parserConfidence": 0.99,
            "parserCandidates": [],
        },
        {
            "field": "vatLines",
            "parserValue": '[{"rate":9,"taxableAmount":100,"vatAmount":9},{"rate":21,"taxableAmount":100,"vatAmount":21}]',
            "parserConfidence": 0.99,
            "parserCandidates": [
                '[{"rate":9,"taxableAmount":100,"vatAmount":9},{"rate":21,"taxableAmount":100,"vatAmount":21}]'
            ],
        },
    ]


def test_mixed_vat_single_rate_collapse_attempt_fails_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "mixedRates",
                    "verdict": "agree",
                    "verifierValue": "true",
                    "confidence": 0.99,
                    "evidence": "Twee btw-tarieven zichtbaar.",
                },
                {
                    "field": "vatRate",
                    "verdict": "disagree",
                    "verifierValue": "21",
                    "confidence": 0.99,
                    "evidence": "21% zichtbaar.",
                },
                {
                    "field": "vatLines",
                    "verdict": "agree",
                    "verifierValue": '[{"rate":9,"taxableAmount":100,"vatAmount":9},{"rate":21,"taxableAmount":100,"vatAmount":21}]',
                    "confidence": 0.99,
                    "evidence": "9% en 21% regels zichtbaar.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    body = payload(fields=_mixed_vat_fields())
    r = client.post("/verify", headers=auth(), json=body)
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_legitimate_mixed_vat_keeps_single_rate_empty(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "mixedRates",
                    "verdict": "agree",
                    "verifierValue": "true",
                    "confidence": 0.99,
                    "evidence": "Twee btw-tarieven zichtbaar.",
                },
                {
                    "field": "vatRate",
                    "verdict": "uncertain",
                    "verifierValue": "",
                    "confidence": 0.99,
                    "evidence": "Geen enkel tarief vertegenwoordigt het document.",
                },
                {
                    "field": "vatLines",
                    "verdict": "agree",
                    "verifierValue": '[{"rate":9,"taxableAmount":100,"vatAmount":9},{"rate":21,"taxableAmount":100,"vatAmount":21}]',
                    "confidence": 0.99,
                    "evidence": "9% en 21% regels zichtbaar.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    body = payload(fields=_mixed_vat_fields())
    r = client.post("/verify", headers=auth(), json=body)
    assert r.status_code == 200
    rows = {row["field"]: row for row in r.json()["verdicts"]}
    assert rows["vatRate"]["verdict"] == "uncertain"
    assert rows["vatRate"]["verifierValue"] is None
    assert rows["vatLines"]["verifierValue"].count('"rate"') == 2
    assert r.json()["mayBook"] is False
    assert r.json()["sourceOfTruth"] == "boekuna-deterministic-pipeline"


def test_unknown_model_field_fails_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "A",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.9,
                    "evidence": "B",
                },
                {
                    "field": "bankAccountBalance",
                    "verdict": "agree",
                    "verifierValue": "10000",
                    "confidence": 0.9,
                    "evidence": "C",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_duplicate_model_field_fails_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "A",
                },
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "B",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_invalid_verdict_confidence_and_long_evidence_fail_closed(client, monkeypatch):
    cases = [
        {
            "field": "supplier",
            "verdict": "approved",
            "verifierValue": "Voorbeeld BV",
            "confidence": 0.9,
            "evidence": "A",
        },
        {
            "field": "supplier",
            "verdict": "agree",
            "verifierValue": "Voorbeeld BV",
            "confidence": 1.1,
            "evidence": "A",
        },
        {
            "field": "supplier",
            "verdict": "agree",
            "verifierValue": "Voorbeeld BV",
            "confidence": 0.9,
            "evidence": "x" * 241,
        },
    ]
    for bad_supplier in cases:
        async def fake_backend(_request, row=bad_supplier):
            return {
                "verdicts": [
                    row,
                    {
                        "field": "gross",
                        "verdict": "agree",
                        "verifierValue": "121.00",
                        "confidence": 0.99,
                        "evidence": "Totaal zichtbaar.",
                    },
                ]
            }

        monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
        r = client.post("/verify", headers=auth(), json=payload())
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"
        verifier.reset_runtime_state_for_tests()



def test_missing_and_null_verifier_value_are_distinct_and_fail_closed(client, monkeypatch):
    responses = [
        {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "uncertain",
                    "confidence": 0.5,
                    "evidence": "Ontbrekende property.",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.99,
                    "evidence": "Totaal zichtbaar.",
                },
            ]
        },
        {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "uncertain",
                    "verifierValue": None,
                    "confidence": 0.5,
                    "evidence": "Null is niet toegestaan door het runtime-schema.",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.99,
                    "evidence": "Totaal zichtbaar.",
                },
            ]
        },
    ]
    for response in responses:
        async def fake_backend(_request, body=response):
            return body

        monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
        r = client.post("/verify", headers=auth(), json=payload())
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"
        verifier.reset_runtime_state_for_tests()


def test_model_booking_instruction_properties_fail_closed(client, monkeypatch):
    async def fake_backend(_request):
        return {
            "verdicts": [
                {
                    "field": "supplier",
                    "verdict": "agree",
                    "verifierValue": "Voorbeeld BV",
                    "confidence": 0.9,
                    "evidence": "Naam zichtbaar.",
                    "acceptedValue": "Kwaad BV",
                },
                {
                    "field": "gross",
                    "verdict": "agree",
                    "verifierValue": "121.00",
                    "confidence": 0.99,
                    "evidence": "Totaal zichtbaar.",
                },
            ]
        }

    monkeypatch.setattr(verifier, "query_local_vlm", fake_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_wrong_or_empty_service_secret_fails_closed(client, monkeypatch):
    r = client.post("/verify", headers={"Authorization": "Bearer wrong"}, json=payload())
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "UNAUTHORIZED"

    monkeypatch.setenv("BOOKUNA_DOCUMENT_AI_TOKEN", "")
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "UNAUTHORIZED"


def test_http_500_backend_fails_closed(client, monkeypatch):
    original_client = verifier.httpx.AsyncClient

    def client_factory(**kwargs):
        async def handler(request):
            return httpx.Response(500, json={"error": "backend failed"}, request=request)

        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(verifier.httpx, "AsyncClient", client_factory)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_BACKEND_UNAVAILABLE"
    assert r.json()["detail"]["fallback"] == "deterministic_pipeline_and_human_review"


def test_connection_refused_backend_fails_closed(client, monkeypatch):
    original_client = verifier.httpx.AsyncClient

    def client_factory(**kwargs):
        async def handler(request):
            raise httpx.ConnectError("connection refused", request=request)

        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(verifier.httpx, "AsyncClient", client_factory)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_BACKEND_UNAVAILABLE"


def test_malformed_json_backend_fails_closed(client, monkeypatch):
    original_client = verifier.httpx.AsyncClient

    def client_factory(**kwargs):
        async def handler(request):
            return httpx.Response(200, text="{not-json", request=request)

        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(verifier.httpx, "AsyncClient", client_factory)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_RESPONSE_INVALID"


def test_backend_transport_timeout_maps_to_verifier_timeout(client, monkeypatch):
    original_client = verifier.httpx.AsyncClient

    def client_factory(**kwargs):
        async def handler(request):
            raise httpx.ReadTimeout("timed out", request=request)

        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(verifier.httpx, "AsyncClient", client_factory)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_TIMEOUT"


def test_backend_timeout_fails_closed_without_mutation(client, monkeypatch):
    async def timeout_backend(_request):
        raise verifier.VerifierUnavailable("VERIFIER_TIMEOUT")

    monkeypatch.setattr(verifier, "query_local_vlm", timeout_backend)
    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail["code"] == "VERIFIER_TIMEOUT"
    assert detail["fallback"] == "deterministic_pipeline_and_human_review"


def test_circuit_breaker_opens_after_repeated_failures(client, monkeypatch):
    calls = {"count": 0}

    async def fail_backend(_request):
        calls["count"] += 1
        raise verifier.VerifierUnavailable("VERIFIER_BACKEND_UNAVAILABLE")

    monkeypatch.setattr(verifier, "query_local_vlm", fail_backend)
    for _ in range(verifier.CIRCUIT_FAILURE_THRESHOLD):
        r = client.post("/verify", headers=auth(), json=payload())
        assert r.status_code == 503
    assert calls["count"] == verifier.CIRCUIT_FAILURE_THRESHOLD

    r = client.post("/verify", headers=auth(), json=payload())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "VERIFIER_CIRCUIT_OPEN"
    assert calls["count"] == verifier.CIRCUIT_FAILURE_THRESHOLD


def test_ready_reflects_model_backend_without_blocking_health(client, monkeypatch):
    async def down():
        return False

    monkeypatch.setattr(verifier, "backend_ready", down)
    assert client.get("/health").status_code == 200
    r = client.get("/ready")
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "MODEL_NOT_READY"


def test_ocr_text_and_payload_are_bounded(client):
    too_long = payload(ocrText="x" * 20001)
    r = client.post("/verify", headers=auth(), json=too_long)
    assert r.status_code == 422


def test_no_general_chat_endpoint_exists(client):
    for path in ("/chat", "/v1/chat/completions", "/assistant", "/ask"):
        assert client.post(path, json={"message": "hello"}).status_code == 404


def test_service_source_has_no_shared_app_or_financial_backends():
    source = (ROOT / "app.py").read_text(encoding="utf-8").lower()
    forbidden = [
        "supabase",
        "stripe",
        "psycopg",
        "sqlalchemy",
        "boto3",
        "bank_transactions",
        "billing_entitlements",
    ]
    for token in forbidden:
        assert token not in source, f"document verifier must not depend on {token}"
