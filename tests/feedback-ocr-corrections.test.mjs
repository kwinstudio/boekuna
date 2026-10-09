// Document controleren → OCR correction feedback on the production build.
// A correction is recorded privately with the document (field identity, recognised value,
// corrected value, existing confidence/provenance). Nothing is sent to BOEKUNA unless the user
// chooses "Help BOEKUNA verbeteren". Parser, Document Intelligence and financial rules are untouched.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';
import {FAKE_FEEDBACK_BACKEND} from './lib/fake-feedback-backend.mjs';

buildApp();
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const {server,url}=await startAppServer({extraBoot:FAKE_FEEDBACK_BACKEND});
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const shotDir=process.env.FEEDBACK_SHOT_DIR||'tests/artifacts/feedback';fs.mkdirSync(shotDir,{recursive:true});

const BASE={
  type:'purchase',documentType:'purchase_invoice',confidenceScore:82,sourceQuality:'processor-v2',
  party:'Voorbeeld Leverancier BV',invoiceNumber:'2026-183',issueDate:'2026-10-03',dueDate:'',
  description:'Software',category:'Software',currency:'EUR',status:'sent',
  net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,
  vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],lineItems:[],adjustments:[],
  fieldConfidence:{party:71,invoiceNumber:62,issueDate:95,net:98,vatAmount:98,gross:98,vatRate:98,vatLines:98,category:80},
  fieldProvenance:{invoiceNumber:{source:'ocr',page:1}}
};
async function openReview(overrides={}){
  await page.evaluate(({base,overrides})=>{
    pendingPdfImport={file:new File(['qa'],'review.pdf',{type:'application/pdf'}),parsed:{...base,...overrides},previewUrl:null,sha256:'ocr-qa-'+Math.random(),sourceClientRef:'',sourceDocumentId:'',processingJobId:''};
    showPdfImportReview(pendingPdfImport.parsed);
  },{base:BASE,overrides});
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
}

try{
  await page.goto(url);await page.locator('#mainApp').waitFor();
  await page.waitForFunction(()=>!!window.BoekunaFeedback&&!!window.BookunaDocumentReviewV2);

  // Field identity for every required field, including currency, via the shared diff.
  const diff=await page.evaluate(base=>{
    const corrected={...base,invoiceNumber:'INV-2026-183',issueDate:'2026-10-04',party:'Echte Leverancier BV',net:110,vatAmount:23.1,gross:133.1,currency:'usd'};
    return BoekunaFeedback.diffRecognition(base,corrected,base);
  },BASE);
  assert.deepEqual(diff.map(x=>[x.field,x.originalValue,x.correctedValue]),[
    ['invoiceNumber','2026-183','INV-2026-183'],
    ['invoiceDate','2026-10-03','2026-10-04'],
    ['supplier','Voorbeeld Leverancier BV','Echte Leverancier BV'],
    ['subtotal','100.00','110.00'],
    ['vat','21.00','23.10'],
    ['invoiceTotal','121.00','133.10'],
    ['currency','EUR','USD']
  ]);
  assert.equal(diff[0].confidence,62,'existing confidence is kept');
  assert.deepEqual([diff[0].sourceType,diff[0].page],['ocr',1],'existing provenance is kept');
  assert.deepEqual(await page.evaluate(base=>BoekunaFeedback.diffRecognition(base,{...base,net:'100.00',vatRate:'21'},base),BASE),[],'formatting-only differences are not corrections');
  console.log('PASS field identity for invoiceNumber, invoiceDate, supplier, subtotal, VAT, invoiceTotal, currency');

  // Real review flow: correct number, date, supplier and amounts, then save.
  const before=await page.evaluate(()=>({expenses:state.expenses.length,docs:state.documents.length,di:JSON.stringify(state.documentIntelligence||null),parser:typeof BoekunaDocumentIntelligence.predict}));
  await openReview();
  assert.equal(await page.locator('.fb-review-hint').count(),0,'no feedback prompt before anything was corrected');
  await page.locator('[data-review-page="1"] [name="invoiceNumber"]').fill('INV-2026-183');
  await page.locator('.fb-review-hint').waitFor();
  assert.match(await page.locator('.fb-review-hint').innerText(),/Herkenning klopt niet\?\s*Help BOEKUNA verbeteren/);
  await page.locator('[data-review-page="1"] [name="party"]').fill('Echte Leverancier BV');
  await page.locator('[data-review-page="1"] [name="issueDate"]').fill('2026-10-04');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  // Only the total is typed; at 21% Boekuna calculates 110,00 + 23,10.
  await page.locator('[data-review-page="2"] [name="reviewAmount"]').fill('133,10');
  await page.waitForTimeout(300);
  await page.screenshot({path:shotDir+'/ocr-review-hint-'+browserName+'.png'});
  assert.equal(await page.evaluate(()=>__fb.inserts),0,'correcting alone sends nothing');
  await page.locator('[data-review-save]:visible').first().click();
  await page.waitForFunction(()=>!document.querySelector('#modalRoot .modal'));
  // The correction is written right after the save promise settles, which can be a tick after the modal closed.
  await page.waitForFunction(()=>state.documents.some(d=>d.recognitionCorrections),null,{timeout:5000}).catch(()=>{});
  const saved=await page.evaluate(()=>{
    const doc=state.documents.find(d=>d.recognitionCorrections);
    const expense=doc&&state.expenses.find(e=>e.id===doc.linkedId);
    return {doc:doc&&{fields:doc.recognitionCorrections.fields,documentType:doc.recognitionCorrections.documentType},expense:expense&&{vendor:expense.vendor,invoiceNumber:expense.invoiceNumber,date:expense.date},counts:{expenses:state.expenses.length,docs:state.documents.length}};
  });
  assert.ok(saved.doc,'correction is recorded with the document');
  const byField=Object.fromEntries(saved.doc.fields.map(f=>[f.field,f]));
  assert.deepEqual([byField.invoiceNumber.originalValue,byField.invoiceNumber.correctedValue],['2026-183','INV-2026-183']);
  assert.deepEqual([byField.invoiceDate.originalValue,byField.invoiceDate.correctedValue],['2026-10-03','2026-10-04']);
  assert.deepEqual([byField.supplier.originalValue,byField.supplier.correctedValue],['Voorbeeld Leverancier BV','Echte Leverancier BV']);
  assert.deepEqual([byField.invoiceTotal.originalValue,byField.invoiceTotal.correctedValue],['121.00','133.10']);
  assert.deepEqual([byField.vat.originalValue,byField.vat.correctedValue],['21.00','23.10']);
  assert.ok(byField.subtotal&&byField.subtotal.correctedValue==='110.00','subtotal correction follows the existing financial reconciliation');
  console.log('PASS invoiceNumber / invoiceDate / supplier / subtotal / VAT / invoiceTotal corrections preserved');
  assert.deepEqual(saved.counts,{expenses:before.expenses+1,docs:before.docs+1},'document remains saveable under existing financial rules');
  assert.equal(saved.expense.invoiceNumber,'INV-2026-183');
  assert.equal(await page.evaluate(()=>__fb.inserts),0,'saving a correction sends nothing to BOEKUNA');
  assert.equal(await page.evaluate(()=>typeof BoekunaDocumentIntelligence.predict),before.parser,'parser untouched');
  console.log('PASS document saved; no automatic upload; parser untouched');

  // Reporting is a separate, explicit choice: from the saved review.
  const docId=await page.evaluate(()=>state.documents.find(d=>d.recognitionCorrections).id);
  await page.evaluate(id=>{const d=state.documents.find(x=>x.id===id);d.reviewSnapshot=d.reviewSnapshot||{};openSavedDocumentReview(id)},docId);
  await page.getByRole('button',{name:'Herkenning klopt niet?'}).click();
  await page.locator('#fbMessage').waitFor();
  assert.match(await page.locator('.fb-context').innerText(),/Document controleren.*Factuurnummer/);
  await page.locator('#fbMessage').fill('Het factuurnummer begint altijd met INV.');
  await page.getByRole('button',{name:'Feedback versturen'}).click();
  await page.locator('.fb-done').waitFor();
  const row=await page.evaluate(()=>__fb.rows.at(-1));
  assert.equal(row.category,'ocr_correction');
  assert.equal(row.title,'Herkenning klopt niet: Factuurnummer, Factuurdatum, Leverancier, Bedrag excl. btw, Btw-bedrag, Totaal'.slice(0,120));
  assert.equal(row.context.feature,'document-review');
  assert.equal(row.context.documentId,docId);
  assert.deepEqual(row.context.ocrCorrections.find(x=>x.field==='invoiceNumber'),{field:'invoiceNumber',originalValue:'2026-183',correctedValue:'INV-2026-183',confidence:62,sourceType:'ocr',page:1});
  const raw=JSON.stringify(row);
  for(const forbidden of ['lineItems','vatLines','review.pdf','fieldConfidence','NL91ABNA'])assert.equal(raw.includes(forbidden),false,'no document dump: '+forbidden);
  await page.getByRole('button',{name:'Klaar'}).click();
  console.log('PASS explicit OCR report carries only the corrected fields');

  // No automatic rule/parser mutation: a later document with the same original number is still
  // recognised exactly as the processor delivered it.
  await openReview({party:'Voorbeeld Leverancier BV',invoiceNumber:'2026-183'});
  assert.equal(await page.locator('[data-review-page="1"] [name="invoiceNumber"]').inputValue(),'2026-183','one correction is not treated as universal truth');
  await page.evaluate(()=>closeModal());
  assert.deepEqual(errors,[]);
  console.log('Feedback OCR corrections: PASS '+browserName);
}finally{await browser.close();server.close()}
