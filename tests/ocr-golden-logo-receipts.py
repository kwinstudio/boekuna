#!/usr/bin/env python3
"""Golden gate: ten logo-styled synthetic receipts, as JPG and as raster PDF (20 analyses).

Runs the repository's own analyze_document on fixtures that the generator recreates
inside CI. The layout and printed values mirror the ten demo logo receipts shared on
10 October 2026, but these are NOT the binary files from that ZIP. No production API,
customer files or Supabase writes. This measures OCR of text: a logo drawn in the
pixels is never counted as logo recognition (the processor only reports a printed
web address as evidence). The gate fails unless all 20 analyses are fully correct;
set BOEKUNA_GOLDEN_REPORT_ONLY=1 to report without failing.
"""
import io
import os
import json
import time
import subprocess
import statistics
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP

import fitz
from PIL import Image, ImageDraw, ImageFont

import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "kwinest" / "docprocessor"))
from app import analyze_document
import app as processor

D = Decimal
ROOT=Path(__file__).resolve().parents[1]
FONTS=[
 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
]
assert all(Path(f).exists() for f in FONTS), "DejaVu fonts required"
def f(size,b=False,m=False):
 return ImageFont.truetype(FONTS[3 if m and b else 2 if m else 1 if b else 0],size)
def eur(x): return f"{x:.2f}".replace(".",",")
def q(x): return x.quantize(D(".01"),rounding=ROUND_HALF_UP)
def cents(v): return None if v is None else int(q(D(str(v)))*100)
def equal(s,t):
 return "".join(c for c in str(s or "").lower() if c.isalnum())=="".join(c for c in str(t or "").lower() if c.isalnum())
def render(name,domain,short,color,idx,items,rate,website_at="header"):
 w,h=1050,1640
 im=Image.new("RGB",(w,h),"white");d=ImageDraw.Draw(im)
 def txt(p,s,ff,fill="#20242a",anchor=None):d.text(p,s,font=ff,fill=fill,anchor=anchor)
 def rule(y):d.line((75,y,970,y),fill="#cbd1d6",width=3)
 def row(y,s,amount,b=False):
  txt((76,y),s,f(33,b,True))
  txt((965,y),eur(amount),f(34,b,True),anchor="ra")
 # Demo-only stylized logo, not an official mark
 d.rounded_rectangle((418,65,630,177),radius=18,fill=color)
 txt((525,97),short,f(37,True),fill="#ffffff",anchor="mt")
 txt((525,205),name.upper(),f(52,True),anchor="ma")
 if website_at=="header":txt((525,275),"Website: www."+domain,f(30),anchor="ma")
 txt((525,310),"KASSABON",f(49,True),anchor="ma")
 rule(380)
 txt((80,418),"Leverancier: "+name,f(32))
 txt((80,471),"Datum: 10-10-2026",f(32,m=True))
 txt((80,526),f"Bonnummer: TEST-2026-{idx:03d}",f(32,m=True))
 rule(594)
 txt((80,635),"ARTIKELEN",f(32,True))
 total=sum((price for _,price in items),D("0"))
 net=q(total/(D(1)+D(rate)/D(100)))
 vat=total-net
 for k,(article,amount) in enumerate(items):
  y=708+k*76
  txt((80,y),article,f(35))
  txt((965,y),eur(amount),f(35,m=True),anchor="ra")
 rule(911)
 row(961,"Subtotaal excl. btw EUR",net)
 row(1030,f"BTW {rate}% EUR",vat)
 rule(1091)
 row(1137,"TOTAAL INCL. BTW EUR",total,True)
 row(1213,"Betaald per PIN EUR",total)
 rule(1282)
 txt((525,1350),"Dank voor uw aankoop" if website_at=="header" else "Kijk op www."+domain,f(27),anchor="ma")
 d.rounded_rectangle((80,1405,970,1533),radius=14,fill="#f2f5f3",outline="#bbc9bc",width=2)
 txt((525,1438),"DEMO - FICTIEF TESTDOCUMENT",f(31,True),fill="#355b43",anchor="ma")
 txt((525,1493),"Geen echt aankoopbewijs",f(25),fill="#4f5e57",anchor="ma")
 txt((525,1600),"BOEKUNA OCR- EN LOGOTEST",f(24),fill="#707b83",anchor="ma")
 out=io.BytesIO();im.save(out,format="JPEG",quality=93,subsampling=0,optimize=True)
 return out.getvalue(), {"supplier":name,"date":"2026-10-10","subtotal":net,"vat":vat,"total":total,"vatRate":rate, "receipt":True, "website":domain}

CASES=[
 ("Albert Heijn","ah.nl","AH","#1956b8",[("Kantoorwater",D("4.95")),("Koffie",D("7.38"))],9),
 ("Jumbo","jumbo.com","J","#e8ae00",[("Lunchvergadering",D("10.90")),("Thee",D("3.25"))],9),
 ("HEMA","hema.nl","HE","#ec2631",[("Notitieblok",D("4.99")),("Balpennen",D("6.50"))],21),
 ("Kruidvat","kruidvat.nl","KV","#d92227",[("Handzeep",D("3.49")),("Zakdoekjes",D("4.95"))],21),
 ("Action","action.com","AC","#225bba",[("Opbergboxen",D("9.98")),("Bureaulamp",D("14.99"))],21),
 ("GAMMA","gamma.nl","GA","#f0bd29",[("Schroevenset",D("18.95")),("Schilderstape",D("6.89"))],21),
 ("Praxis","praxis.nl","PR","#ec671d",[("Verfrollers",D("12.49")),("Werkhandschoenen",D("8.99"))],21),
 ("Coolblue","coolblue.nl","CB","#079bd1",[("USB-C adapter",D("29.99")),("Kabel",D("12.99"))],21),
 ("IKEA","ikea.com","IK","#1c4c9c",[("Bureauorganizer",D("14.99")),("Lamp",D("24.99"))],21),
 ("MediaMarkt","mediamarkt.nl","MM","#cc1d25",[("USB-stick",D("19.99")),("Muismat",D("9.99"))],21),
]
def pdf_from_image(jpg):
 p=fitz.open();page=p.new_page(width=420,height=656)
 page.insert_image(page.rect,stream=jpg)
 out=p.tobytes(deflate=True);p.close()
 return out
def git_sha():
 try:return subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,timeout=10).stdout.strip() or "unknown"
 except Exception:return "unknown"

def run():
 results=[]
 from collections import Counter
 started=time.perf_counter()
 for idx,(name,domain,short,color,items,rate) in enumerate(CASES,1):
  jpg,expect=render(name,domain,short,color,idx,items,rate)
  for kind,data,mime in (("jpg",jpg,"image/jpeg"),("raster_pdf",pdf_from_image(jpg),"application/pdf")):
   label=f"{idx:02d}_{domain.split('.')[0]}_LOGOTEST.{ 'jpg' if kind=='jpg' else 'pdf'}"
   t=time.perf_counter()
   try:
    raw=analyze_document(data,label,mime,{"name":"Demo Ondernemer","tradeName":"","kvk":"","vat":""},[],allow_external_ai=False)
    d=raw["data"];a=d.get("amounts") or {};invoice=d.get("invoice") or {};sup=d.get("supplier") or {}
    actual={"supplier":sup.get("name"),"date":invoice.get("invoiceDate"),"subtotal":a.get("subtotal"),
      "vat":a.get("vatTotal"),"total":a.get("total"),"vatRate":next(iter([v.get("rate") for v in (a.get("vatLines") or []) if v.get("rate") is not None]),None),
      "receipt":d.get("documentType")=="receipt","website":sup.get("website")}
    grades={}
    for key,want in expect.items():
     got=actual[key]
     if key in ("subtotal","vat","total"):passed=got is not None and cents(got)==cents(want)
     elif key in ("supplier","website"):passed=equal(got,want)
     elif key=="vatRate":passed=got is not None and float(got)==float(want)
     else:passed=(got==want)
     grades[key]="PASS" if passed else ("MISSING" if got is None else "WRONG")
    route=(d.get("processing") or {}).get("reviewRouting") or {}
    rec={"file":label,"kind":kind,"expected":{k:float(v) if isinstance(v,Decimal) else v for k,v in expect.items()},
      "actual":actual,"grades":grades,"fullyCorrect":all(v=="PASS" for v in grades.values()),
      "route":route.get("mode"),"reviewFields":route.get("fields") or [],"warnings":d.get("warnings") or [],
      "confidence":{k:(d.get("confidence") or {}).get(k) for k in ("supplierName","invoiceDate","subtotal","vatTotal","total")},
      "processingMs":round((time.perf_counter()-t)*1000), "error":None}
   except Exception as exc:
    rec={"file":label,"kind":kind,"fullyCorrect":False,"error":type(exc).__name__+": "+str(exc)[:500],"processingMs":round((time.perf_counter()-t)*1000)}
   results.append(rec)
   print("AUDIT_PROGRESS",label,"pass="+str(rec["fullyCorrect"]),
    "expected="+str(float(expect["total"])),"actual="+str(rec.get("actual",{}).get("total")),
    "route="+str(rec.get("route")),"ms="+str(rec["processingMs"]),flush=True)
 # Real receipts print the web address in the footer, outside the party block: two footer
 # variants must still report the supplier's host (hard check, not part of the 20 analyses).
 footer=[]
 for idx in (1,3):
  name,domain,short,color,items,rate=CASES[idx-1]
  jpg,expect=render(name,domain,short,color,idx,items,rate,website_at="footer")
  raw=analyze_document(jpg,f"{idx:02d}_{domain.split('.')[0]}_FOOTER.jpg","image/jpeg",{"name":"Demo Ondernemer","tradeName":"","kvk":"","vat":""},[],allow_external_ai=False)
  sup=(raw["data"].get("supplier") or {})
  rec={"file":f"{idx:02d}_{domain.split('.')[0]}_FOOTER.jpg","supplier":sup.get("name"),"website":sup.get("website"),"expectedWebsite":domain,
       "pass":equal(sup.get("name"),name) and equal(sup.get("website"),domain)}
  footer.append(rec);print("FOOTER_WEBSITE",json.dumps(rec,ensure_ascii=False),flush=True)
 from collections import defaultdict
 per_field=defaultdict(Counter)
 for r in results:
  for k,v in r.get("grades",{}).items():per_field[k][v]+=1
 summary={"title":"BOEKUNA 10 logo-styled synthetic fixtures x JPG/rasterPDF","processorCommit":git_sha(),
  "detLimit":{"type":processor.OCR_DET_LIMIT_TYPE,"side":processor.OCR_DET_LIMIT_SIDE},
  "fixturesRecreatedInCI":True,"sameBinaryFilesAsUploadedZip":False,"logoRecognition":"not-performed (text OCR only; printed web address reported as evidence)",
  "source":"20 analyses (10 near-identical regenerated jpg receipt layouts, 10 raster PDF)",
  "docs":len(results),"fullyCorrect":sum(r["fullyCorrect"] for r in results),
  "runtimeErrors":sum(bool(r["error"]) for r in results),
  "correctTotals":sum(r.get("grades",{}).get("total")=="PASS" for r in results),
  "correctSupplier":sum(r.get("grades",{}).get("supplier")=="PASS" for r in results),
  "correctDate":sum(r.get("grades",{}).get("date")=="PASS" for r in results),
  "correctVat":sum(r.get("grades",{}).get("vat")=="PASS" for r in results),
  "perField":{k:dict(c) for k,c in per_field.items()},
  "footerWebsite":{"docs":len(footer),"correct":sum(r["pass"] for r in footer)},
  "medianMs":round(statistics.median(r["processingMs"] for r in results)),
  "elapsedS":round(time.perf_counter()-started)}
 dest=Path(os.environ.get("BOEKUNA_GOLDEN_REPORT","artifacts/ocr-logo-regression.json"))
 dest.parent.mkdir(exist_ok=True)
 dest.write_text(json.dumps({"summary":summary,"results":results,"footerWebsite":footer},indent=2,ensure_ascii=False))
 print("BOEKUNA_LOGO_OCR_AUDIT_SUMMARY="+json.dumps(summary,ensure_ascii=False),flush=True)
 for r in results:
  if not r["fullyCorrect"]:print("GOLDEN_FAIL",r["file"],json.dumps({k:v for k,v in r.items() if k in("expected","actual","grades","error")},ensure_ascii=False,default=str),flush=True)
 if (summary["fullyCorrect"]!=summary["docs"] or summary["footerWebsite"]["correct"]!=summary["footerWebsite"]["docs"]) and os.environ.get("BOEKUNA_GOLDEN_REPORT_ONLY")!="1":
  raise SystemExit(f"GOLDEN GATE FAILED: {summary['fullyCorrect']}/{summary['docs']} fully correct, footer website {summary['footerWebsite']['correct']}/{summary['footerWebsite']['docs']}")
if __name__=="__main__":run()
