import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing '+needle);return source.slice(0,i)+replacement+source.slice(i+needle.length)}

const uiHtml=replaceLast(original,'initAuth();',`
const mode=new URL(location.href).searchParams.get('register')==='1'?'register':'login';
showAuth(mode);
`);

const signupHtml=replaceLast(original,'initAuth();',`
window.__signupArgs=null;window.__resendArgs=null;
supabaseClient={auth:{
 signUp:async args=>{window.__signupArgs=args;return {data:{user:{id:'u-new',email:args.email},session:null},error:null}},
 resend:async args=>{window.__resendArgs=args;return {data:{},error:null}}
}};
showAuth('register');
`);

const confirmHtml=replaceLast(original,'initAuth();',`
supabaseClient={auth:{
 getSession:async()=>({data:{session:{user:{id:'confirmed-user',email:'new@example.test'}}},error:null}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}
}};
hydrateCloudAccount=async user=>{currentUser={id:user.id,email:user.email||'',supabaseUser:user};state=structuredClone(DEFAULT)};
initAuth();
`);

const expiredHtml=replaceLast(original,'initAuth();',`
supabaseClient={auth:{
 getSession:async()=>({data:{session:null},error:null}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
}};
initAuth();
`);

const resetHtml=replaceLast(original,'initAuth();',`
window.__resetEmail=null;window.__updatedPassword=null;
supabaseClient={auth:{
 resetPasswordForEmail:async(email,options)=>{window.__resetEmail={email,options};return {data:{},error:null}},
 updateUser:async data=>{window.__updatedPassword=data.password;return {data:{},error:null}},
 getUser:async()=>({data:{user:null},error:null})
}};
showForgotPassword();
`);

const mfaHtml=replaceLast(original,'initAuth();',`
window.__hydratedBeforeMfa=false;
supabaseClient={auth:{
 signInWithPassword:async({email})=>({data:{user:{id:'mfa-user',email}},error:null}),
 signOut:async()=>({error:null}),
 mfa:{
  getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal2'},error:null}),
  listFactors:async()=>({data:{totp:[{id:'factor-1',status:'verified'}]},error:null})
 }
}};
hydrateCloudAccount=async()=>{window.__hydratedBeforeMfa=true};
showAuth('login');
`);

const legacyHtml=replaceLast(original,'initAuth();',`
window.__legacySignupArgs=null;
supabaseClient={auth:{
 signInWithPassword:async()=>({data:{user:null},error:{message:'Invalid login credentials'}}),
 signUp:async args=>{window.__legacySignupArgs=args;return {data:{user:{id:'cloud-legacy',email:args.email},session:{access_token:'test'}},error:null}},
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}
}};
hydrateCloudAccount=async user=>{currentUser={id:user.id,email:user.email||'',supabaseUser:user};state=structuredClone(DEFAULT)};
(async()=>{
 const email='legacy@example.test',password='kort123',salt=randomSalt(),passwordHash=await hashPassword(password,salt);
 saveUsers([{id:'legacy-local',email,salt,passwordHash}]);
 localStorage.setItem(DATA_KEY_PREFIX+'legacy-local',JSON.stringify({...structuredClone(DEFAULT),meta:{...DEFAULT.meta}}));
 showAuth('login',email);
})();
`);

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'',tradeName:'',email:'',phone:'',address:'',postal:'',city:'',kvk:'',vat:'',iban:'',country:'Nederland',invoicePrefix:(new Date().getFullYear()+'-'),paymentDays:14,kor:false};
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  const path=(req.url||'').split('?')[0];
  const body=path==='/signup-flow'?signupHtml:path==='/confirm'?confirmHtml:path==='/expired'?expiredHtml:path==='/reset'?resetHtml:path==='/mfa'?mfaHtml:path==='/legacy'?legacyHtml:path==='/app'?appHtml:uiHtml;
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address(),base=`http://127.0.0.1:${port}`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  // Signup only email/password and live 12-character rule.
  await page.goto(base+'/signup-flow',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Maak je gratis account'}).waitFor();
  assert.equal(await page.locator('#authForm input').count(),2);
  assert.equal(await page.locator('#authForm input[name="confirm"]').count(),0);
  for(const forbidden of ['companyName','address','kvk','vat','iban'])assert.equal(await page.locator(`#authForm [name="${forbidden}"]`).count(),0,`Signup must not collect ${forbidden}`);
  const submit=page.getByRole('button',{name:'Account aanmaken'});
  await page.locator('#registerPassword').fill('kort');
  assert.equal(await submit.isDisabled(),true);
  assert.match(await page.locator('#registerPasswordHelp').innerText(),/minimaal 12/i);
  await page.locator('#registerEmail').fill('new@example.test');
  await page.locator('#registerPassword').fill('lang-genoeg-123');
  assert.equal(await submit.isDisabled(),false);
  assert.match(await page.locator('#registerPasswordHelp').innerText(),/lang genoeg/i);
  await submit.click();
  await page.getByRole('heading',{name:'Controleer je e-mail'}).waitFor();
  const signupArgs=await page.evaluate(()=>window.__signupArgs);
  assert.equal(signupArgs.email,'new@example.test');
  assert.equal(signupArgs.password,'lang-genoeg-123');
  assert.equal(signupArgs.options.data,undefined,'Signup must not send company metadata');
  assert.ok(signupArgs.options.emailRedirectTo);

  // Resend + other-email flow.
  await page.evaluate(()=>{clearInterval(authResendTimer);const b=document.getElementById('resendVerificationButton');b.disabled=false;b.textContent='Opnieuw versturen'});
  await page.getByRole('button',{name:'Opnieuw versturen'}).click();
  const resendArgs=await page.evaluate(()=>window.__resendArgs);
  assert.equal(resendArgs.type,'signup');
  assert.equal(resendArgs.email,'new@example.test');
  await page.getByRole('button',{name:'Andere e-mail gebruiken'}).click();
  await page.getByRole('heading',{name:'Maak je gratis account'}).waitFor();
  assert.equal(await page.locator('#registerEmail').inputValue(),'new@example.test');

  // Login has no frontend min length.
  await page.goto(base+'/?login=1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  assert.equal(await page.locator('#loginPassword').getAttribute('minlength'),null);
  assert.equal(await page.locator('#loginPassword').getAttribute('autocomplete'),'current-password');

  // MFA-enabled accounts must still stop at the authenticator challenge before hydration.
  await page.goto(base+'/mfa',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  await page.locator('#loginEmail').fill('mfa@example.test');
  await page.locator('#loginPassword').fill('bestaand-wachtwoord');
  await page.getByRole('button',{name:'Inloggen'}).click();
  await page.getByRole('heading',{name:'Tweestapsverificatie'}).waitFor();
  assert.equal(await page.locator('input[autocomplete="one-time-code"]').count(),1);
  assert.equal(await page.evaluate(()=>window.__hydratedBeforeMfa),false,'MFA must challenge before account hydration');

  // A valid legacy password shorter than 12 characters must still reach the existing migration path.
  await page.goto(base+'/legacy',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  assert.equal(await page.locator('#loginPassword').getAttribute('minlength'),null);
  await page.locator('#loginPassword').fill('kort123');
  await page.getByRole('button',{name:'Inloggen'}).click();
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  const legacySignup=await page.evaluate(()=>window.__legacySignupArgs);
  assert.equal(legacySignup.email,'legacy@example.test');
  assert.equal(legacySignup.password,'kort123');
  assert.equal(legacySignup.options.data,undefined,'Legacy migration must not reintroduce company metadata');

  // Successful confirmation session enters dashboard even with empty company profile.
  await page.goto(base+'/confirm#type=signup',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  assert.equal(await page.evaluate(()=>page),'dashboard');

  // Expired confirmation gets a dedicated recovery state.
  await page.goto(base+'/expired#type=signup&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Deze link werkt niet meer'}).waitFor();
  assert.ok(await page.getByRole('button',{name:'Nieuwe link sturen'}).count());

  // Forgot/reset UX is generic and new password is a single 12-char field.
  await page.goto(base+'/reset',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Wachtwoord vergeten?'}).waitFor();
  await page.locator('#forgotEmail').fill('person@example.test');
  await page.getByRole('button',{name:'Herstel-link sturen'}).click();
  await page.getByRole('heading',{name:'Controleer je e-mail'}).waitFor();
  assert.match(await page.locator('.auth-form').innerText(),/Als er een account bij dit e-mailadres hoort/);
  assert.equal((await page.evaluate(()=>window.__resetEmail)).email,'person@example.test');
  await page.evaluate(()=>showResetPassword());
  await page.getByRole('heading',{name:'Kies een nieuw wachtwoord'}).waitFor();
  assert.equal(await page.locator('#resetPasswordForm input[type="password"]').count(),1);
  await page.locator('#recoveryPassword').fill('te-kort');
  assert.equal(await page.getByRole('button',{name:'Wachtwoord opslaan'}).isDisabled(),true);
  await page.locator('#recoveryPassword').fill('nieuw-wachtwoord-123');
  assert.equal(await page.getByRole('button',{name:'Wachtwoord opslaan'}).isDisabled(),false);

  // Progressive onboarding: empty profile still reaches dashboard.
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  assert.match(await page.locator('#content').innerText(),/Welkom bij Boekuna/i);
  assert.equal(await page.evaluate(()=>requirementsFor('document-upload').length),0,'Document upload must not require company profile');

  // Contact create requires name only.
  await page.evaluate(()=>newContact());
  await page.locator('#contactForm [name="name"]').fill('Naam Alleen BV');
  await page.evaluate(()=>saveContact(''));
  assert.equal(await page.evaluate(()=>state.contacts.some(c=>c.name==='Naam Alleen BV')),true);

  // Add a complete-address customer so only the own company profile blocks finalization.
  await page.evaluate(()=>{state.contacts.push({id:'full-customer',type:'customer',name:'Volledige Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam',vat:'NL100000002B01'});save()});

  // Draft invoice must save without own business details.
  await page.evaluate(()=>newInvoice());
  await page.locator('#invoiceForm [name="customerId"]').selectOption('full-customer');
  await page.locator('#invoiceLines [data-k="desc"]').fill('Progressive QA');
  await page.locator('#invoiceLines [data-k="qty"]').fill('1');
  await page.locator('#invoiceLines [data-k="unit"]').fill('100');
  await page.evaluate(()=>{updateInvoiceCustomer();calcInvoiceForm();updateInvoiceCheck();reviewInvoice()});
  await page.getByRole('heading',{name:'Concept opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  assert.equal(await page.evaluate(()=>state.invoices.length),1);
  assert.equal(await page.evaluate(()=>state.invoices[0].status),'draft');

  // Finalization should gate only on missing company fields, save draft, navigate to settings subpage.
  const draftId=await page.evaluate(()=>state.invoices[0].id);
  await page.evaluate(id=>editInvoice(id),draftId);
  await page.locator('#invoiceForm [name="status"]').selectOption('sent');
  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Je factuur is bijna klaar'}).waitFor();
  const gateText=await page.locator('.modal-body').innerText();
  assert.match(gateText,/Bedrijfsnaam/);assert.match(gateText,/Bedrijfsadres/);assert.match(gateText,/KVK/);assert.match(gateText,/Btw-id/);
  await page.getByRole('button',{name:'Bedrijfsgegevens invullen'}).click();
  await page.locator('#pageTitle').filter({hasText:'Bedrijfsgegevens'}).waitFor();
  assert.equal(await page.evaluate(()=>state.invoices.length),1,'Progressive gate must not duplicate invoice');
  assert.equal(await page.evaluate(id=>state.invoices[0].id===id,draftId),true,'Progressive gate must preserve invoice identity');

  // Profile fields are optional at HTML level; fill only those required for standard finalization.
  for(const name of ['name','address','postal','city','kvk','vat'])assert.equal(await page.locator(`#profileForm [name="${name}"]`).getAttribute('required'),null);
  await page.locator('#profileForm [name="name"]').fill('Progressive QA BV');
  await page.locator('#profileForm [name="address"]').fill('Teststraat 1');
  await page.locator('#profileForm [name="postal"]').fill('3011AA');
  await page.locator('#profileForm [name="city"]').fill('Rotterdam');
  await page.locator('#profileForm [name="kvk"]').fill('12345678');
  await page.locator('#profileForm [name="vat"]').fill('NL123456789B01');
  await page.getByRole('button',{name:'Bedrijfsgegevens opslaan'}).click();

  // Return to the same draft with original intended final status.
  await page.locator('#invoiceForm').waitFor();
  await page.waitForFunction(()=>document.querySelector('#invoiceForm [name="status"]')?.value==='sent');
  assert.equal(await page.locator('#invoiceForm [name="status"]').inputValue(),'sent');
  assert.equal(await page.evaluate(id=>editingInvoiceId===id,draftId),true,'Returned editor must preserve draft identity');
  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  assert.equal(await page.evaluate(id=>state.invoices.find(i=>i.id===id)?.status,draftId), 'sent', 'Finalized returned draft must keep intended status');
  assert.ok(await page.evaluate(id=>!state.invoices.find(i=>i.id===id).number.startsWith('CONCEPT-'),draftId), 'Finalized invoice must receive a final number');

  // Subscription has no bookkeeping-profile requirement.
  await page.evaluate(()=>{state.company={...structuredClone(DEFAULT.company)}});
  assert.equal(await page.evaluate(()=>requirementsFor('subscription').length),0);

  // Auth responsive layout at required breakpoints.
  for(const width of [320,375,390,430,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/?register=1',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Maak je gratis account'}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Auth must not overflow at ${width}px`);
    const input=page.locator('#registerEmail');const box=await input.boundingBox();assert.ok(box&&box.width<=width,`Auth input must fit at ${width}px`);
    const font=Number((await input.evaluate(el=>getComputedStyle(el).fontSize)).replace('px',''));
    if(width<=820)assert.ok(font>=16,`Mobile auth input font must be >=16px at ${width}px`);
    const sideDisplay=await page.locator('.auth-side').evaluate(el=>getComputedStyle(el).display);
    if(width<=820)assert.equal(sideDisplay,'none');
  }

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Auth/progressive onboarding: PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
