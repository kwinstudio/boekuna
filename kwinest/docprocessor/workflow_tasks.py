"""Render execution adapter. The existing app.analyze_document is the only engine."""
import asyncio
import os
import re
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from render import Retry, TaskContext, Workflows

from app import analyze_document, BoekunaDocumentError, MAX_BYTES, PROCESSOR_VERSION, PROCESSOR_REVISION, release_document_memory


workflows = Workflows(default_retry=Retry(max_retries=0), default_timeout=300)
TRANSIENT = {'PROCESSOR_UNAVAILABLE', 'PROCESSING_TIMEOUT', 'RATE_LIMITED', 'NETWORK_ERROR'}


def concurrency(name, default=4):
    try:return max(1, min(16, int(os.environ.get(name, str(default)))))
    except ValueError:return default


class Store:
    def __init__(self):
        self.url = os.environ['SUPABASE_URL'].rstrip('/')
        self.key = os.environ['SUPABASE_SERVICE_ROLE_KEY']

    def call(self, path, body=None, params=None, binary=False):
        response = requests.request('GET' if body is None else 'POST', self.url + path,
            headers={'Authorization': 'Bearer ' + self.key, 'apikey': self.key},
            json=body, params=params, timeout=(10, 60), stream=binary)
        try:
            if response.status_code >= 400:
                # Database exception messages are inspected only for known codes,
                # never emitted or returned with financial/customer content.
                message = response.text if not binary else ''
                known = next((c for c in ('ACCOUNT_READ_ONLY','DOCUMENT_LIMIT_REACHED','JOB_LEASE_INVALID') if c in message), None)
                raise WorkerError(known or ('PROCESSOR_UNAVAILABLE' if response.status_code >= 500 or response.status_code == 429 else 'PERMISSION_DENIED'),
                                  response.status_code >= 500 or response.status_code == 429)
            if not binary:return response.json()
            chunks=[];size=0
            for chunk in response.iter_content(64*1024):
                size+=len(chunk)
                if size>MAX_BYTES:raise WorkerError('DOCUMENT_TOO_LARGE',False)
                chunks.append(chunk)
            return b''.join(chunks)
        finally:response.close()

    def rpc(self, name, **values):
        return self.call('/rest/v1/rpc/' + name, values)


class WorkerError(Exception):
    def __init__(self, code, retryable):
        self.code=code;self.retryable=retryable
        super().__init__(code)


def assessment(data):
    """Respect existing engine review routing, including non-bookable documents."""
    processing=data.get('processing') or {}
    fields=list((processing.get('reviewRouting') or {}).get('fields') or [])
    if processing.get('bookingAllowed') is False:fields.append('documentType')
    if processing.get('anomalyCodes'):fields.append('document')
    if (data.get('amounts') or {}).get('accountingVatTreatment')=='review_required':fields.append('vatTreatment')
    if data.get('warnings') and not fields:fields.append('document')
    return list(dict.fromkeys(fields))


def process_claimed_job(job_id, store=None, engine=analyze_document):
    if not re.fullmatch(r'[0-9a-fA-F-]{36}',str(job_id)):raise ValueError('INVALID_JOB_ID')
    store=store or Store()
    rows=store.rpc('claim_document_workflow_job', p_job_id=job_id,
        p_user_limit=concurrency('DOCUMENT_WORKFLOW_USER_CONCURRENCY'),
        p_global_limit=concurrency('DOCUMENT_WORKFLOW_GLOBAL_CONCURRENCY'))
    if not rows:return {'job_id':job_id,'state':'not_claimed'}
    job=rows[0];lease=job['lease_token']
    try:
        access=store.rpc('document_workflow_access',p_job_id=job_id,p_lease=lease)
        if not access.get('canOperate'):raise WorkerError('ACCOUNT_READ_ONLY',False)
        if not (access.get('quota') or {}).get('allowed'):raise WorkerError('DOCUMENT_LIMIT_REACHED',False)
        docs=store.call('/rest/v1/documents',params={'select':'id,user_id,name,mime_type,storage_path',
            'id':'eq.'+job['document_id'],'user_id':'eq.'+job['user_id'],'limit':1})
        if not docs:raise WorkerError('DOCUMENT_NOT_FOUND',False)
        doc=docs[0];path=doc.get('storage_path') or ''
        # Service-role download must still enforce the job owner's private prefix.
        if not path.startswith(job['user_id']+'/') or any(x in {'.','..',''} for x in path.split('/')):
            raise WorkerError('PERMISSION_DENIED',False)
        raw=store.call('/storage/v1/object/kwinest-documents/'+quote(path,safe='/'),binary=True)
        payload=engine(raw,doc.get('name') or 'document',doc.get('mime_type') or '',
                       job.get('company_context') or {},allow_external_ai=False)
        data=payload['data']
        data.setdefault('processing',{}).update({'processorVersion':PROCESSOR_VERSION,
            'processorRevision':PROCESSOR_REVISION,'executionMode':'workflow','attempt':job['attempt']})
        fields=assessment(data)
        completed=store.rpc('complete_document_workflow_job',p_job_id=job_id,p_lease=lease,
            p_analysis=data,p_review_fields=fields,p_review_message='Controleer de aangegeven documentgegevens.' if fields else '')
        return {'job_id':job_id,'state':('review_required' if fields else 'ready') if completed else 'lease_lost'}
    except (WorkerError,BoekunaDocumentError) as err:
        retryable=err.retryable if isinstance(err,WorkerError) else err.code in TRANSIENT
        store.rpc('fail_document_workflow_job',p_job_id=job_id,p_lease=lease,p_code=err.code,p_retryable=retryable)
        return {'job_id':job_id,'state':'retry_pending' if retryable and job['attempt']<job['max_attempts'] else 'failed'}
    except (requests.Timeout,requests.ConnectionError):
        store.rpc('fail_document_workflow_job',p_job_id=job_id,p_lease=lease,p_code='NETWORK_ERROR',p_retryable=True)
        return {'job_id':job_id,'state':'retry_pending'}
    except Exception:
        store.rpc('fail_document_workflow_job',p_job_id=job_id,p_lease=lease,p_code='UNKNOWN',p_retryable=False)
        return {'job_id':job_id,'state':'failed'}
    finally:release_document_memory()


@workflows.task
def process_document(ctx:TaskContext,job_id:str)->dict:
    return process_claimed_job(job_id)


@workflows.task
async def process_batch(ctx:TaskContext,batch_id:str)->dict:
    # Preserve existing batches, including recovery-generated identifiers.
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,120}',batch_id):raise ValueError('INVALID_BATCH_ID')
    store=Store()
    rows=store.call('/rest/v1/document_processing_jobs',params={'select':'id','batch_id':'eq.'+batch_id,
        'execution_mode':'eq.workflow','state':'eq.queued','order':'created_at.asc','limit':50})
    gate=asyncio.Semaphore(concurrency('DOCUMENT_WORKFLOW_USER_CONCURRENCY'))
    async def one(row):
        async with gate:return await ctx.run(process_document,row['id'])
    results=await asyncio.gather(*(one(row) for row in rows),return_exceptions=True)
    return {'batch_id':batch_id,'dispatched':len(rows),'task_failures':sum(isinstance(r,Exception) for r in results)}


@workflows.task
async def recover_pending(ctx:TaskContext)->dict:
    """Scheduled independently of user sessions; mandatory before enabling mode."""
    store=Store()
    recovered=store.rpc('recover_document_workflow_jobs')
    rows=store.call('/rest/v1/document_processing_jobs',params={'select':'id','execution_mode':'eq.workflow',
        'state':'eq.queued','next_attempt_at':'lte.'+datetime.now(timezone.utc).isoformat(),'order':'created_at.asc','limit':100})
    gate=asyncio.Semaphore(concurrency('DOCUMENT_WORKFLOW_GLOBAL_CONCURRENCY'))
    async def one(row):
        async with gate:return await ctx.run(process_document,row['id'])
    results=await asyncio.gather(*(one(row) for row in rows),return_exceptions=True)
    return {'recovered':recovered,'dispatched':len(rows),'task_failures':sum(isinstance(r,Exception) for r in results)}


if __name__=='__main__':workflows.start()
