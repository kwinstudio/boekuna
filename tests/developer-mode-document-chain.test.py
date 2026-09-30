import sys
from pathlib import Path

from fastapi import Request

ROOT=Path(__file__).resolve().parents[1]
PROCESSOR_DIR=ROOT/"kwinest"/"docprocessor"
sys.path.insert(0,str(PROCESSOR_DIR))

import app as processor  # noqa: E402


USER_TOKEN="Bearer user-a-jwt"
DEV_TOKEN="dev-ticket-"+"a"*48
PREVIEW_ORIGIN="https://boekuna-qa-staging.onrender.com"


def request():
    headers=[
        (b"authorization",USER_TOKEN.encode()),
        (b"x-boekuna-dev-session",DEV_TOKEN.encode()),
        (b"origin",PREVIEW_ORIGIN.encode()),
    ]
    scope={
        "type":"http","http_version":"1.1","method":"POST","scheme":"https",
        "path":"/analyze","raw_path":b"/analyze","query_string":b"",
        "headers":headers,"client":("127.0.0.1",12345),"server":("processor.test",443),
    }
    return Request(scope)


class FakeResponse:
    def __init__(self,status_code,payload):
        self.status_code=status_code
        self._payload=payload

    def json(self):
        return self._payload


def with_processor_config():
    return processor.SUPABASE_URL,processor.SUPABASE_PUBLISHABLE_KEY


def restore_processor_config(previous):
    processor.SUPABASE_URL,processor.SUPABASE_PUBLISHABLE_KEY=previous


def test_valid_developer_quota_never_calls_normal_quota():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append((url,dict(headers or {})))
        assert url.endswith("/rpc/check_developer_document_quota")
        assert headers["X-Boekuna-Dev-Session"]==DEV_TOKEN
        assert headers["Origin"]==PREVIEW_ORIGIN
        return FakeResponse(200,[{"allowed":True,"plan":"pro","monthly_limit":None,"used":0,"remaining":None}])

    processor.requests.post=fake_post
    try:
        result=processor.billing_quota_status(request())
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert result["allowed"] is True
    assert result["plan"]=="pro"
    assert len(calls)==1
    assert all("check_document_quota" not in url.replace("check_developer_document_quota","") for url,_ in calls)


def test_revoked_or_expired_developer_quota_falls_back_to_normal_authority():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append(url)
        if url.endswith("/rpc/check_developer_document_quota"):
            return FakeResponse(400,{"message":"DEVELOPER_MODE_DISABLED"})
        if url.endswith("/rpc/check_document_quota"):
            return FakeResponse(200,[{"allowed":True,"plan":"free","monthly_limit":10,"used":2,"remaining":8}])
        raise AssertionError(url)

    processor.requests.post=fake_post
    try:
        result=processor.billing_quota_status(request())
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert result["plan"]=="free"
    assert calls==[
        "https://preview.supabase.co/rest/v1/rpc/check_developer_document_quota",
        "https://preview.supabase.co/rest/v1/rpc/check_document_quota",
    ]


def test_transient_developer_quota_failure_does_not_silently_consume_normal_quota():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append(url)
        return FakeResponse(503,{"message":"temporary database failure"})

    processor.requests.post=fake_post
    try:
        try:
            processor.billing_quota_status(request())
            raise AssertionError("Expected developer quota failure")
        except processor.BoekunaDocumentError:
            pass
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert calls==["https://preview.supabase.co/rest/v1/rpc/check_developer_document_quota"]


def test_valid_developer_usage_never_calls_normal_usage():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append(url)
        assert url.endswith("/rpc/record_developer_document_usage")
        return FakeResponse(200,[{"plan":"pro","monthly_limit":None,"used":0,"remaining":None}])

    processor.requests.post=fake_post
    try:
        result=processor.record_billing_usage(request())
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert result["plan"]=="pro"
    assert calls==["https://preview.supabase.co/rest/v1/rpc/record_developer_document_usage"]


def test_revoked_developer_usage_uses_normal_usage_route():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append(url)
        if url.endswith("/rpc/record_developer_document_usage"):
            return FakeResponse(400,{"message":"DEVELOPER_MODE_DISABLED"})
        if url.endswith("/rpc/record_document_usage"):
            return FakeResponse(200,[{"plan":"free","monthly_limit":10,"used":3,"remaining":7}])
        raise AssertionError(url)

    processor.requests.post=fake_post
    try:
        result=processor.record_billing_usage(request())
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert result["plan"]=="free"
    assert calls==[
        "https://preview.supabase.co/rest/v1/rpc/record_developer_document_usage",
        "https://preview.supabase.co/rest/v1/rpc/record_document_usage",
    ]


def test_transient_developer_usage_failure_never_calls_normal_usage():
    previous=with_processor_config()
    original_post=processor.requests.post
    calls=[]
    processor.SUPABASE_URL="https://preview.supabase.co"
    processor.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"

    def fake_post(url,headers=None,json=None,timeout=None):
        calls.append(url)
        return FakeResponse(503,{"message":"temporary database failure"})

    processor.requests.post=fake_post
    try:
        result=processor.record_billing_usage(request())
    finally:
        processor.requests.post=original_post
        restore_processor_config(previous)

    assert result is None
    assert calls==["https://preview.supabase.co/rest/v1/rpc/record_developer_document_usage"]


if __name__ == "__main__":
    tests=[
        test_valid_developer_quota_never_calls_normal_quota,
        test_revoked_or_expired_developer_quota_falls_back_to_normal_authority,
        test_transient_developer_quota_failure_does_not_silently_consume_normal_quota,
        test_valid_developer_usage_never_calls_normal_usage,
        test_revoked_developer_usage_uses_normal_usage_route,
        test_transient_developer_usage_failure_never_calls_normal_usage,
    ]
    for test in tests:
        test()
    print("BOEKUNA Developer Mode document quota/usage routing: PASS")
