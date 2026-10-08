// Workflow worker review routing must equal the existing Edge reviewAssessment.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ts=fs.readFileSync(new URL('../supabase/functions/document-processing/index.ts',import.meta.url),'utf8');
const src=ts.slice(ts.indexOf('function confidence('),ts.indexOf('async function markFailed'))
  .replace(/\(raw:unknown\)/,'(raw)').replace(/\(data:any\)/,'(data)').replace(/const fields:string\[\]=/,'const fields=')
  .replace(/\(x:any\)/g,'(x)').replace(/const (label|alias):Record<string,string>=/g,'const $1=');
const reviewAssessment=new Function(src+'\nreturn reviewAssessment;')();

const ok={documentType:'purchase_invoice',amounts:{total:121,vatTotal:21,vatLines:[{rate:21}]},invoice:{invoiceDate:'2026-10-07'},
  confidence:{total:.97,vatTotal:.95,invoiceDate:.96,supplierName:.97},processing:{reviewRouting:{fields:[]}}};
const clone=x=>JSON.parse(JSON.stringify(x));
const cases=[ok,{documentType:'quote'},{documentType:'other'},{}];
const mutate=(f)=>{const c=clone(ok);f(c);cases.push(c);};
mutate(c=>c.amounts.total=null);mutate(c=>c.confidence.total=84);mutate(c=>c.confidence.vatTotal=.79);mutate(c=>c.invoice.invoiceDate=null);
mutate(c=>c.confidence.supplierName=.5);mutate(c=>{c.confidence.supplierName=0;c.confidence.customerName=.9});
mutate(c=>c.amounts.vatLines=[{rate:9},{rate:21}]);mutate(c=>{c.amounts.vatLines=[{rate:9},{rate:21}];c.confidence.vatLines=.9});
mutate(c=>c.amounts.vatLines=[]);mutate(c=>c.processing.anomalyCodes=['COMPETING_INVOICE_NUMBERS']);mutate(c=>c.processing.bookingAllowed=false);
mutate(c=>c.amounts.accountingVatTreatment='review_required');mutate(c=>c.warnings=['x']);mutate(c=>c.processing.reviewRouting.fields=['invoiceNumber','gross']);mutate(c=>c.processing.reviewRouting.fields=['documentType','supplierName','subtotal','vatTotal','total']);
mutate(c=>c.documentType='sales_invoice');mutate(c=>c.documentType='receipt');mutate(c=>c.confidence.total='97');mutate(c=>c.amounts.vatLines=[{rate:'21'},{rate:null}]);mutate(c=>c.amounts.vatLines=[{rate:21},{},'x']);

const py=process.env.PYTHON||'python';
const worker=JSON.parse(execFileSync(py,['-c',`
import json,sys,types
sys.path.insert(0,'kwinest/docprocessor')
try:
    import render
except ImportError:
    class W:
        def __init__(self,**k):pass
        def task(self,f):return f
    class R:
        def __init__(self,**k):pass
    sys.modules['render']=types.SimpleNamespace(Workflows=W,Retry=R,TaskContext=object)
import workflow_tasks as w
print(json.dumps([list(w.review(c)) for c in json.load(sys.stdin)]))
`],{input:JSON.stringify(cases),cwd:new URL('..',import.meta.url).pathname,env:{...process.env,ORT_DISABLE_TELEMETRY:'1'},maxBuffer:1<<24}).toString().trim().split('\n').pop());

cases.forEach((c,i)=>{const e=reviewAssessment(c);assert.deepEqual(worker[i],[e.fields,e.message],JSON.stringify(c));});
console.log(`PASS: worker review routing equals Edge reviewAssessment on ${cases.length} cases`);
{const raw=clone(ok);raw.processing.reviewRouting.fields=['documentType','supplierName','subtotal','vatTotal','total'];
const e=reviewAssessment(raw);assert.equal(e.message,'Controleer documenttype, leverancier, bedrag excl. btw, btw-bedrag, totaal.','Extractor field names must reach the user as plain words, once each');}
console.log('PASS: review message uses plain field names');
