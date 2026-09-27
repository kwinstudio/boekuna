import fs from "node:fs";
import assert from "node:assert/strict";

const manifestPath=process.argv[2];
if(!manifestPath){
  console.error("Usage: node tests/document-verification-benchmark.mjs <manifest.json>");
  process.exit(2);
}
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
assert.ok(Array.isArray(manifest.documents)&&manifest.documents.length>0,"Benchmark requires at least one labeled anonymized document");

const fields=["party","issueDate","description","net","vatRate","vatAmount","gross"];
const moneyFields=new Set(["net","vatAmount","gross"]);
const norm=v=>String(v??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
function same(field,a,b){
  if(a==null&&b==null)return true;
  if(moneyFields.has(field)){
    if(a==null||b==null)return false;
    const x=Number(a),y=Number(b),tol=Math.max(.05,Math.max(Math.abs(x),Math.abs(y))*.002);
    return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=tol;
  }
  if(field==="vatRate"){
    if(a==null||b==null)return false;
    return Math.abs(Number(a)-Number(b))<=.1;
  }
  const x=norm(a),y=norm(b);if(!x&&!y)return true;if(!x||!y)return false;
  return x===y||(Math.min(x.length,y.length)>=4&&(x.includes(y)||y.includes(x)));
}

let total=0,p1ok=0,p2ok=0,p1Errors=0,detected=0,silentAfter=0;
const perField=Object.fromEntries(fields.map(f=>[f,{total:0,p1ok:0,p2ok:0,p1Errors:0,detected:0}]));
for(const doc of manifest.documents){
  assert.ok(doc.id&&doc.groundTruth&&doc.pass1&&doc.pass2,`Missing benchmark data for ${doc.id||"unknown"}`);
  const flagged=new Set(doc.flaggedFields||[]);
  for(const field of fields){
    const truth=doc.groundTruth[field],p1=doc.pass1[field],p2=doc.pass2[field];
    const one=same(field,p1,truth),two=same(field,p2,truth);
    total++;perField[field].total++;
    if(one){p1ok++;perField[field].p1ok++}else{
      p1Errors++;perField[field].p1Errors++;
      const caught=flagged.has(field)||!same(field,p1,p2);
      if(caught){detected++;perField[field].detected++}else silentAfter++;
    }
    if(two){p2ok++;perField[field].p2ok++}
  }
}
const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
const out={
  documents:manifest.documents.length,
  pass1FieldAccuracyPct:pct(p1ok,total),
  pass2FieldAccuracyPct:pct(p2ok,total),
  pass1ImportantFieldErrors:p1Errors,
  importantErrorDetectionRatePct:pct(detected,p1Errors),
  silentImportantErrorRateAfterPct:pct(silentAfter,total),
  perField:Object.fromEntries(Object.entries(perField).map(([k,v])=>[k,{
    pass1AccuracyPct:pct(v.p1ok,v.total),
    pass2AccuracyPct:pct(v.p2ok,v.total),
    pass1Errors:v.p1Errors,
    detectionRatePct:pct(v.detected,v.p1Errors)
  }]))
};
console.log(JSON.stringify(out,null,2));
