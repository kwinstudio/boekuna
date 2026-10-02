"""Real ASGI/CORS and decoding/OCR; only the external Supabase transport is simulated.

These regressions are not authenticated production release evidence.
"""
import io
import os
import runpy
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'kwinest/docprocessor'))
import app as processor

ORIGIN = 'https://app.boekuna.nl'
helpers = runpy.run_path(str(ROOT / 'tests/document-processor-pdf.test.py'))

def test_env_contract():
    for env in [{}, {'APP_ORIGINS':'https://boekuna-render-link-qa.onrender.com/'}, {'APP_ORIGIN':'https://boekuna.nl/'}]:
        values = {k:v for k,v in os.environ.items() if k not in {'APP_ORIGIN','APP_ORIGINS'}} | env
        child = subprocess.run([sys.executable,'-c',"import app; assert 'https://app.boekuna.nl' in app.ALLOWED_ORIGINS; assert '*' not in app.ALLOWED_ORIGINS; assert not any('*' in x for x in app.ALLOWED_ORIGINS)"], cwd=ROOT/'kwinest/docprocessor',env=values,capture_output=True)
        assert child.returncode == 0, child.stderr.decode()
    for invalid in ['*','https://*.onrender.com','https://boekuna.nl/path']:
        values = dict(os.environ,APP_ORIGINS=invalid)
        child = subprocess.run([sys.executable,'-c','import app'],cwd=ROOT/'kwinest/docprocessor',env=values,capture_output=True)
        assert child.returncode != 0, f'Unsafe env origin must fail closed: {invalid}'

def test_http_processing():
    class Response:
        status_code = 200
        def __init__(self, data): self.data=data
        def json(self): return self.data
    def auth_get(url, **kwargs):
        assert url.endswith('/auth/v1/user')
        assert kwargs['headers']['Authorization']=='Bearer regression-token'
        return Response({'id':'origin-regression-user'})
    def rpc_post(url, **kwargs):
        assert kwargs['headers']['Authorization']=='Bearer regression-token'
        if url.endswith('/can_operate_bookkeeping'): return Response(True)
        if url.endswith('/check_document_quota'): return Response({'allowed':True})
        if url.endswith('/record_document_usage'): return Response({'used':1})
        raise AssertionError(url)
    client=TestClient(processor.app)
    headers={'Origin':ORIGIN,'Authorization':'Bearer regression-token'}
    preflight=client.options('/analyze',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,x-boekuna-processing-job'})
    assert preflight.status_code==200
    assert preflight.headers['access-control-allow-origin']==ORIGIN
    rejected=client.post('/analyze',headers={'Origin':'https://unknown.example'},files={'file':('qa.pdf',b'x','application/pdf')})
    assert rejected.status_code==403
    assert rejected.json()['error']['code']=='PERMISSION_DENIED'
    assert 'access-control-allow-origin' not in rejected.headers
    no_auth=client.post('/analyze',headers={'Origin':ORIGIN},files={'file':('qa.pdf',b'x','application/pdf')})
    assert no_auth.status_code==401
    digital=helpers['vector_pdf'](helpers['invoice_lines']())
    scanned=helpers['scanned_pdf'](helpers['invoice_lines']())
    with processor.fitz.open(stream=scanned,filetype='pdf') as pdf:
        png=pdf[0].get_pixmap(matrix=processor.fitz.Matrix(2,2)).tobytes('png')
    with Image.open(io.BytesIO(png)) as img:
        jpg=io.BytesIO();img.convert('RGB').save(jpg,format='JPEG',quality=95)
    files=[('qa.jpg','image/jpeg',jpg.getvalue(),True),('qa.png','image/png',png,True),('qa.pdf','application/pdf',digital,False),('scan.pdf','application/pdf',scanned,True)]
    files.append(('qa.heic','image/heic',(ROOT/'tests/fixtures/scan-invoice.heic').read_bytes(),True))
    files.append(('qa.heif','image/heif',files[-1][2],True))
    with patch.object(processor,'SUPABASE_PUBLISHABLE_KEY','regression-key'),patch.object(processor.requests,'get',auth_get),patch.object(processor.requests,'post',rpc_post):
        for name,mime,raw,ocr in files:
            response=client.post('/analyze',headers=headers,files={'file':(name,raw,mime)})
            assert response.status_code==200,(name,response.text)
            assert response.headers['access-control-allow-origin']==ORIGIN
            result=processor.ExtractionResult.model_validate(response.json()['data'])
            helpers['assert_core_fields'](result,number='INV-2026-1001')
            assert bool(result.processing.get('ocrPages'))==ocr,(name,result.processing)
            print(f'PASS {name}: actual decoder/extraction, OCR={ocr}, 100 + 21 = 121')
        bad=client.post('/analyze',headers=headers,files={'file':('broken.heic',b'not-heic','image/heic')})
        assert bad.status_code==422
        assert bad.json()['error']['code']=='DOCUMENT_IMAGE_UNREADABLE'

if __name__=='__main__':
    test_env_contract()
    test_http_processing()
    print('PASS production-origin HTTP regression (Supabase transport simulated)')
