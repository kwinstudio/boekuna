import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export const routes=['/','/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/','/privacy/','/voorwaarden/','/support/','/account-verwijderen/','/404.html'];
export const widths=[320,360,375,390,393,430,768,1024,1280,1440,1920];
export const slug=route=>route==='/'?'home':route.replaceAll('/','').replace('.html','');
export async function settleImages(page){
  await page.locator('img').evaluateAll(async images=>{
    images.forEach(img=>img.loading='eager');
    await Promise.all(images.map(img=>img.decode()));
  });
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
export async function serveMarketing(directory){
  const root=path.resolve(directory);
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain','.xml':'application/xml','.ttf':'font/ttf','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
      res.writeHead(404);return res.end('Not found');
    }
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {base:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

// Layout/order/classes are deliberately excluded. Every original sentence,
// heading, destination, state, image, label and validation rule is a contract.
export function contentSnapshot(){
  const norm=s=>(s||'').replace(/\s+/g,' ').trim();
  const attrs=(el,keys)=>Object.fromEntries(keys.map(k=>[k,el.getAttribute(k)]));
  const list=(selector,fn)=>Array.from(document.querySelectorAll(selector),fn).map(x=>typeof x==='string'?x:JSON.stringify(x)).sort();
  const words=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(!node.parentElement.closest('script,style,noscript,[data-editorial-decoration],.editorial-skip'))words.push(...(node.textContent.match(/\S+/g)||[]));
  }
  return {
    words:words.sort(),
    headings:list('h1,h2,h3,h4,h5,h6',el=>({tag:el.tagName,text:norm(el.textContent)})),
    bodycopy:list('p,li,blockquote,figcaption,label,legend,option',el=>({tag:el.tagName,text:norm(el.textContent)})),
    links:list('a[href]:not(.editorial-skip)',el=>({text:norm(el.textContent),...attrs(el,['href','target','rel','aria-label'])})),
    controls:list('button,summary',el=>({tag:el.tagName,text:norm(el.textContent),...attrs(el,['type','name','value','aria-label','aria-controls'])})),
    images:list('img,source',el=>({tag:el.tagName,...attrs(el,['src','srcset','media','alt','width','height'])})),
    forms:list('form',el=>attrs(el,['id','action','method'])),
    fields:list('input,select,textarea',el=>({tag:el.tagName,...attrs(el,['id','name','type','required','pattern','minlength','maxlength','min','max','step','placeholder','autocomplete','value'])})),
    seo:{title:document.title,lang:document.documentElement.lang,meta:list('meta',el=>attrs(el,['name','property','http-equiv','content'])),canonical:list('link[rel="canonical"]',el=>el.getAttribute('href')),schema:list('script[type="application/ld+json"]',el=>norm(el.textContent))},
    sections:Array.from(document.querySelectorAll('main section'),el=>({id:el.id,heading:norm(el.querySelector('h1,h2')?.textContent),text:norm(el.textContent)}))
  };
}

export async function dynamicStates(page){
  const result={};
  for(const key of ['facturen','documenten','btw','rapportages']){
    const tab=page.locator('[data-kz-tab="'+key+'"]');
    if(!await tab.count())continue;
    await tab.click();
    result['product:'+key]=await page.locator('.kz-product-stage').evaluate(el=>({text:el.textContent.replace(/\s+/g,' ').trim(),link:el.querySelector('a')?.getAttribute('href')||null}));
  }
  for(const key of ['without','with']){
    const tab=page.locator('[data-compare="'+key+'"]');
    if(!await tab.count())continue;
    await tab.click();
    result['compare:'+key]=await page.locator('.kz-compare-panel').evaluate(el=>el.textContent.replace(/\s+/g,' ').trim());
  }
  return result;
}
