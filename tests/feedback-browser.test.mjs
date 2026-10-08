// Hulp & feedback on the production build: the four plain categories, one text field, optional
// screenshot with consent, send, Mijn meldingen, failure/retry without losing text, privacy of
// the automatic context, contextual entry points, keyboard/a11y, phone and desktop.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import axeCore from 'axe-core';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer,CONTRAST_AUDIT} from './lib/app-fixture.mjs';
import {FAKE_FEEDBACK_BACKEND} from './lib/fake-feedback-backend.mjs';

buildApp();
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const shotDir=process.env.FEEDBACK_SHOT_DIR||'tests/artifacts/feedback';fs.mkdirSync(shotDir,{recursive:true});
const {server,url}=await startAppServer({extraBoot:FAKE_FEEDBACK_BACKEND+"window.BOEKUNA_FEEDBACK_TIMEOUT_MS=1500;"});
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDK+mmyQAAAABJRU5ErkJggg==','base64');
const CONTEXT_KEYS=new Set(['v','route','release','releaseProfile','platform','os','browser','deviceClass','viewport','locale','theme','online','submittedAt','feature','errorCode','referenceId','documentId','processingJobId','documentType','ocrCorrections']);
const JARGON=/bug report|feature request|ux issue|incident|severity|prioriteit|priority|ticket/i;

async function openApp({width=1280,height=900,scheme='light',theme=null}={}){
  const context=await browser.newContext({viewport:{width,height},colorScheme:scheme,reducedMotion:'reduce',hasTouch:width<800});
  if(theme)await context.addInitScript(t=>{try{localStorage.setItem('boekuna-theme',t)}catch(e){}},theme);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url);await page.locator('#mainApp').waitFor();
  await page.waitForFunction(()=>!!window.BoekunaFeedback&&typeof window.openSettingsSection==='function');
  return {context,page};
}
async function toHelp(page){await page.evaluate(()=>openSettingsSection('help'));await page.locator('#settings-panel-help').waitFor({state:'visible'})}
const sheetText=page=>page.locator('.fb-sheet').innerText();
async function startFeedback(page){await page.locator('#settings-panel-help').getByRole('button',{name:'Feedback geven'}).click();await page.locator('.fb-sheet').waitFor()}

try{
  // ---------- Desktop: central place and the full flow per category ----------
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>navigate('settings'));
    const rows=await page.locator('.settings-center-nav .settings-nav-item strong').allInnerTexts();
    assert.ok(rows.includes('Hulp & feedback'),'Instellingen has Hulp & feedback');
    await toHelp(page);
    const headings=await page.locator('#settings-panel-help h3').allInnerTexts();
    assert.deepEqual(headings,['Feedback geven','Mijn meldingen','Hulp nodig']);
    assert.equal(await page.locator('#settings-panel-help .btn.primary').count(),1,'Feedback geven is the one primary action');
    assert.match(await page.locator('[data-fb-reports]').innerText(),/Je hebt nog geen meldingen gestuurd/);

    const expected={
      'Er werkt iets niet':['bug','Wat ging er mis?'],
      'Iets klopt niet':['incorrect_result','Wat klopt er volgens jou niet?'],
      'Iets is onduidelijk':['unclear','Wat was niet duidelijk?'],
      'Ik heb een idee':['feature_request','Wat zou je graag makkelijker of anders willen?']
    };
    for(const [label,[category,prompt]] of Object.entries(expected)){
      await startFeedback(page);
      assert.equal(await page.locator('#fbTitle').innerText(),'Waar kunnen we mee helpen?');
      const choices=await page.locator('.fb-choice').allInnerTexts();
      assert.deepEqual(choices.map(s=>s.trim()),Object.keys(expected),'exactly four plain choices');
      assert.equal(JARGON.test(await sheetText(page)),false,'no technical jargon in the customer UI');
      if(category==='bug')await page.screenshot({path:shotDir+'/1-categorie-desktop-'+browserName+'.png'});
      await page.locator('.fb-sheet').getByRole('button',{name:label,exact:true}).click();
      assert.equal((await page.locator('#fbTitle').innerText()).trim(),prompt);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'fbMessage','typing can start right away');
      assert.equal(await page.locator('.fb-sheet textarea').count(),1,'one text field');
      assert.equal(await page.locator('.fb-sheet input:not([type=file]),.fb-sheet select').count(),0,'no other fields to fill in');
      await page.locator('#fbMessage').fill('Testmelding '+label);
      await page.getByRole('button',{name:'Feedback versturen'}).click();
      await page.locator('.fb-done').waitFor();
      assert.match(await sheetText(page),/Bedankt voor je feedback\./);
      assert.match(await sheetText(page),/We bekijken je melding\./);
      const row=await page.evaluate(()=>__fb.rows.at(-1));
      assert.equal(row.category,category);
      assert.equal(row.screenshot_path,null,'no screenshot unless the user adds one');
      await page.getByRole('button',{name:'Klaar'}).click();
      await page.locator('.fb-sheet').waitFor({state:'detached'});
    }
    assert.equal(await page.evaluate(()=>__fb.uploads),0,'nothing uploaded without an explicit screenshot');
    console.log('PASS four categories: bug, incorrect result, unclear, idea');

    // Empty message is caught calmly, nothing is sent.
    await startFeedback(page);
    await page.locator('.fb-sheet').getByRole('button',{name:'Er werkt iets niet',exact:true}).click();
    const before=await page.evaluate(()=>__fb.inserts);
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    assert.equal(await page.locator('#fbMessageError').isVisible(),true);
    assert.equal(await page.locator('#fbMessage').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(()=>__fb.inserts),before,'empty feedback is not sent');

    // Screenshot: add, see, remove, add again, consent text shown, sent only on send.
    await page.locator('#fbMessage').fill('Het totaal op mijn overzicht klopt niet.');
    await page.getByRole('button',{name:/Screenshot toevoegen/}).waitFor();
    assert.match(await page.locator('.fb-add-shot').innerText(),/Optioneel/);
    await page.locator('.fb-file').setInputFiles({name:'shot.png',mimeType:'image/png',buffer:PNG});
    await page.locator('.fb-shot img').waitFor();
    assert.match(await page.locator('#fbConsent').innerText(),/Een screenshot kan persoonlijke of financiële gegevens bevatten\. Controleer wat je meestuurt\./);
    assert.equal(await page.evaluate(()=>__fb.uploads),0,'picking a screenshot does not upload it');
    await page.getByRole('button',{name:'Screenshot verwijderen'}).click();
    assert.equal(await page.locator('.fb-shot').count(),0);
    assert.equal(await page.locator('#fbMessage').inputValue(),'Het totaal op mijn overzicht klopt niet.','text survives screenshot changes');
    await page.locator('.fb-file').setInputFiles({name:'shot.png',mimeType:'image/png',buffer:PNG});
    await page.locator('.fb-shot img').waitFor();
    await page.screenshot({path:shotDir+'/2-bericht-screenshot-desktop-'+browserName+'.png'});

    // Double submit protection.
    await page.evaluate(()=>{__fb.insertDelay=400});
    const insertsBefore=await page.evaluate(()=>__fb.inserts);
    await page.locator('.fb-submit').dblclick();
    await page.locator('.fb-submit').click({force:true}).catch(()=>{});
    await page.locator('.fb-done').waitFor();
    await page.evaluate(()=>{__fb.insertDelay=0});
    assert.equal(await page.evaluate(()=>__fb.inserts)-insertsBefore,1,'double click sends once');
    const withShot=await page.evaluate(()=>({row:__fb.rows.at(-1),files:__fb.files,uid:currentUser.id}));
    assert.equal(withShot.row.screenshot_path,withShot.uid+'/'+withShot.row.id+'/screenshot.jpg','private per-user path');
    assert.equal(withShot.files[withShot.row.screenshot_path].type,'image/jpeg','re-encoded (metadata stripped)');
    await page.screenshot({path:shotDir+'/3-bedankt-desktop-'+browserName+'.png'});
    console.log('PASS required text, screenshot add/remove/consent, double submit');

    // Mijn meldingen.
    await page.getByRole('button',{name:'Mijn meldingen'}).click();
    await page.locator('.fb-report').first().waitFor();
    const list=await page.locator('.fb-report').allInnerTexts();
    assert.equal(list.length,5);
    assert.match(list[0],/Het totaal op mijn overzicht klopt niet\.[\s\S]*Ontvangen/);
    await page.evaluate(()=>{const r=__fb.rows[0];r.customer_status='resolved';r.customer_reply='Dit is opgelost in de nieuwste versie.';r.status_changed_at=new Date().toISOString();const r2=__fb.rows[1];r2.customer_status='reviewing';const r3=__fb.rows[2];r3.customer_status='in_progress'});
    await page.evaluate(()=>BoekunaFeedback.refreshPanelReports());
    await page.waitForFunction(()=>document.querySelectorAll('.fb-status-resolved').length===1);
    const labels=await page.locator('.fb-report .fb-status').allInnerTexts();
    assert.deepEqual([...new Set(labels)].sort(),['In behandeling','Ontvangen','Opgelost','Wordt bekeken'].sort(),'only the four customer statuses');
    await page.screenshot({path:shotDir+'/4-mijn-meldingen-desktop-'+browserName+'.png'});
    await page.locator('.fb-report').last().click();
    await page.locator('.fb-detail').waitFor();
    const detail=await sheetText(page);
    assert.match(detail,/Opgelost/);assert.match(detail,/Reactie van BOEKUNA/);assert.match(detail,/Dit is opgelost in de nieuwste versie\./);
    for(const hidden of [/github/i,/priority|prioriteit/i,/severity/i,/[0-9a-f]{8}-[0-9a-f]{4}-/i,/stack/i])assert.equal(hidden.test(detail),false,'no internal details in the customer view: '+hidden);
    await page.keyboard.press('Escape');
    await page.locator('.fb-report').first().click();
    await page.locator('.fb-detail-shot img').waitFor();
    await page.screenshot({path:shotDir+'/5-melding-detail-desktop-'+browserName+'.png'});
    await page.keyboard.press('Escape');
    console.log('PASS Mijn meldingen list, four statuses, detail without internal data');

    // Privacy of what is sent automatically.
    const sent=await page.evaluate(()=>__fb.rows);
    for(const r of sent){
      for(const k of Object.keys(r.context))assert.ok(CONTEXT_KEYS.has(k),'unexpected context key '+k);
      const raw=JSON.stringify(r);
      for(const secret of ['access_token','refresh_token','eyJ','password','NL91ABNA0417164300','bon-kantoor.pdf','Fictieve klant BV','qa@example.test','sb-','localStorage'])assert.equal(raw.includes(secret),false,'context leaked '+secret);
    }
    console.log('PASS automatic context is whitelisted: no tokens, bank data, documents or personal data');
    await context.close();
  }

  // ---------- Failures: nothing is lost ----------
  {
    const {context,page}=await openApp();
    await toHelp(page);await startFeedback(page);
    await page.locator('.fb-sheet').getByRole('button',{name:'Er werkt iets niet',exact:true}).click();
    await page.locator('#fbMessage').fill('Mijn factuur wordt niet opgeslagen.');
    await page.evaluate(()=>{__fb.fail='insert'});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-error').waitFor();
    assert.match(await page.locator('.fb-error').innerText(),/Feedback kon niet worden verstuurd\. Probeer het opnieuw\./);
    assert.equal(await page.getByRole('button',{name:'Opnieuw proberen'}).isEnabled(),true);
    // Navigating away keeps a local draft.
    await page.keyboard.press('Escape');
    await page.evaluate(()=>navigate('dashboard'));
    await toHelp(page);await startFeedback(page);
    assert.equal(await page.locator('#fbMessage').inputValue(),'Mijn factuur wordt niet opgeslagen.','draft restored');
    await page.evaluate(()=>{__fb.fail=null});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-done').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('boekuna-feedback-draft:'+currentUser.id)),null,'draft cleared after success');
    await page.getByRole('button',{name:'Klaar'}).click();

    // Timeout, then a retry with the same id does not create a duplicate.
    await startFeedback(page);await page.locator('.fb-sheet').getByRole('button',{name:'Iets is onduidelijk',exact:true}).click();
    await page.locator('#fbMessage').fill('Ik snap de btw-pagina niet.');
    await page.evaluate(()=>{__fb.fail='timeout'});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-error').waitFor({timeout:6000});
    await page.evaluate(()=>{__fb.fail=null});
    await page.getByRole('button',{name:'Opnieuw proberen'}).click();
    await page.locator('.fb-done').waitFor();
    await page.getByRole('button',{name:'Klaar'}).click();

    // Screenshot upload failure is explained and recoverable.
    await startFeedback(page);await page.locator('.fb-sheet').getByRole('button',{name:'Ik heb een idee',exact:true}).click();
    await page.locator('#fbMessage').fill('Een donkere modus voor de PDF.');
    await page.locator('.fb-file').setInputFiles({name:'shot.png',mimeType:'image/png',buffer:PNG});
    await page.locator('.fb-shot img').waitFor();
    await page.evaluate(()=>{__fb.fail='upload'});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-error').waitFor();
    assert.match(await page.locator('.fb-error').innerText(),/screenshot kon niet worden geüpload/i);
    await page.getByRole('button',{name:'Screenshot verwijderen'}).click();
    await page.evaluate(()=>{__fb.fail=null});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-done').waitFor();
    await page.getByRole('button',{name:'Klaar'}).click();

    // Session expired.
    await startFeedback(page);await page.locator('.fb-sheet').getByRole('button',{name:'Er werkt iets niet',exact:true}).click();
    await page.locator('#fbMessage').fill('Sessie test.');
    await page.evaluate(()=>{__fb.fail='session'});
    await page.getByRole('button',{name:'Feedback versturen'}).click();
    await page.locator('.fb-error').waitFor();
    assert.match(await page.locator('.fb-error').innerText(),/Je bent uitgelogd\. Je bericht is bewaard\./);
    await page.evaluate(()=>{__fb.fail=null});

    // Offline.
    await context.setOffline(true);
    await page.getByRole('button',{name:'Opnieuw proberen'}).click();
    await page.locator('.fb-error').waitFor();
    assert.match(await page.locator('.fb-error').innerText(),/Je bent offline\. Je bericht is bewaard\./);
    await context.setOffline(false);
    await page.getByRole('button',{name:'Opnieuw proberen'}).click();
    await page.locator('.fb-done').waitFor();
    const ids=await page.evaluate(()=>__fb.rows.map(r=>r.id));
    assert.equal(new Set(ids).size,ids.length,'no duplicate reports after retries');
    assert.equal(ids.length,4);
    console.log('PASS failure/retry: insert error, draft after navigating away, timeout, upload error, session expired, offline');
    await context.close();
  }

  // ---------- Contextual entry points reuse the same sheet ----------
  {
    const {context,page}=await openApp();
    // Bank import error.
    await page.evaluate(()=>showBankImportError('empty'));
    await page.locator('#modalRoot').getByRole('button',{name:'Probleem melden'}).click();
    await page.locator('#fbMessage').waitFor();
    assert.equal((await page.locator('#fbTitle').innerText()).trim(),'Wat ging er mis?','category already chosen');
    assert.match(await page.locator('.fb-context').innerText(),/Bankimport/);
    await page.locator('#fbMessage').fill('Mijn ING-bestand wordt niet herkend.');
    await page.getByRole('button',{name:'Feedback versturen'}).click();await page.locator('.fb-done').waitFor();
    let row=await page.evaluate(()=>__fb.rows.at(-1));
    assert.deepEqual([row.category,row.context.feature,row.context.errorCode],['bug','bank-import','BANK_EMPTY']);
    await page.getByRole('button',{name:'Klaar'}).click();
    // Document processing error dialog.
    await page.evaluate(()=>showUploadError({code:'DOCUMENT_PDF_UNREADABLE',referenceId:'ref-123'},new File(['x'],'bon.pdf')));
    await page.locator('#modalRoot').getByRole('button',{name:'Probleem melden'}).click();
    await page.locator('#fbMessage').fill('Deze PDF lukt steeds niet.');
    await page.getByRole('button',{name:'Feedback versturen'}).click();await page.locator('.fb-done').waitFor();
    row=await page.evaluate(()=>__fb.rows.at(-1));
    assert.equal(row.context.feature,'document-upload');assert.equal(row.context.referenceId,'ref-123');
    assert.ok(!JSON.stringify(row).includes('bon.pdf'),'file name is not sent');
    await page.getByRole('button',{name:'Klaar'}).click();
    assert.equal(await page.locator('#modalRoot .modal').count(),1,'the error dialog stays where it was');
    await page.evaluate(()=>closeModal());
    // Not everywhere: ordinary screens have no extra feedback buttons.
    for(const p of ['dashboard','invoices','expenses','reports']){await page.evaluate(p=>navigate(p),p);assert.equal(await page.locator('#content [data-fb-open],#content [data-fb-context]').count(),0,p+' has no feedback button')}
    // Resolved note, once.
    await page.evaluate(()=>{localStorage.setItem('boekuna-feedback-active:'+currentUser.id,'1');const r=__fb.rows[0];r.customer_status='resolved';r.status_changed_at=new Date(Date.now()+1000).toISOString()});
    await page.evaluate(()=>BoekunaFeedback.checkResolved());
    await page.locator('.fb-action-toast').filter({hasText:'Je melding is opgelost'}).waitFor();
    console.log('PASS contextual entries: bank import, processing error, resolved note; no buttons elsewhere');
    await context.close();
  }

  // ---------- Keyboard and accessibility (Light and Dark) ----------
  for(const theme of ['light','dark']){
    const {context,page}=await openApp({theme});
    await toHelp(page);
    const opener=page.locator('#settings-panel-help').getByRole('button',{name:'Feedback geven'});
    await opener.focus();await page.keyboard.press('Enter');
    await page.locator('.fb-sheet').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'fbTitle','focus moves into the dialog');
    assert.equal(await page.locator('.fb-sheet').getAttribute('role'),'dialog');
    assert.equal(await page.locator('.fb-sheet').getAttribute('aria-modal'),'true');
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.fb-sheet')),true,'focus stays in the dialog')}
    await page.addScriptTag({content:axeCore.source});
    let v=await page.evaluate(async()=>(await axe.run('.fb-sheet',{runOnly:['wcag2a','wcag2aa']})).violations.map(x=>x.id+': '+x.nodes.length));
    assert.deepEqual(v,[],theme+' category step a11y');
    await page.locator('.fb-sheet').getByRole('button',{name:'Iets klopt niet',exact:true}).focus();await page.keyboard.press('Enter');
    await page.locator('#fbMessage').waitFor();
    await page.locator('.fb-file').setInputFiles({name:'shot.png',mimeType:'image/png',buffer:PNG});await page.locator('.fb-shot img').waitFor();
    await page.locator('.fb-details summary').click();
    v=await page.evaluate(async()=>(await axe.run('.fb-sheet',{runOnly:['wcag2a','wcag2aa']})).violations.map(x=>x.id+': '+x.nodes.length));
    assert.deepEqual(v,[],theme+' message step a11y');
    const contrast=await page.evaluate(CONTRAST_AUDIT+'({dark:'+(theme==='dark')+',scope:".fb-sheet"})');
    assert.deepEqual([...contrast.light,...contrast.lowContrast],[],theme+' sheet contrast');
    await page.keyboard.press('Escape');
    await page.locator('.fb-sheet').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement&&document.activeElement.textContent.trim()==='Feedback geven',null,{timeout:3000}).catch(()=>{});
    assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Feedback geven','focus returns to the opener');
    await toHelp(page);
    v=await page.evaluate(async()=>(await axe.run('#settings-panel-help',{runOnly:['wcag2a','wcag2aa']})).violations.map(x=>x.id+': '+x.nodes.length));
    assert.deepEqual(v,[],theme+' Hulp & feedback panel a11y');
    await context.close();
  }
  console.log('PASS keyboard, focus trap, Escape, axe WCAG 2 AA in Light and Dark');

  // ---------- Phone: bottom sheet, touch targets, safe area, no overflow ----------
  for(const [width,height,theme] of [[390,844,'light'],[390,844,'dark'],[320,640,'light'],[844,390,'dark']]){
    const {context,page}=await openApp({width,height,theme});
    await toHelp(page);
    if(width===390)await page.screenshot({path:shotDir+'/m-hulp-feedback-'+theme+'-'+browserName+'.png'});
    await startFeedback(page);
    if(width===390)await page.screenshot({path:shotDir+'/m-1-categorie-'+theme+'-'+browserName+'.png'});
    for(const sel of ['.fb-choice','.fb-close']){
      const sizes=await page.locator(sel).evaluateAll(n=>n.map(e=>{const r=e.getBoundingClientRect();return Math.min(r.width,r.height)}));
      assert.ok(sizes.every(s=>s>=44),sel+' touch target '+sizes);
    }
    await page.locator('.fb-sheet').getByRole('button',{name:'Er werkt iets niet',exact:true}).click();
    await page.locator('#fbMessage').fill('Op mijn telefoon verdwijnt de knop.');
    await page.locator('.fb-file').setInputFiles({name:'shot.png',mimeType:'image/png',buffer:PNG});await page.locator('.fb-shot img').waitFor();
    const layout=await page.evaluate(()=>{const s=document.querySelector('.fb-sheet').getBoundingClientRect(),b=document.querySelector('.fb-submit').getBoundingClientRect(),ta=getComputedStyle(document.querySelector('#fbMessage'));return {sheetBottom:Math.round(s.bottom),sheetTop:Math.round(s.top),vh:innerHeight,submitBottom:Math.round(b.bottom),submitH:Math.round(b.height),font:parseFloat(ta.fontSize),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
    if(width<800)assert.equal(layout.sheetBottom,layout.vh,'bottom sheet on phones');
    assert.ok(layout.sheetTop>=0,'sheet fits on screen');
    assert.ok(layout.submitBottom<=layout.vh&&layout.submitH>=44,'send button stays reachable '+JSON.stringify(layout));
    assert.ok(layout.font>=16,'16px text field avoids iOS zoom when the keyboard opens');
    assert.ok(layout.overflow<=1,'no horizontal scroll');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('fb-scroll-lock')),true,'page behind does not scroll');
    if(width===390)await page.screenshot({path:shotDir+'/m-2-bericht-'+theme+'-'+browserName+'.png'});
    await page.getByRole('button',{name:'Feedback versturen'}).click();await page.locator('.fb-done').waitFor();
    if(width===390)await page.screenshot({path:shotDir+'/m-3-bedankt-'+theme+'-'+browserName+'.png'});
    await page.getByRole('button',{name:'Mijn meldingen'}).click();
    await page.locator('.fb-report').first().waitFor();
    if(width===390)await page.screenshot({path:shotDir+'/m-4-mijn-meldingen-'+theme+'-'+browserName+'.png'});
    await context.close();
  }
  console.log('PASS phone bottom sheet (390, 320, landscape), touch targets, reachable send button');

  assert.deepEqual(errors,[]);
  console.log('Feedback browser QA: PASS '+browserName);
}finally{await browser.close();server.close()}
