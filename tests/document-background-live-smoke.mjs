import fs from 'node:fs';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PREVIEW_URL='https://boekuna-pr6-de1c73cb.onrender.com';
const CANDIDATE_SUPABASE_URL='https://ozisiotrzeubwbffnxyr.supabase.co';
const QA_REVISION='6be87cf7318636a0365ac694df2ab610f65a8b10';

async function makePdf(lines){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595,842]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  let y=790;
  for(const line of lines){page.drawText(line,{x:48,y,size:11,font});y-=22}
  return Buffer.from(await pdf.save());
}

export async function runDocumentBackgroundLiveSmoke(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const consoleErrors=[];
  page.on('pageerror',e=>consoleErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  let qaUserId='';
  try{
    await page.goto(PREVIEW_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>typeof getSupabase==='function',{timeout:30000});

    const processorUrl=await page.evaluate(()=>DOCUMENT_PROCESSOR_URL);
    let processorWarm=false;
    for(let attempt=0;attempt<24;attempt++){
      try{const r=await fetch(processorUrl+'/openapi.json');if(r.ok){processorWarm=true;break}}catch{}
      await new Promise(r=>setTimeout(r,5000));
    }
    if(!processorWarm)throw new Error('Candidate processor did not become ready');

    const qaResponse=await fetch(CANDIDATE_SUPABASE_URL+'/functions/v1/document-processing',{
      method:'POST',
      headers:{'content-type':'application/json','x-boekuna-qa-revision':QA_REVISION},
      body:JSON.stringify({action:'qa_create_user'})
    });
    const qa=await qaResponse.json();
    if(!qaResponse.ok||!qa.ok)throw new Error('QA bootstrap failed: '+JSON.stringify(qa));
    qaUserId=qa.user_id;

    const auth=await page.evaluate(async({email,password})=>{
      const sb=await getSupabase();
      const {data,error}=await sb.auth.signInWithPassword({email,password});
      return {ok:!!data?.session,error:error?.message||''};
    },{email:qa.email,password:qa.password});
    if(!auth.ok)throw new Error('QA login failed: '+auth.error);
    await page.waitForFunction(()=>currentUser&&document.getElementById('mainApp')?.style.display!=='none',{timeout:30000});

    const readyPdf=await makePdf([
      'FACTUUR',
      'Leverancier: Smoke Supplier BV',
      'Adres: Teststraat 10, 3011 AA Rotterdam, Nederland',
      'KvK: 12345678',
      'BTW-nummer: NL123456789B01',
      'Factuurnummer: BG-READY-001',
      'Factuurdatum: 29-09-2026',
      'Betaaltermijn: 14 dagen',
      'IBAN: NL91 ABNA 0417 1643 00',
      'Omschrijving: Adviesdiensten voor administratieve ondersteuning en implementatie van software gedurende september 2026.',
      'Deze digitale factuur bevat een volledige tekstlaag en is uitsluitend bedoeld voor de veilige Boekuna live smoke test.',
      'Subtotaal EUR 100,00',
      'BTW 21% EUR 21,00',
      'Totaal EUR 121,00',
      'Gelieve het bedrag onder vermelding van BG-READY-001 binnen de afgesproken betaaltermijn over te maken.'
    ]);
    const reviewPdf=await makePdf([
      'FACTUUR',
      'Leverancier: Review Supplier BV',
      'Adres: Controleweg 21, 3012 BB Rotterdam, Nederland',
      'KvK: 87654321',
      'Factuurnummer: BG-REVIEW-001',
      'Omschrijving: Uitgebreide administratieve dienstverlening en documentcontrole voor de Boekuna live smoke testomgeving.',
      'Deze digitale factuur heeft bewust een volledige tekstlaag zodat geen OCR nodig is tijdens deze deploymentcontrole.',
      'De factuur bevat voldoende gewone tekst voor betrouwbare digitale extractie maar laat datum en btw-gegevens bewust onbevestigd.',
      'Totaal EUR 128,66',
      'Controleer deze factuur handmatig omdat enkele financiële velden expres ontbreken voor de review-required flow.'
    ]);
    const mixed=Buffer.from(fs.readFileSync(new URL('./fixtures/02_gemengde_btw_9_en_21.pdf.b64',import.meta.url),'utf8').trim(),'base64');
    const csv=Buffer.from('omschrijving,aantal\\nBoekuna live smoke,1\\n','utf8');
    const badJpg=Buffer.from('this-is-not-a-valid-jpeg','utf8');

    await page.locator('#invoicePdfFile').setInputFiles([
      {name:'Smoke-Ready.pdf',mimeType:'application/pdf',buffer:readyPdf},
      {name:'Smoke-Review.pdf',mimeType:'application/pdf',buffer:reviewPdf},
      {name:'Smoke-Mixed-VAT.pdf',mimeType:'application/pdf',buffer:mixed},
      {name:'Smoke-Info.csv',mimeType:'text/csv',buffer:csv},
      {name:'Smoke-Failed.jpg',mimeType:'image/jpeg',buffer:badJpg}
    ]);

    await page.waitForFunction(()=>documentProcessingSession?.persistent&&documentProcessingSession.items.length===5,{timeout:20000});
    const batchId=await page.evaluate(()=>documentProcessingSession.id);
    await page.waitForFunction(()=>documentProcessingSession?.allReceived===true,{timeout:120000});
    await page.waitForFunction(batch=>documentProcessingJobs.filter(j=>j.batch_id===batch).length===5,batchId,{timeout:30000});

    const receivedText=await page.locator('.document-processing-board').innerText();
    if(!/documenten zijn ontvangen/i.test(receivedText))throw new Error('Received confirmation missing');

    const before=await page.evaluate(batch=>({
      ids:documentProcessingJobs.filter(j=>j.batch_id===batch).map(j=>j.id).sort(),
      refs:documentProcessingJobs.filter(j=>j.batch_id===batch).map(j=>j.client_ref).sort(),
      active:documentProcessingJobs.filter(j=>j.batch_id===batch&&!['ready','review_required','failed'].includes(j.state)).length
    }),batchId);
    if(before.active<1)throw new Error('Batch completed before navigation-away could be verified');

    await page.evaluate(()=>navigate('dashboard'));
    if(await page.locator('#documentProcessingGlobal:not(.hidden)').count()!==1)throw new Error('Global indicator missing on Dashboard');
    await page.evaluate(()=>navigate('contacts'));
    if(await page.locator('#documentProcessingGlobal:not(.hidden)').count()!==1)throw new Error('Global indicator missing on Relaties');

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>currentUser&&documentProcessingInitialized,{timeout:30000});
    await page.waitForFunction(batch=>documentProcessingJobs.filter(j=>j.batch_id===batch).length===5,batchId,{timeout:30000});
    const afterRefresh=await page.evaluate(batch=>documentProcessingJobs.filter(j=>j.batch_id===batch).map(j=>j.id).sort(),batchId);
    if(JSON.stringify(afterRefresh)!==JSON.stringify(before.ids))throw new Error('Refresh changed processing job identities');

    await page.evaluate(()=>logoutUser());
    await page.waitForFunction(()=>!currentUser,{timeout:15000});
    await page.waitForTimeout(1500);
    const login=await page.evaluate(async({email,password})=>{
      const sb=await getSupabase();
      const {data,error}=await sb.auth.signInWithPassword({email,password});
      return {ok:!!data?.session,error:error?.message||''};
    },{email:qa.email,password:qa.password});
    if(!login.ok)throw new Error('QA re-login failed: '+login.error);
    await page.waitForFunction(()=>currentUser&&documentProcessingInitialized,{timeout:30000});
    await page.waitForFunction(batch=>documentProcessingJobs.filter(j=>j.batch_id===batch).length===5,batchId,{timeout:30000});
    const afterLogin=await page.evaluate(batch=>documentProcessingJobs.filter(j=>j.batch_id===batch).map(j=>j.id).sort(),batchId);
    if(JSON.stringify(afterLogin)!==JSON.stringify(before.ids))throw new Error('Logout/login created duplicate jobs');

    await page.waitForFunction(batch=>{
      const rows=documentProcessingJobs.filter(j=>j.batch_id===batch);
      return rows.length===5&&rows.every(j=>['ready','review_required','failed'].includes(j.state));
    },batchId,{timeout:180000});

    const terminal=await page.evaluate(batch=>{
      const rows=documentProcessingJobs.filter(j=>j.batch_id===batch);
      return {
        rows:rows.map(j=>({id:j.id,name:j.file_name,state:j.state,attempt:j.attempt,max_attempts:j.max_attempts,review_fields:j.review_fields,error_code:j.error_code,result:j.result,client_ref:j.client_ref})),
        ready:rows.filter(j=>j.state==='ready').length,
        review:rows.filter(j=>j.state==='review_required').length,
        failed:rows.filter(j=>j.state==='failed').length
      };
    },batchId);
    console.log('BOOKUNA_LIVE_STATES='+JSON.stringify(terminal.rows.map(({name,state,attempt,review_fields,error_code})=>({name,state,attempt,review_fields,error_code}))));
    if(terminal.ready<1||terminal.review<1||terminal.failed<1)throw new Error('Expected ready + review_required + failed in live batch');

    const mixedJob=terminal.rows.find(j=>j.name==='Smoke-Mixed-VAT.pdf');
    if(!mixedJob?.result?.analysis)throw new Error('Mixed VAT analysis missing');
    const mixedSemantics=await page.evaluate(job=>{
      const parsed=processorAnalysisToCandidate(job.result.analysis,'','purchase');
      return {mixedRates:!!parsed.mixedRates,vatRate:parsed.vatRate,vatLines:parsed.vatLines};
    },mixedJob);
    if(!mixedSemantics.mixedRates||mixedSemantics.vatRate!=null||!Array.isArray(mixedSemantics.vatLines)||mixedSemantics.vatLines.length<2)throw new Error('Mixed VAT semantics regressed');

    const reviewJob=terminal.rows.find(j=>j.state==='review_required');
    await page.evaluate(id=>openPersistentDocumentReview(id),reviewJob.id);
    await page.locator('#pdfImportForm').waitFor({timeout:20000});
    const focused=await page.evaluate(()=>document.activeElement?.getAttribute('name')||'');
    const focusMap={gross:'gross',vatAmount:'vatAmount',vatRate:'vatRate',vatLines:'vatRate',issueDate:'issueDate',party:'party'};
    const expected=(reviewJob.review_fields||[]).map(x=>focusMap[x]).filter(Boolean);
    if(expected.length&&!expected.includes(focused))throw new Error('Review did not focus a flagged field');
    await page.evaluate(()=>closeModal());

    await page.evaluate(()=>navigate('documents'));
    const failedJob=terminal.rows.find(j=>j.state==='failed');
    const failedCard=page.locator('.document-processing-card').filter({hasText:failedJob.name});
    if(await failedCard.getByRole('button',{name:'Opnieuw proberen'}).count()!==1)throw new Error('Failed document retry action missing');
    if(await failedCard.getByRole('button',{name:'Nieuwe foto kiezen'}).count()!==1)throw new Error('Failed document replacement action missing');
    if(await failedCard.getByRole('button',{name:'Handmatig invoeren'}).count()!==1)throw new Error('Failed document manual action missing');

    const attempts=Object.fromEntries(terminal.rows.map(j=>[j.id,j.attempt]));
    await page.evaluate(id=>retryPersistentDocument(id),failedJob.id);
    await page.waitForFunction(({id,before})=>{
      const j=documentProcessingJobs.find(x=>x.id===id);
      return j&&Number(j.attempt)>Number(before);
    },{id:failedJob.id,before:attempts[failedJob.id]},{timeout:90000});
    await page.waitForFunction(id=>{
      const j=documentProcessingJobs.find(x=>x.id===id);
      return j&&['ready','review_required','failed'].includes(j.state);
    },failedJob.id,{timeout:120000});

    await page.evaluate(()=>fetchDocumentProcessingJobs());
    const integrity=await page.evaluate(async({batch,refs,attempts,failedId})=>{
      const rows=documentProcessingJobs.filter(j=>j.batch_id===batch);
      const sb=await getSupabase();
      const docs=await sb.from('documents').select('id,client_ref').in('client_ref',refs);
      const counts={};for(const d of docs.data||[])counts[d.client_ref]=(counts[d.client_ref]||0)+1;
      return {
        jobCount:rows.length,
        uniqueJobs:new Set(rows.map(j=>j.id)).size,
        othersUnchanged:rows.filter(j=>j.id!==failedId).every(j=>Number(j.attempt)===Number(attempts[j.id])),
        counts
      };
    },{batch:batchId,refs:before.refs,attempts,failedId:failedJob.id});
    if(integrity.jobCount!==5||integrity.uniqueJobs!==5||!integrity.othersUnchanged)throw new Error('Retry isolation failed');
    for(const ref of before.refs)if(integrity.counts[ref]!==1)throw new Error('Duplicate persisted document for '+ref);

    console.log(JSON.stringify({
      status:'LIVE_SMOKE_PASS',
      batchId,
      ready:terminal.ready,
      reviewRequired:terminal.review,
      failed:terminal.failed,
      refreshStable:true,
      reloginStable:true,
      retryIsolated:true,
      noDuplicateJobs:true,
      noDuplicateDocuments:true,
      mixedVatProtected:true,
      consoleErrors:consoleErrors.slice(0,10)
    }));
  }finally{
    if(qaUserId){
      try{
        await fetch(CANDIDATE_SUPABASE_URL+'/functions/v1/document-processing',{
          method:'POST',
          headers:{'content-type':'application/json','x-boekuna-qa-revision':QA_REVISION},
          body:JSON.stringify({action:'qa_delete_user',user_id:qaUserId})
        });
      }catch{}
    }
    await browser.close();
  }
}
