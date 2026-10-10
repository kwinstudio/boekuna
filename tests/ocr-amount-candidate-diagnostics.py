#!/usr/bin/env python3
"""Inspect raw OCR evidence from synthetic fixtures to isolate incorrect amount anchoring."""
import sys,io,json,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"kwinest"/"docprocessor"))
import app
from document_intelligence import NET_TOTAL_LABELS,VAT_TOTAL_LABELS
from financial_blocks import parse_financial_blocks
spec=importlib.util.spec_from_file_location("demo",ROOT/"tests"/"ocr-golden-logo-receipts.py")
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
evidence=[]
for idx in [2,3,4,5,6,7,8,9,10]:
 name,domain,short,color,items,rate=mod.CASES[idx-1]
 data,truth=mod.render(name,domain,short,color,idx,items,rate)
 doc=app.extract_document("audit.jpg","image/jpeg",data)
 lines=[app.norm_text(x) for x in (doc.get("text") or "").splitlines() if app.norm_text(x)]
 fin=[app.norm_text(x) for x in (doc.get("financialText") or "").splitlines() if app.norm_text(x)]
 combined=[];seen=set()
 for s in fin+lines:
  if s.lower() not in seen:combined.append(s);seen.add(s.lower())
 label_total=app.labeled_amount(combined,["totaal te betalen","te voldoen","amount due","balance due","grand total","eindtotaal","total amount","totaal incl. btw","totaal inclusief btw","total incl. vat","invoice total","factuurbedrag","factuurtotaal"],["subtotaal","subtotal","excl"])
 label_net=app.labeled_amount(combined,NET_TOTAL_LABELS)
 label_vat=app.labeled_amount(combined,VAT_TOTAL_LABELS,["btw nr","btw-id","vat id"])
 strong_total=app.strong_total_anchor(combined)
 blocks=parse_financial_blocks(combined)
 heur=app.heuristic_extract(doc,"audit.jpg",{"name":"Demo Ondernemer"})
 item={"supplier":name,"expected":{"subtotal":str(truth["subtotal"]),"vat":str(truth["vat"]),"total":str(truth["total"])},
       "ocrText":lines,"financialText":fin,"headerText":doc.get("headerText"),
       "netLabelCandidate":label_net,"vatLabelCandidate":label_vat,
       "grossLabelCandidate":label_total,"strongTotalCandidate":strong_total,
       "financialBlocks":blocks,"heuristicAmounts":heur.amounts.model_dump(),
       "derivation":heur.processing.get("amountDerivation")}
 evidence.append(item)
 print("EVIDENCE",name,"OCR="+str(len(lines)),"NET="+str(label_net),"VAT="+str(label_vat),
       "GROSS="+str(label_total),"STRONG="+str(strong_total),
       "FINAL="+str(heur.amounts.total),flush=True)
p=Path("artifacts/ocr-amount-candidate-diagnostics.json");p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(evidence,ensure_ascii=False,indent=2,default=str))
print("EVIDENCE_SAVED",str(p))
