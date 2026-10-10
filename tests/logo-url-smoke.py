#!/usr/bin/env python3
"""Read-only website icon smoke test for the ten fictitious supplier names.
Only checks candidate URL availability/image dimensions from GitHub CI.
Does not assert ownership or actual logo correctness; not user scan OCR."""
import io,json,time,urllib.request,urllib.error,ssl
from pathlib import Path
from PIL import Image
domains=["ah.nl","jumbo.com","hema.nl","kruidvat.nl","action.com","gamma.nl","praxis.nl","coolblue.nl","ikea.com","mediamarkt.nl"]
results=[]
for domain in domains:
 urls=[f"https://{domain}/apple-touch-icon.png",f"https://www.{domain}/apple-touch-icon.png",f"https://{domain}/favicon.ico"]
 attempts=[]
 found=None
 for url in urls:
  t=time.time()
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (BOEKUNA read-only logo smoke test)"})
   with urllib.request.urlopen(req,timeout=8,context=ssl.create_default_context()) as r:
    raw=r.read(1024*1024)
    actualurl=r.geturl()
    status=r.status
   with Image.open(io.BytesIO(raw)) as im:
    size=im.size
    mime=im.format
   ok= min(size)>=24
   attempts.append({"url":url,"finalUrl":actualurl,"status":status,"size":size,"format":mime,"acceptable":ok,"ms":round((time.time()-t)*1000)})
   if ok:
    found={"url":url,"finalUrl":actualurl,"size":size,"format":mime}
    break
  except Exception as e:
   attempts.append({"url":url,"error":type(e).__name__+":"+str(e)[:120]})
 results.append({"domain":domain,"found":bool(found),"candidate":found,"attempts":attempts})
 print("LOGO_URL_SMOKE",domain,"found="+str(bool(found)),"source="+str(found.get("url") if found else "none"),flush=True)
summary={"resultType":"public icon url reachability only; cannot establish icon's actual brand identity","domains":len(domains),"fetchableImagesMin24":sum(x["found"] for x in results),"nonFetchable":sum(not x["found"] for x in results)}
dest=Path("artifacts/boekuna-logo-url-smoke.json");dest.parent.mkdir(exist_ok=True)
dest.write_text(json.dumps({"summary":summary,"results":results},indent=2,ensure_ascii=False))
print("BOEKUNA_LOGO_URL_SUMMARY="+json.dumps(summary),flush=True)
