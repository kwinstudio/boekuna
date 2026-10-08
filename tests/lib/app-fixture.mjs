// Shared production-build fixture for theme and feedback browser tests.
// Only authentication/startup is replaced with deterministic, fictional data; rendering,
// event wiring and built assets are the real generated app.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const QA_FIXTURE=`
currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};
state=structuredClone(DEFAULT);
state.company={...state.company,name:'Fictieve QA BV',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};
const qaDate='2026-10-03';
state.contacts=[{id:'c0',type:'customer',name:'Fictieve klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'},{id:'c1',type:'supplier',name:'Kantoorartikelen BV',email:'lev@example.test'},{id:'c2',type:'customer',name:'Studio Voorbeeld',email:''}];
state.invoices=[
 {id:'i0',number:'2026-0001',customerId:'c0',status:'sent',kind:'invoice',issueDate:'2026-08-01',dueDate:'2026-08-15',taxTreatment:'standard',lines:[{desc:'Fictieve dienst',qty:4,unit:85,unitLabel:'uur',vat:21}],payments:[]},
 {id:'i1',number:'2026-0002',customerId:'c2',status:'paid',kind:'invoice',issueDate:'2026-09-10',dueDate:'2026-09-24',taxTreatment:'standard',lines:[{desc:'Ontwerp',qty:1,unit:1200,unitLabel:'stuk',vat:21}],payments:[{id:'p1',amount:1452,date:'2026-09-20',method:'bank'}]},
 {id:'i2',number:'',customerId:'c0',status:'draft',kind:'invoice',issueDate:qaDate,dueDate:qaDate,taxTreatment:'standard',lines:[{desc:'Concept',qty:1,unit:250,unitLabel:'stuk',vat:21}],payments:[]}
];
state.expenses=[
 {id:'e0',date:'2026-09-03',vendor:'Kantoorartikelen BV',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'Pin',exVat:82.64,vatRate:21,notes:''},
 {id:'e1',date:'2026-09-14',vendor:'Treinkaartje',invoiceNumber:'',category:'Reiskosten',paymentMethod:'Pin',exVat:27.52,vatRate:9,notes:''}
];
state.transactions=[{id:'t0',date:'2026-09-20',description:'Studio Voorbeeld',amount:1452,status:'matched',matchId:'i1',matchType:'invoice'},{id:'t1',date:'2026-09-25',description:'Onbekende afschrijving',amount:-19.99,status:'unmatched'}];
state.documents=[{id:'d1',fileId:'f1',name:'bon-kantoor.pdf',type:'Upload',date:qaDate,processingState:'ready'},{id:'d2',fileId:'f2',name:'factuur-studio.pdf',type:'Factuur',date:qaDate,linkedId:'i1',linkedType:'invoice',processingState:'ready'}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;
`;

const MIME={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};

export function buildApp(){execFileSync(process.execPath,['scripts/build-app.mjs'],{stdio:'pipe'})}

// extraBoot runs after the fixture and before enterApp(); headBoot runs before anything else in <head>.
export async function startAppServer({extraBoot='',headBoot='',enter=true}={}){
  const builtRoot=path.resolve('dist/app');
  let html=fs.readFileSync(path.join(builtRoot,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
  const marker=html.lastIndexOf('initAuth();');
  if(marker<0)throw new Error('initAuth marker missing');
  html=html.slice(0,marker)+QA_FIXTURE+extraBoot+(enter?'enterApp();':'showAuth(\'login\');')+html.slice(marker+'initAuth();'.length);
  if(headBoot)html=html.replace('<meta charset="utf-8" />','<meta charset="utf-8" />\n<script>'+headBoot+'</script>');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'||pathname==='/app'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html)}
    const file=path.join(builtRoot,pathname.replace(/^\//,''));
    if(file.startsWith(builtRoot+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});return fs.createReadStream(file).pipe(res)}
    res.writeHead(404);res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {server,url:'http://127.0.0.1:'+server.address().port+'/app'};
}

// In-page audit: visible surfaces that stay light in Dark Mode, and text below WCAG AA contrast.
export const CONTRAST_AUDIT=`(function(opts){
  opts=opts||{};
  function parse(c){const m=String(c).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
  function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)}
  function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
  function blend(top,under){const a=top.a;return {r:top.r*a+under.r*(1-a),g:top.g*a+under.g*(1-a),b:top.b*a+under.b*(1-a),a:1}}
  const skip=el=>el.closest('svg,canvas,img,iframe,video,.settings-center-preview,.invoice-layout-preview,[data-theme-exempt],.document-review-preview-frame,.review-preview-shell,input[type=color]');
  function bgOf(el){const stack=[];let n=el;while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=0.98)break}n=n.parentElement}let base=stack.length&&stack[stack.length-1].a>=0.98?stack.pop():parse(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1};while(stack.length)base=blend(stack.pop(),base);return base}
  function sig(el){let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;const cls=[...el.classList].slice(0,3);if(cls.length)s+='.'+cls.join('.');const p=el.parentElement;let ps='';if(p){ps=p.tagName.toLowerCase()+(p.classList.length?'.'+[...p.classList].slice(0,2).join('.'):'')}return ps+' > '+s}
  const visible=el=>{const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;const cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none'&&Number(cs.opacity)>0.05&&!el.closest('[hidden],[aria-hidden=true]')};
  const root=document.querySelector(opts.scope||'body');const light=new Map(),low=new Map();
  for(const el of root.querySelectorAll('*')){
    if(skip(el)||!visible(el))continue;
    const cs=getComputedStyle(el),own=parse(cs.backgroundColor);
    if(opts.dark&&own&&own.a>0.6&&lum(own)>0.45&&(Math.max(own.r,own.g,own.b)-Math.min(own.r,own.g,own.b))<70){const k=sig(el);if(!light.has(k))light.set(k,cs.backgroundColor)}
    if(opts.dark)for(const side of ['Top','Right','Bottom','Left']){const w=parseFloat(cs['border'+side+'Width']),bc=parse(cs['border'+side+'Color']);if(w>=1&&cs['border'+side+'Style']!=='none'&&bc&&bc.a>0.5&&lum(bc)>0.6&&(Math.max(bc.r,bc.g,bc.b)-Math.min(bc.r,bc.g,bc.b))<40){const k=sig(el)+' border-'+side.toLowerCase();if(!light.has(k))light.set(k,cs['border'+side+'Color'])}}
    const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1)||(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)&&!/^(checkbox|radio|range|color|file|hidden)$/.test(el.type)&&el.value);
    if(!hasText)continue;
    const fg=parse(cs.color);if(!fg)continue;const bg=bgOf(el);const fgc=fg.a<1?blend(fg,bg):fg;const r=ratio(fgc,bg);
    const size=parseFloat(cs.fontSize),bold=Number(cs.fontWeight)>=700,large=size>=24||(bold&&size>=18.66);
    const disabled=el.disabled||el.closest('[disabled],[aria-disabled=true]');
    if(!disabled&&r<(large?3:4.5)){const k=sig(el);if(!low.has(k))low.set(k,r.toFixed(2)+' '+cs.color+' on rgb('+[bg.r,bg.g,bg.b].map(Math.round)+') "'+(el.textContent||el.value||'').trim().slice(0,30)+'"')}
  }
  return {light:[...light].map(([k,v])=>k+' :: '+v),lowContrast:[...low].map(([k,v])=>k+' :: '+v)};
})`;
