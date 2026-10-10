"""Workflow integration on real PostgreSQL 17 + real PostgREST + the real worker/engine.

Not a hosted Render/Supabase run. What is real: every repository migration replayed in
order (access/quota functions byte-identical to production), PostgREST HTTP/RPC, the
unchanged workflow_tasks.process_batch/recover_pending/process_claimed_job bodies and
the existing analyze_document engine on synthetic PDFs. What is emulated: the Storage
object endpoint, Render task fan-out (threads), worker crashes, network faults and the
passage of the 10-minute lease (lease_expires_at moved into the past).

Usage: python tests/document-workflow-integration.py <superuser postgres url> <postgrest binary>
Writes a JSON report to $BOOKUNA_WORKFLOW_REPORT when set.
"""
import asyncio
import json
import os
import random
import secrets
import statistics
import subprocess
import sys
import threading
import time
import types
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

import fitz
import jwt
import psycopg
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'kwinest/docprocessor'))
try:
    import render  # noqa: F401  (CI installs the pinned SDK)
except ImportError:
    class _Workflows:
        def __init__(self, **kw): pass
        def task(self, fn): return types.SimpleNamespace(func=fn, name=fn.__name__)
    class _Retry:
        def __init__(self, **kw): pass
    sys.modules['render'] = types.SimpleNamespace(Workflows=_Workflows, Retry=_Retry, TaskContext=object)
import workflow_tasks as w  # noqa: E402

try:
    import resource
except ImportError:
    resource = None

ADMIN_URL, POSTGREST = sys.argv[1], sys.argv[2]
DB = 'boekuna_workflow_it_' + secrets.token_hex(4)
SECRET = secrets.token_hex(32)
SERVICE_KEY = jwt.encode({'role': 'service_role', 'iss': 'supabase'}, SECRET, algorithm='HS256')
REST_PORT, GATEWAY_PORT = 39001, 39000
STORAGE = {}
FAULTS = {'storage_5xx': 0.0, 'rpc_5xx': 0.0, 'complete_lost_response': 0.0}
FAULT_LOG = {'storage_5xx': 0, 'rpc_5xx': 0, 'complete_lost_response': 0, 'crash': 0}
FAULT_LOCK = threading.Lock()


def db_url(name):
    u = urlparse(ADMIN_URL)
    return u._replace(path='/' + name).geturl()


def sql(query, params=None, fetch=True):
    with psycopg.connect(db_url(DB), autocommit=True) as c:
        cur = c.execute(query, params or ())
        return cur.fetchall() if fetch and cur.description else None


def fault(kind):
    with FAULT_LOCK:
        if random.random() < FAULTS[kind]:
            FAULT_LOG[kind] += 1
            return True
    return False


class Gateway(BaseHTTPRequestHandler):
    """Routes /rest/v1 to PostgREST and serves private Storage objects."""
    def log_message(self, *a): pass

    def _send(self, status, body=b'', ctype='application/json'):
        self.send_response(status); self.send_header('content-type', ctype)
        self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def _proxy(self, method):
        body = self.rfile.read(int(self.headers.get('content-length') or 0)) if method == 'POST' else None
        if self.path.startswith('/storage/v1/object/kwinest-documents/'):
            if self.headers.get('authorization') != 'Bearer ' + SERVICE_KEY: return self._send(401)
            if fault('storage_5xx'): return self._send(503, b'{}')
            key = unquote(self.path.split('/storage/v1/object/kwinest-documents/', 1)[1])
            raw = STORAGE.get(key)
            return self._send(200, raw, 'application/pdf') if raw is not None else self._send(404, b'{}')
        if not self.path.startswith('/rest/v1/'): return self._send(404)
        if '/rpc/' in self.path and fault('rpc_5xx'): return self._send(503, b'{}')
        headers = {k: v for k, v in self.headers.items() if k.lower() in ('authorization', 'content-type', 'accept', 'prefer')}
        r = requests.request(method, f'http://127.0.0.1:{REST_PORT}' + self.path[len('/rest/v1'):], headers=headers, data=body, timeout=60)
        if self.path.startswith('/rest/v1/rpc/complete_document_workflow_job') and r.status_code == 200 and fault('complete_lost_response'):
            return self._send(503, b'{}')  # committed, but the worker never sees the answer
        self._send(r.status_code, r.content, r.headers.get('content-type', 'application/json'))

    def do_GET(self): self._proxy('GET')
    def do_POST(self): self._proxy('POST')


def make_pdf(invoice_no, amount):
    doc = fitz.open(); page = doc.new_page()
    vat = round(amount * 0.21, 2)
    text = (f'FACTUUR\nLeverancier: Synthetische Leverancier BV\nKvK: 74542893\nFactuurnummer: {invoice_no}\n'
            f'Factuurdatum: 07-10-2026\nSubtotaal EUR {amount:.2f}\nBTW 21% EUR {vat:.2f}\nTotaal EUR {amount + vat:.2f}').replace('.', ',')
    page.insert_text((40, 40), text)
    raw = doc.tobytes(); doc.close(); return raw


def setup():
    with psycopg.connect(ADMIN_URL, autocommit=True) as c:
        c.execute(f"create database {DB} encoding 'UTF8' template template0")
    subprocess.run(['bash', str(ROOT / 'tests/fixtures/replay-migrations.sh'), db_url(DB)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pw = secrets.token_hex(12)
    sql(f"alter role authenticator with login password '{pw}'", fetch=False)
    sql("create table public.it_completion_audit(job_id uuid, state text, at timestamptz default now())", fetch=False)
    sql("""create function public.it_audit() returns trigger language plpgsql as $$ begin
             if new.state in ('ready','review_required') and old.state not in ('ready','review_required') then
               insert into public.it_completion_audit(job_id,state) values(new.id,new.state); end if; return new; end $$""", fetch=False)
    sql("create trigger it_audit after update on public.document_processing_jobs for each row execute function public.it_audit()", fetch=False)
    u = urlparse(ADMIN_URL)
    host = (dict(x.split('=') for x in u.query.split('&') if x).get('host') if u.query else None) or u.hostname or 'localhost'
    port = (dict(x.split('=') for x in u.query.split('&') if x).get('port') if u.query else None) or u.port or 5432
    env = dict(os.environ, PGRST_DB_URI=f'postgresql://authenticator:{pw}@/{DB}?host={host}&port={port}',
               PGRST_DB_SCHEMAS='public', PGRST_DB_ANON_ROLE='anon', PGRST_JWT_SECRET=SECRET,
               PGRST_SERVER_PORT=str(REST_PORT), PGRST_SERVER_HOST='127.0.0.1', PGRST_DB_POOL='20', PGRST_LOG_LEVEL='error')
    proc = subprocess.Popen([POSTGREST], env=env, stdout=subprocess.DEVNULL, stderr=open(os.environ.get("BOOKUNA_POSTGREST_LOG", os.devnull), "w"))
    for _ in range(100):
        try:
            if requests.get(f'http://127.0.0.1:{REST_PORT}/', timeout=1).status_code < 500: break
        except requests.RequestException: time.sleep(0.1)
    server = ThreadingHTTPServer(('127.0.0.1', GATEWAY_PORT), Gateway)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    os.environ.update(SUPABASE_URL=f'http://127.0.0.1:{GATEWAY_PORT}', SUPABASE_SERVICE_ROLE_KEY=SERVICE_KEY,
                      DOCUMENT_WORKFLOW_USER_CONCURRENCY='4', DOCUMENT_WORKFLOW_GLOBAL_CONCURRENCY='4')
    return proc, server


def user(plan=None):
    uid = str(uuid.uuid4())
    sql('insert into auth.users(id,email) values(%s,%s)', (uid, uid[:8] + '@synthetic.invalid'), fetch=False)
    if plan: sql("insert into public.internal_access_grants(user_id,plan,reason) values(%s,%s,'integration')", (uid, plan), fetch=False)
    return uid


def enqueue(uid, n, batch=None):
    batch = batch or 'it-' + uuid.uuid4().hex[:12]; jobs = []
    for i in range(n):
        doc, job = str(uuid.uuid4()), str(uuid.uuid4())
        # The extractor only accepts an invoice number that contains a digit (a pure-letter
        # token is a word, not a number); a random hex prefix without digits made this flaky.
        number = 'IT-' + doc[:7].upper() + '7'
        path = f'{uid}/{doc}.pdf'; STORAGE[path] = make_pdf(number, 100 + i)
        sql('insert into public.documents(id,user_id,name,mime_type,storage_path,client_ref) values(%s,%s,%s,%s,%s,%s)',
            (doc, uid, number + '.pdf', 'application/pdf', path, doc), fetch=False)
        sql("""insert into public.document_processing_jobs(id,user_id,document_id,client_ref,batch_id,file_name,mime_type,execution_mode,state,phase)
               values(%s,%s,%s,%s,%s,%s,'application/pdf','workflow','queued','queued')""", (job, uid, doc, doc, batch, number + '.pdf'), fetch=False)
        jobs.append((job, number))
    return batch, jobs


CRASH = {'rate': 0.0}
PROCESS_MS = []


def engine(*args, **kwargs):
    if random.random() < CRASH['rate']:
        with FAULT_LOCK: FAULT_LOG['crash'] += 1
        raise SystemExit('simulated worker crash')  # not caught by the worker: lease is left behind
    t = time.perf_counter()
    try: return w.analyze_document(*args, **kwargs)
    finally: PROCESS_MS.append((time.perf_counter() - t) * 1000)


class Ctx:
    """Render ctx.run emulation: each subtask runs on its own thread (task compute)."""
    async def run(self, task, *args):
        def body():
            try: return w.process_claimed_job(*args, engine=engine)
            except SystemExit as crash: return {'state': 'crashed'}
        return await asyncio.to_thread(body)


def batch(batch_id): return asyncio.run(w.process_batch.func(Ctx(), batch_id))
def recover(): return asyncio.run(w.recover_pending.func(Ctx()))


class Sampler(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True); self.peak = 0; self.peak_user = 0; self.stop = False
    def run(self):
        while not self.stop:
            rows = sql("select user_id,count(*) from document_processing_jobs where state in ('processing','validating') group by user_id")
            self.peak = max(self.peak, sum(r[1] for r in rows)); self.peak_user = max([self.peak_user] + [r[1] for r in rows])
            time.sleep(0.02)


def expire_leases():
    # Emulates 10 minutes passing for crashed/abandoned attempts.
    sql("update document_processing_jobs set lease_expires_at=now()-interval '1 second' where state='processing'", fetch=False)


def release_backoff():
    sql("update document_processing_jobs set next_attempt_at=now() where state='queued' and next_attempt_at>now()", fetch=False)


def drain(max_rounds=40):
    for _ in range(max_rounds):
        if not sql("select 1 from document_processing_jobs where state not in ('ready','review_required','failed') limit 1"): return
        expire_leases(); release_backoff()
        try: recover()
        except w.WorkerError: pass  # an injected 5xx on the scheduled run; the next tick retries
    raise AssertionError('jobs did not reach a terminal state')


def check_invariants(scenario, jobs_by_user, expect_failed_codes=frozenset(), prior_usage=None):
    ids = [j for jobs in jobs_by_user.values() for j, _ in jobs]
    rows = sql("""select j.id::text,j.user_id::text,j.state,j.error_code,j.result->'analysis'->'invoice'->>'invoiceNumber',
                         j.usage_recorded_at is not null,j.attempt,j.lease_token,
                         (extract(epoch from (j.started_at-j.created_at))*1000)::float8
                  from document_processing_jobs j where j.id=any(%s::uuid[])""", (ids,))
    assert len(rows) == len(ids), 'lost jobs'
    expected = {j: (u, n) for u, jobs in jobs_by_user.items() for j, n in jobs}
    states = {}
    for jid, uid, state, code, number, used, attempt, lease, _ in rows:
        states[state] = states.get(state, 0) + 1
        assert state in ('ready', 'review_required', 'failed'), (scenario, jid, state)
        assert lease is None, 'terminal job kept a lease'
        assert uid == expected[jid][0], 'tenant mismatch'
        if state != 'failed':
            assert number == expected[jid][1], ('result belongs to another document', number, expected[jid][1])
            assert used, 'completed without usage'
        else:
            assert code in expect_failed_codes, (scenario, code)
            assert not used, 'failed job consumed usage'
    audit = sql('select job_id::text,count(*) from it_completion_audit where job_id=any(%s::uuid[]) group by 1 having count(*)>1', (ids,))
    assert not audit, ('job completed more than once', audit)
    for uid in jobs_by_user:
        usage = sql("select coalesce(sum(usage_count),0) from billing_usage_monthly where user_id=%s and feature='smart_document'", (uid,))[0][0]
        recorded = sql('select count(*) from document_processing_jobs where user_id=%s and usage_recorded_at is not null', (uid,))[0][0]
        assert usage == recorded + (prior_usage or {}).get(uid, 0), ('usage differs from completed jobs', usage, recorded)
    attempts = [r[6] for r in rows]
    return {'states': states, 'retries': sum(a - 1 for a in attempts if a > 1), 'queueDelayMs': [r[8] for r in rows if r[8] is not None]}


def pct(values, p):
    if not values: return None
    s = sorted(values); return round(s[min(len(s) - 1, int(round((p / 100) * (len(s) - 1))))], 1)


def main():
    proc, server = setup()
    try:
        report = {'scenarios': [], 'migrationReplay': 'all repository migrations, PostgreSQL ' + sql('show server_version')[0][0],
                  'postgrest': subprocess.run([POSTGREST, '--version'], capture_output=True, text=True).stdout.strip()}
        pro = user('pro')
        # Warm the existing engine once (cold start is reported separately).
        t = time.perf_counter(); w.analyze_document(make_pdf('WARM-1', 1), 'warm.pdf', 'application/pdf', {}, allow_external_ai=False)
        report['engineColdStartMs'] = round((time.perf_counter() - t) * 1000, 1)
        for n in (1, 10, 50):
            PROCESS_MS.clear(); b, jobs = enqueue(pro, n); sampler = Sampler(); sampler.start()
            t = time.perf_counter(); batch(b); drain(); elapsed = (time.perf_counter() - t) * 1000
            sampler.stop = True; sampler.join()
            inv = check_invariants(f'{n} documents', {pro: jobs})
            assert sampler.peak <= 4
            report['scenarios'].append({'scenario': f'{n} documents, one user, one dispatch', 'documents': n, 'batchCompletionMs': round(elapsed),
                'processP50Ms': pct(PROCESS_MS, 50), 'processP95Ms': pct(PROCESS_MS, 95), 'queueDelayP50Ms': pct(inv['queueDelayMs'], 50),
                'queueDelayP95Ms': pct(inv['queueDelayMs'], 95), 'peakActive': sampler.peak, **{k: inv[k] for k in ('states', 'retries')}})

        # Several users at once, duplicate dispatch of every batch and a concurrent recovery loop.
        PROCESS_MS.clear(); users = {user('pro'): 15, user('boekuna'): 15, user('pro'): 15}
        batches = {u: enqueue(u, n) for u, n in users.items()}
        sampler = Sampler(); sampler.start(); t = time.perf_counter()
        with ThreadPoolExecutor(8) as pool:
            futures = [pool.submit(batch, b) for b, _ in batches.values()] + [pool.submit(batch, b) for b, _ in batches.values()]
            futures.append(pool.submit(recover))
            for f in futures: f.result()
        drain(); elapsed = (time.perf_counter() - t) * 1000; sampler.stop = True; sampler.join()
        inv = check_invariants('multi-user', {u: j for u, (_, j) in batches.items()})
        assert sampler.peak <= 4 and sampler.peak_user <= 4
        report['scenarios'].append({'scenario': '3 users x 15 documents, every batch dispatched twice, concurrent recovery', 'documents': 45,
            'batchCompletionMs': round(elapsed), 'processP50Ms': pct(PROCESS_MS, 50), 'processP95Ms': pct(PROCESS_MS, 95),
            'queueDelayP95Ms': pct(inv['queueDelayMs'], 95), 'peakActive': sampler.peak, 'peakActivePerUser': sampler.peak_user,
            **{k: inv[k] for k in ('states', 'retries')}})

        # Provider/network faults, lost completion responses and worker crashes.
        random.seed(20261007); FAULTS.update(storage_5xx=0.15, rpc_5xx=0.05, complete_lost_response=0.10); CRASH['rate'] = 0.10
        before = dict(FAULT_LOG); fu = user('pro'); b, jobs = enqueue(fu, 30)
        batch(b); drain(); FAULTS.update(storage_5xx=0, rpc_5xx=0, complete_lost_response=0); CRASH['rate'] = 0
        inv = check_invariants('faults', {fu: jobs}, {'PROCESSOR_UNAVAILABLE', 'PROCESSING_TIMEOUT', 'NETWORK_ERROR'})
        report['scenarios'].append({'scenario': '30 documents with 15% storage 5xx, 5% RPC 5xx, 10% lost completion responses, 10% worker crashes',
            'documents': 30, 'injected': {k: FAULT_LOG[k] - before[k] for k in FAULT_LOG}, **{k: inv[k] for k in ('states', 'retries')}})

        # Browser closed before dispatch: only the scheduled recovery exists.
        ru = user('pro'); _, jobs = enqueue(ru, 5); recover(); drain()
        inv = check_invariants('no browser', {ru: jobs})
        report['scenarios'].append({'scenario': 'browser closed before dispatch; scheduled recovery only', 'documents': 5, **{k: inv[k] for k in ('states', 'retries')}})

        # Free plan (production limit 10) with 12 documents: exactly 10 consume usage.
        fr = user(None); b, jobs = enqueue(fr, 12); batch(b); drain()
        inv = check_invariants('quota', {fr: jobs}, {'DOCUMENT_LIMIT_REACHED'})
        assert inv['states'].get('failed') == 2, inv
        used = sql("select usage_count from billing_usage_monthly where user_id=%s", (fr,))[0][0]
        assert used == 10, used
        report['scenarios'].append({'scenario': 'free plan (limit 10) with 12 documents', 'documents': 12, 'usage': used, **{k: inv[k] for k in ('states', 'retries')}})

        # Access changes during processing: pro grant removed after claim, before completion.
        du = user('pro'); sql("insert into billing_usage_monthly(user_id,month_start,feature,usage_count) values(%s,date_trunc('month',now())::date,'smart_document',10)", (du,), fetch=False)
        b, jobs = enqueue(du, 1); job_id = jobs[0][0]
        claimed = w.Store().rpc('claim_document_workflow_job', p_job_id=job_id, p_user_limit=4, p_global_limit=4)[0]
        sql('delete from internal_access_grants where user_id=%s', (du,), fetch=False)
        ok = None
        try: ok = w.Store().rpc('complete_document_workflow_job', p_job_id=job_id, p_lease=claimed['lease_token'], p_analysis={'documentType': 'purchase_invoice'}, p_review_fields=[], p_review_message='')
        except w.WorkerError as e: ok = e.code
        assert ok == 'DOCUMENT_LIMIT_REACHED', ok
        state = sql('select state,usage_recorded_at is null from document_processing_jobs where id=%s', (job_id,))[0]
        assert state == ('processing', True), state
        expire_leases(); drain(); inv = check_invariants('downgrade', {du: jobs}, {'DOCUMENT_LIMIT_REACHED'}, {du: 10})
        report['scenarios'].append({'scenario': 'plan downgraded during processing (pro to free at 10/10)', 'documents': 1,
            'completionRejected': ok, **{k: inv[k] for k in ('states', 'retries')}})

        # Edge repairMissingJobs relation: documents with no job via PostgREST anti-join embed.
        eu = user('pro'); _, jobs = enqueue(eu, 1); orphan = str(uuid.uuid4())
        sql('''insert into public.documents(id,user_id,name,mime_type,storage_path,client_ref,metadata)
               values(%s,%s,'orphan.pdf','application/pdf',%s,%s,'{"processing":true}')''', (orphan, eu, f'{eu}/{orphan}.pdf', orphan), fetch=False)
        sql("update public.documents set metadata='{\"processing\":true}' where user_id=%s", (eu,), fetch=False)
        r = requests.get(f'http://127.0.0.1:{REST_PORT}/documents', headers={'Authorization': 'Bearer ' + SERVICE_KEY},
            params={'select': 'id,document_processing_jobs(id)', 'user_id': 'eq.' + eu, 'metadata': 'cs.{"processing":true}', 'document_processing_jobs': 'is.null'})
        assert r.status_code == 200 and [d['id'] for d in r.json()] == [orphan], (r.status_code, r.text[:200])
        report['edgeRepairEmbed'] = 'documents without a job selected via PostgREST anti-join'

        # Direct API: anon/authenticated tokens cannot call workflow RPCs through PostgREST.
        for role in ('anon', 'authenticated'):
            token = jwt.encode({'role': role, 'sub': pro}, SECRET, algorithm='HS256')
            r = requests.post(f'http://127.0.0.1:{REST_PORT}/rpc/recover_document_workflow_jobs', headers={'Authorization': 'Bearer ' + token}, json={})
            assert r.status_code in (401, 403, 404), (role, r.status_code)
        report['rpcPrivileges'] = 'anon/authenticated denied via PostgREST'
        report['peakRssMb'] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1) if resource else None
        report['result'] = 'PASS'
    finally:
        server.shutdown(); proc.terminate(); proc.wait()
        with psycopg.connect(ADMIN_URL, autocommit=True) as c:
            c.execute(f'drop database if exists {DB} with (force)')
    print(json.dumps(report, indent=1))
    if os.getenv('BOOKUNA_WORKFLOW_REPORT'):
        Path(os.environ['BOOKUNA_WORKFLOW_REPORT']).write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
