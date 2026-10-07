"""Worker/engine contract tests. Hosted Render registration is a separate gate."""
import asyncio
import io
import sys
import types
import uuid
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'kwinest/docprocessor'))
import app as p

try:
    import render
except ImportError:
    # No SDK is installed locally: isolate task orchestration, without claiming
    # provider registration or a real task run. CI installs the pinned real SDK.
    class Workflows:
        def __init__(self,**kwargs):self.defaults=kwargs
        def task(self,fn):return fn
    sys.modules['render']=types.SimpleNamespace(Workflows=Workflows,Retry=lambda **kwargs:kwargs,TaskContext=object)
import workflow_tasks as w


def pdf():
    doc=fitz.open();page=doc.new_page()
    page.insert_text((40,40),'FACTUUR\nLeverancier: Test BV\nFactuurnummer: QA-2026-1\nFactuurdatum: 07-10-2026\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    raw=doc.tobytes();doc.close();return raw


def test_http_and_workflow_use_exact_same_engine(monkeypatch):
    monkeypatch.setattr(p,'require_authenticated_user',lambda req:{'id':'test-user'})
    monkeypatch.setattr(p,'allow_request',lambda *args:True)
    monkeypatch.setattr(p,'rpc_access_check',lambda req:True)
    monkeypatch.setattr(p,'billing_quota_status',lambda req:{'allowed':True})
    monkeypatch.setattr(p,'record_billing_usage',lambda req:None)
    monkeypatch.setattr(p,'EXTERNAL_AI_ENABLED',False)
    direct=p.analyze_document(pdf(),'fixture.pdf','application/pdf',{},allow_external_ai=False)
    with TestClient(p.app) as client:
        response=client.post('/analyze',headers={'Origin':'https://app.boekuna.nl'},files={'file':('fixture.pdf',pdf(),'application/pdf')})
    assert response.status_code==200,response.text
    http=response.json()
    for result in (http,direct):result['data']['processing'].pop('durationMs',None)
    assert http==direct


class Store:
    def __init__(self,path=None,allowed=True):
        self.job={'id':str(uuid.uuid4()),'user_id':str(uuid.uuid4()),'document_id':str(uuid.uuid4()),
            'lease_token':str(uuid.uuid4()),'attempt':1,'max_attempts':3,'company_context':{}}
        self.path=path;self.allowed=allowed;self.calls=[];self.downloads=0
    def rpc(self,name,**params):
        self.calls.append((name,params))
        if name=='claim_document_workflow_job':return [self.job]
        if name=='document_workflow_access':return {'canOperate':self.allowed,'quota':{'allowed':True}}
        return True
    def call(self,path,**params):
        if path=='/rest/v1/documents':
            assert params['params']['user_id']=='eq.'+self.job['user_id']
            return [{'id':self.job['document_id'],'user_id':self.job['user_id'],'storage_path':self.path or self.job['user_id']+'/test.pdf','name':'test.pdf','mime_type':'application/pdf'}]
        self.downloads+=1;return pdf()


def test_worker_persists_result_and_returns_identifiers_only():
    store=Store();r=w.process_claimed_job(store.job['id'],store)
    assert r['state'] in {'ready','review_required'}
    assert set(r)=={'job_id','state'}
    name,params=store.calls[-1]
    assert name=='complete_document_workflow_job'
    assert params['p_analysis']['invoice']['invoiceNumber']=='QA-2026-1'
    assert params['p_lease']==store.job['lease_token']


@pytest.mark.parametrize('path',['another-tenant/test.pdf','../test.pdf','owner/../test.pdf'])
def test_cross_tenant_storage_is_denied_before_download(path):
    store=Store(path=path);r=w.process_claimed_job(store.job['id'],store)
    assert r['state']=='failed';assert store.downloads==0
    assert store.calls[-1][1]['p_code']=='PERMISSION_DENIED'


def test_read_only_owner_is_denied_before_download():
    store=Store(allowed=False);assert w.process_claimed_job(store.job['id'],store)['state']=='failed'
    assert store.downloads==0


def test_transient_has_one_db_retry_owner():
    store=Store()
    def timeout(*args,**kwargs):raise w.requests.Timeout()
    assert w.process_claimed_job(store.job['id'],store,timeout)['state']=='retry_pending'
    assert store.calls[-1][1]['p_retryable'] is True


def test_corrupt_is_permanent():
    store=Store()
    def corrupt(*args,**kwargs):raise p.BoekunaDocumentError('FILE_CORRUPT',status=422)
    assert w.process_claimed_job(store.job['id'],store,corrupt)['state']=='failed'
    assert store.calls[-1][1]['p_retryable'] is False


def test_non_bookable_and_metadata_conflicts_are_reviewed():
    assert w.assessment({'processing':{'bookingAllowed':False}})==['documentType']
    assert 'document' in w.assessment({'processing':{'anomalyCodes':['COMPETING_INVOICE_NUMBERS']}})


def test_workflow_external_ai_is_effectively_disabled_even_if_server_flag_is_enabled(monkeypatch):
    monkeypatch.setattr(p,'EXTERNAL_AI_ENABLED',True)
    result=p.analyze_document(pdf(),'synthetic.pdf','application/pdf',{},allow_external_ai=False)
    assert result['data']['processing']['externalAiEnabled'] is False
    assert result['data']['processing']['aiStatus'] != 'used'
