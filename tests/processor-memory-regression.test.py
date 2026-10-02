"""Real repeated OCR in a fresh Linux process, with the free service's RAM budget.

No OCR mocks. Input construction happens outside the measured child process.
"""
import io
import json
import runpy
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def worker(directory):
    import resource
    sys.path.insert(0, str(ROOT/'kwinest/docprocessor'))
    import app
    samples=[]
    for cycle in range(3):
        for name,mime in [('qa.jpg','image/jpeg'),('qa.png','image/png'),('qa.heic','image/heif'),('scan.pdf','application/pdf')]:
            doc=app.extract_document(name,mime,(directory/name).read_bytes())
            assert '121' in doc['text'], (name,doc['text'])
            assert doc['ocrPages']==[1], name
        status=Path('/proc/self/status').read_text()
        rss=int(status.split('VmRSS:')[1].split()[0])
        samples.append(rss)
    peak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Keep headroom for the HTTP server, auth transport and runtime differences.
    assert peak<480*1024, ('peak exceeds safe 512 MiB service budget',peak)
    assert max(samples)<340*1024, ('retained native allocations',samples)
    assert samples[-1]-samples[0]<16*1024, ('successive scans leak image caches',samples)
    print(json.dumps({'peak_mib':round(peak/1024,1),'retained_mib':[round(x/1024,1) for x in samples]}))

def test_repeated_formats_memory():
    if sys.platform!='linux':
        print('SKIP Linux RSS/cgroup deployment budget on non-Linux')
        return
    from PIL import Image
    import fitz
    helpers=runpy.run_path(str(ROOT/'tests/document-processor-pdf.test.py'))
    with tempfile.TemporaryDirectory() as tmp:
        directory=Path(tmp)
        scanned=helpers['scanned_pdf'](helpers['invoice_lines']())
        (directory/'scan.pdf').write_bytes(scanned)
        with fitz.open(stream=scanned,filetype='pdf') as pdf:
            png=pdf[0].get_pixmap(matrix=fitz.Matrix(2,2)).tobytes('png')
        (directory/'qa.png').write_bytes(png)
        with Image.open(io.BytesIO(png)) as image:
            image.convert('RGB').save(directory/'qa.jpg',quality=95)
        (directory/'qa.heic').write_bytes((ROOT/'tests/fixtures/scan-invoice.heic').read_bytes())
        result=subprocess.run([sys.executable,__file__,'--worker',tmp],capture_output=True,text=True,timeout=180)
        assert result.returncode==0,result.stdout+result.stderr
        print(result.stdout.strip())

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--worker':worker(Path(sys.argv[2]))
    else:test_repeated_formats_memory()
