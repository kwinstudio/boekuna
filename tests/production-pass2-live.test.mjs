import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const pdf=Buffer.from(fs.readFileSync(new URL('./fixtures/02_gemengde_btw_9_en_21.pdf.b64',import.meta.url),'utf8').trim(),'base64');
const ORIGIN='https://boekuna-boekhouding.onrender.com';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
assert.ok(EMAIL&&PASSWORD,'Dedicated QA/demo credentials are required');

const supabaseUrl=(source.match(/const SUPABASE_URL='([^']+)'/)||[])[1];
const supabaseKey=(source.match(/const SUPABASE_PUBLISHABLE_KEY='([^']+)'/)||[])[1];
assert.ok(supabaseUrl&&supabaseKey,'Supabase public auth config missing');
const auth=await fetch(supabaseUrl+'/auth/v1/token?grant_type=password',{
  method:'POST',
  headers:{apikey:supabaseKey,'content-type':'application/json'},
  body:JSON.stringify({email:EMAIL,password:PASSWORD})
});
const authJson=await auth.json().catch(()=>({}));
assert.ok(auth.ok&&authJson.access_token,'Dedicated QA/demo account could not authenticate');

const form=new FormData();
form.append('file',new Blob([pdf],{type:'application/pdf'}),'02_gemengde_btw_9_en_21.pdf');
form.append('company_json',JSON.stringify({name:'KWINSTUDIO',tradeName:'KWINSTUDIO',country:'Nederland'}));
const res=await fetch('https://kwinest-docprocessor.onrender.com/verify',{
  method:'POST',
  headers:{Authorization:'Bearer '+authJson.access_token,Origin:ORIGIN},
  body:form
});
const json=await res.json().catch(()=>({}));
assert.equal(res.status,200,'Production PASS2 /verify must return HTTP 200: '+JSON.stringify(json?.error||{}));
assert.equal(json.ok,true,'Production PASS2 /verify must return ok=true');
const d=json.data||{}, amounts=d.amounts||{}, processing=d.processing||{};
assert.equal(d.invoice?.invoiceNumber,'KKG/26/09/7741');
assert.equal(Math.round(Number(amounts.subtotal)*100),42995);
assert.equal(Math.round(Number(amounts.vatTotal)*100),5249);
assert.equal(Math.round(Number(amounts.total)*100),48244);
const lines=(amounts.vatLines||[]).map(v=>({rate:Number(v.rate),taxableAmount:Number(v.taxableAmount),vatAmount:Number(v.vatAmount)})).sort((a,b)=>a.rate-b.rate);
assert.deepEqual(lines,[
  {rate:9,taxableAmount:315,vatAmount:28.35},
  {rate:21,taxableAmount:114.95,vatAmount:24.14}
]);
assert.equal(processing.verificationMode,'independent','PASS2 must report independent verification mode');
console.log('03C production PASS2 /verify: PASS '+JSON.stringify({
  invoiceNumber:d.invoice?.invoiceNumber,
  subtotal:amounts.subtotal,
  vatTotal:amounts.vatTotal,
  total:amounts.total,
  vatLines:lines,
  verificationMode:processing.verificationMode
}));
