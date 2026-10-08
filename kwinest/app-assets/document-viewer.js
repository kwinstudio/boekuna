/* BOEKUNA document viewer — one way to look at an original document: always a visible close button, zoom inside
   the viewer instead of the page, and the document text can be selected and copied into a field. */
(function(global){
'use strict';

const MOBILE=matchMedia('(max-width:820px)');
// pdf.js 6 draws pages with Map#getOrInsertComputed, which current Safari and Chrome versions do not have yet.
for(const Type of [Map,WeakMap]){
  if(!Type.prototype.getOrInsertComputed)Object.defineProperty(Type.prototype,'getOrInsertComputed',{configurable:true,writable:true,value(key,make){if(this.has(key))return this.get(key);const value=make(key);this.set(key,value);return value}});
  if(!Type.prototype.getOrInsert)Object.defineProperty(Type.prototype,'getOrInsert',{configurable:true,writable:true,value(key,value){if(!this.has(key))this.set(key,value);return this.get(key)}});
}
let active=null;

function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n}
function btn(text,className,onClick,label){const b=el('button',className,text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',onClick);return b}
function fileKind(file,name){
  const type=String(file?.type||'').toLowerCase(),ext=String(name||file?.name||'').split('.').pop().toLowerCase();
  if(type==='application/pdf'||ext==='pdf')return 'pdf';
  if(type.startsWith('image/')||['jpg','jpeg','png','webp','gif','bmp','heic','heif','tif','tiff'].includes(ext))return 'image';
  return 'other';
}
function plainLines(text){return String(text||'').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)}

async function loadPdf(file){
  if(typeof loadPdfLib!=='function')throw new Error('PDF_LIB_UNAVAILABLE');
  const pdfjs=await loadPdfLib(),data=new Uint8Array(await file.arrayBuffer());
  return {pdfjs,pdf:await pdfjs.getDocument({data,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/standard_fonts/'}).promise};
}

// Renders every page as a canvas with pdf.js' text layer on top, so text can be selected like in a PDF reader.
async function renderPdfPages(host,file,width,isCurrent){
  const {pdfjs,pdf}=await loadPdf(file);
  const pages=[],ratio=Math.min(2.5,Math.max(1,global.devicePixelRatio||1));
  for(let p=1;p<=Math.min(pdf.numPages,30);p++){
    if(!isCurrent())return pages;
    const page=await pdf.getPage(p),base=page.getViewport({scale:1}),scale=width/base.width,viewport=page.getViewport({scale});
    if(!isCurrent())return pages;
    const box=el('div','docviewer-page');box.style.width=Math.floor(viewport.width)+'px';box.style.height=Math.floor(viewport.height)+'px';box.style.setProperty('--total-scale-factor',String(scale));box.style.setProperty('--scale-factor',String(scale));
    const canvas=el('canvas');canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.setAttribute('aria-hidden','true');
    box.append(canvas);host.append(box);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null}).promise;
    const content=await page.getTextContent();
    pages.push(content);
    if(pdfjs.TextLayer){
      const layer=el('div','textLayer');box.append(layer);
      try{await new pdfjs.TextLayer({textContentSource:content,container:layer,viewport}).render()}catch(err){console.warn('Tekstlaag',err);layer.remove()}
    }
  }
  return pages;
}
async function pdfTextLines(file){
  const {pdf}=await loadPdf(file),lines=[];
  for(let p=1;p<=Math.min(pdf.numPages,30);p++){
    const content=await (await pdf.getPage(p)).getTextContent();
    lines.push(...(typeof groupPdfTextItems==='function'?groupPdfTextItems(content.items):content.items.map(x=>x.str)));
  }
  return plainLines(lines.join('\n'));
}
async function recognizedLines(file,kind){
  if(kind==='image'&&typeof ocrImageFile==='function')return plainLines(await ocrImageFile(file));
  if(kind==='pdf'&&typeof readPdfStructure==='function'&&typeof ocrPdfPages==='function')return plainLines(await ocrPdfPages(await readPdfStructure(file)));
  return [];
}

async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true}
  catch(_){
    const area=el('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(__){}area.remove();return ok
  }
}

function textPanel(view){
  const panel=el('div','docviewer-text');
  const intro=el('p','docviewer-hint','Tik op een regel om hem te kopiëren. Plak hem daarna in het veld.');
  const list=el('div','docviewer-lines');list.setAttribute('role','list');
  const status=el('p','docviewer-status');status.setAttribute('role','status');
  panel.append(intro,status,list);
  function show(lines){
    list.replaceChildren();
    if(!lines.length){status.textContent='Er is geen tekst gevonden in dit document.';return}
    status.textContent='';
    const all=btn('Alle tekst kopiëren','btn small docviewer-copy-all',async()=>{toast(await copyText(lines.join('\n'))?'Alle tekst gekopieerd':'Kopiëren lukte niet. Selecteer de tekst zelf.')});
    list.append(all);
    lines.forEach(line=>{
      const row=btn('','docviewer-line',async()=>{
        if(String(getSelection?.()||'').trim())return;
        const ok=await copyText(line);
        row.classList.toggle('copied',ok);setTimeout(()=>row.classList.remove('copied'),1400);
        toast(ok?'Gekopieerd: '+(line.length>40?line.slice(0,40)+'…':line):'Kopiëren lukte niet. Selecteer de tekst zelf.');
      });
      row.setAttribute('role','listitem');
      row.append(el('span','docviewer-line-text',line),el('span','docviewer-line-copy','Kopieer'));
      list.append(row);
    });
  }
  async function load(){
    if(view.textLines){show(view.textLines);return}
    status.textContent='Tekst wordt gelezen…';
    try{
      let lines=view.kind==='pdf'?await pdfTextLines(view.file):[];
      if(lines.join('').length<30){
        status.replaceChildren(document.createTextNode(view.kind==='pdf'?'Dit is een scan. ':'Dit is een foto. '));
        const run=btn('Tekst herkennen','btn small',async()=>{
          run.disabled=true;status.textContent='Tekst herkennen… dit kan even duren.';
          try{view.textLines=await recognizedLines(view.file,view.kind);show(view.textLines)}
          catch(err){console.warn(err);status.textContent='Tekst herkennen lukte niet. Probeer het later opnieuw.'}
        });
        status.append(run);return
      }
      view.textLines=lines;show(lines)
    }catch(err){console.warn(err);status.textContent='De tekst kon niet worden gelezen.'}
  }
  return {panel,load};
}

// Shared renderer used by the full-screen viewer and the side panel in document review.
function createView(container,{file,name,url,compact=false}){
  const kind=fileKind(file,name),view={file,kind,zoom:1,textLines:null,token:0},pagesHost=el('div','docviewer-pages');
  container.append(pagesHost);
  let objectUrl=url||'';
  async function render(){
    const token=++view.token,current=()=>token===view.token&&pagesHost.isConnected;
    pagesHost.replaceChildren();
    const width=Math.max(220,Math.floor((pagesHost.clientWidth||container.clientWidth||600)-(compact?0:16))*view.zoom);
    if(kind==='image'){
      if(!objectUrl)objectUrl=URL.createObjectURL(file);
      const img=el('img','docviewer-image');img.alt=name||'Document';img.src=objectUrl;img.style.width=width+'px';img.draggable=false;pagesHost.append(img);return
    }
    if(kind==='pdf'){
      const loading=el('p','docviewer-status','Document laden…');pagesHost.append(loading);
      try{await renderPdfPages(pagesHost,file,width,current);loading.remove()}
      catch(err){
        console.warn('PDF tonen',err);if(!current())return;loading.remove();
        // Without pdf.js (offline) the browser's own PDF view is the fallback.
        if(!objectUrl)objectUrl=URL.createObjectURL(file);
        const frame=el('iframe','docviewer-frame');frame.title=name||'Document';frame.src=objectUrl;pagesHost.append(frame)
      }
      return
    }
    const empty=el('div','docviewer-empty');
    empty.append(el('strong','','Dit bestand kan hier niet worden getoond.'),el('span','','Download het om het te openen.'));
    if(!objectUrl)objectUrl=URL.createObjectURL(file);
    const link=el('a','btn','Downloaden');link.href=objectUrl;link.download=name||'document';empty.append(link);pagesHost.append(empty)
  }
  view.render=render;
  view.setZoom=z=>{view.zoom=Math.min(3,Math.max(.5,Math.round(z*100)/100));render()};
  view.dispose=()=>{view.token++;if(objectUrl&&!url)URL.revokeObjectURL(objectUrl)};
  return view;
}

function close(){
  if(!active)return;
  const current=active;active=null;
  current.view.dispose();current.root.remove();
  document.removeEventListener('keydown',current.onKey,true);
  global.removeEventListener('popstate',current.onPop);
  document.documentElement.classList.remove('docviewer-open');
  if(history.state?.boekunaDocumentViewer===current.historyToken)history.back();
  if(current.returnFocus?.isConnected)setTimeout(()=>current.returnFocus.focus(),0);
}

function open({file,name,url,tab='document'}={}){
  if(!file)return toast('Bestand niet gevonden');
  close();
  const root=el('div','docviewer');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',name||'Document');
  const head=el('div','docviewer-head');
  const title=el('strong','docviewer-title',name||'Document');
  const closeBtn=btn('Sluiten','btn docviewer-close',close,'Document sluiten');
  const tabs=el('div','docviewer-tabs');tabs.setAttribute('role','tablist');
  const docTab=btn('Document','docviewer-tab',()=>select('document'));docTab.setAttribute('role','tab');
  const textTab=btn('Tekst kopiëren','docviewer-tab',()=>select('text'));textTab.setAttribute('role','tab');
  tabs.append(docTab,textTab);
  const zoomOut=btn('−','docviewer-zoom',()=>view.setZoom(view.zoom-.25),'Uitzoomen'),zoomIn=btn('+','docviewer-zoom',()=>view.setZoom(view.zoom+.25),'Inzoomen');
  const zoom=el('div','docviewer-zoombar');zoom.append(zoomOut,zoomIn);
  const row=el('div','docviewer-head-row');row.append(title,closeBtn);
  const row2=el('div','docviewer-head-row');row2.append(tabs,zoom);
  head.append(row,row2);
  const body=el('div','docviewer-body');
  root.append(head,body);
  document.body.append(root);
  document.documentElement.classList.add('docviewer-open');
  const docPane=el('div','docviewer-pane');body.append(docPane);
  const view=createView(docPane,{file,name,url});
  const text=textPanel(view);text.panel.hidden=true;body.append(text.panel);
  function select(which){
    const isText=which==='text';
    docPane.hidden=isText;text.panel.hidden=!isText;zoom.hidden=isText||view.kind==='other';
    docTab.setAttribute('aria-selected',String(!isText));textTab.setAttribute('aria-selected',String(isText));
    if(isText)text.load();
  }
  if(view.kind==='other')textTab.hidden=true;
  // Pinch zoom stays inside the viewer, so the close button never moves off screen.
  let pinch=null;
  body.addEventListener('touchstart',e=>{if(e.touches.length===2&&!docPane.hidden){const [a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),zoom:view.zoom}}},{passive:true});
  body.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();const [a,b]=e.touches,d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);docPane.style.transform='scale('+Math.min(3/pinch.zoom,Math.max(.5/pinch.zoom,d/pinch.d))+')';docPane.dataset.pinch=String(d/pinch.d)},{passive:false});
  body.addEventListener('touchend',()=>{if(!pinch)return;const f=Number(docPane.dataset.pinch||1);docPane.style.transform='';delete docPane.dataset.pinch;const z=pinch.zoom*f;pinch=null;if(Math.abs(f-1)>.05)view.setZoom(z)});
  const onKey=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return}
    if(e.key==='Tab'){
      e.stopImmediatePropagation();
      const items=[...root.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
      if(!items.length)return;const first=items[0],last=items[items.length-1];
      if(!root.contains(document.activeElement)){e.preventDefault();first.focus();return}
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  };
  const historyToken='viewer-'+Date.now();
  const onPop=()=>{if(active&&history.state?.boekunaDocumentViewer!==active.historyToken){active.historyToken=null;close()}};
  history.pushState({...(history.state||{}),boekunaDocumentViewer:historyToken},'',location.href);
  active={root,view,onKey,onPop,historyToken,returnFocus:document.activeElement};
  document.addEventListener('keydown',onKey,true);
  global.addEventListener('popstate',onPop);
  select(tab);
  requestAnimationFrame(()=>{view.render();closeBtn.focus()});
}

async function openStored(fileId,name){
  try{
    const row=await getStoredFile(fileId);
    if(!row?.blob)return toast('Bestand niet gevonden');
    const file=new File([row.blob],name||row.name||'document',{type:row.type||row.blob.type||''});
    open({file,name:name||row.name});
  }catch(err){console.warn(err);toast('Bestand kon niet worden geopend.')}
}

global.BoekunaDocumentViewer=Object.freeze({open,close,openStored,createView,textPanel,isOpen:()=>!!active,mobile:()=>MOBILE.matches});
// Opening a document in a new browser tab left installed-app users without a way back. Use the viewer instead.
global.openStoredDocument=id=>{const d=(state.documents||[]).find(x=>String(x.fileId||'')===String(id));return openStored(id,d?.name)};
global.openDocumentPreview=id=>{const d=(state.documents||[]).find(x=>String(x.id)===String(id));if(!d?.fileId)return toast('Bestand niet gevonden');return openStored(d.fileId,d.name)};
})(globalThis);
