// BOEKUNA Dark Mode: derive dark equivalents of every hardcoded colour in the app's CSS.
//
// The app's styles grew in layers (index.html <style> blocks plus later polish files), and
// many of them hardcode light colours with !important. Rewriting all of them by hand is
// fragile, so the build reads the real cascade and emits, for every colour declaration, the
// same declaration under html[data-theme="dark"] with a mapped colour:
//   - neutral light surfaces become BOEKUNA charcoal surfaces (never pure black);
//   - dark ink becomes light ink, faint ink stays readable;
//   - soft status tints become dark tints of the same hue (meaning is kept);
//   - saturated mid colours (BOEKUNA green, chart and status fills) stay exactly the same.
// Declarations that already use tokens are re-emitted unchanged so the relative cascade order
// of all colour rules is preserved. Hand-written refinements live in theme-dark.css, which
// loads after this file. No CSS invert/filter is used anywhere.

const COLOR_PROPS=new Set([
  'color','background','background-color','background-image','border','border-color','border-top','border-right','border-bottom','border-left',
  'border-top-color','border-right-color','border-bottom-color','border-left-color','border-block','border-block-start','border-block-end','border-inline','border-inline-start','border-inline-end',
  'outline','outline-color','box-shadow','fill','stroke','caret-color','-webkit-text-fill-color','text-decoration-color','column-rule','accent-color','scrollbar-color','-webkit-tap-highlight-color'
]);
const NAMED={white:[255,255,255,1],black:[0,0,0,1]};
const COLOR_RE=/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

function parseColor(raw){
  const s=raw.trim().toLowerCase();
  if(NAMED[s])return NAMED[s].slice();
  if(s[0]==='#'){
    let h=s.slice(1);
    if(h.length===3||h.length===4)h=h.split('').map(c=>c+c).join('');
    const n=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
    return [...n,h.length===8?parseInt(h.slice(6,8),16)/255:1];
  }
  const m=s.match(/rgba?\(([^)]*)\)/);if(!m)return null;
  const parts=m[1].split(/[\s,/]+/).filter(Boolean);
  if(parts.length<3)return null;
  const ch=parts.slice(0,3).map(p=>p.endsWith('%')?parseFloat(p)*2.55:parseFloat(p));
  let a=parts[3]==null?1:(parts[3].endsWith('%')?parseFloat(parts[3])/100:parseFloat(parts[3]));
  if(ch.some(v=>!Number.isFinite(v))||!Number.isFinite(a))return null;
  return [...ch,a];
}
function toHsl([r,g,b]){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;h*=60}
  return [h,s,l];
}
function fromHsl(h,s,l){
  const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return [f(0),f(8),f(4)].map(v=>Math.round(Math.max(0,Math.min(1,v))*255));
}
function fmt([r,g,b],a){
  if(a<1)return 'rgba('+r+','+g+','+b+','+(Math.round(a*1000)/1000)+')';
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}
// BOEKUNA charcoal hue for neutral surfaces.
const NEUTRAL_HUE=205,NEUTRAL_SAT=0.12;

export function mapColor(raw,role,ruleHasKeptBackground=false){
  const c=parseColor(raw);if(!c)return raw;
  const [r,g,b,a]=c;if(a===0)return raw;
  const [h,s,l]=toHsl([r,g,b]);
  const chroma=(Math.max(r,g,b)-Math.min(r,g,b))/255;
  const neutral=chroma<0.09;
  if(role==='shadow'){
    if(a<0.6)return raw;                           // soft shadows stay shadows
    role='border';
  }
  if(a<0.6&&neutral){
    // Translucent overlays: dark veils become light veils and vice versa.
    // Light glass becomes dark glass. Dark veils: backdrops (strong alpha) stay dark,
    // subtle hover/zebra tints become light tints so they stay visible on charcoal.
    if(l>=0.5)return fmt([18,22,25],Math.min(1,a+0.1));
    return a>=0.25?fmt([5,7,9],Math.min(0.75,a+0.2)):fmt([255,255,255],Math.min(1,a*1.25));
  }
  if(role==='bg'){
    if(neutral){
      if(l>=0.985)return fmt([26,31,35],a);            // white cards → --dk-surface #1A1F23
      if(l>=0.955)return fmt([18,22,25],a);            // page backgrounds → --dk-bg #121619
      if(l>=0.9)return fmt([33,39,44],a);              // subtle fills → --dk-raised #21272C
      if(l>=0.55)return fmt(fromHsl(NEUTRAL_HUE,NEUTRAL_SAT,0.11+(1-l)*0.7),a);
      return fmt(fromHsl(NEUTRAL_HUE,NEUTRAL_SAT,Math.max(0.16,Math.min(0.24,l+0.08))),a); // dark chips stay dark, slightly raised
    }
    if(l>0.82)return fmt(fromHsl(h,Math.min(s,0.5)*0.75,0.15),a);  // soft status tints → dark tint, same hue
    if(l<0.22)return fmt(fromHsl(h,Math.min(s,0.5),Math.max(l,0.18)),a);
    return raw;                                                    // brand/status/chart fills keep their colour
  }
  if(role==='border'){
    if(neutral)return l>0.6?fmt(fromHsl(NEUTRAL_HUE,NEUTRAL_SAT,0.18+(1-l)*0.45),a):fmt(fromHsl(NEUTRAL_HUE,NEUTRAL_SAT,0.95-l*0.55),a);
    if(l>0.75)return fmt(fromHsl(h,Math.min(s,0.5)*0.7,0.3),a);
    if(l<0.4)return fmt(fromHsl(h,s,1-l*0.6),a);
    return raw;
  }
  // Text-like
  if(ruleHasKeptBackground)return raw;                // ink on a kept brand/status fill keeps its contrast
  if(neutral){
    if(l>=0.6)return raw;                             // already light ink (on dark or coloured fills)
    return fmt(fromHsl(NEUTRAL_HUE,0.08,0.95-l*0.55),a);
  }
  if(l<0.55)return fmt(fromHsl(h,Math.min(1,s),Math.max(0.7,1-l*0.6)),a);
  return raw;
}

function roleOf(prop){
  if(prop.startsWith('background'))return 'bg';
  if(prop==='box-shadow')return 'shadow';
  if(prop.startsWith('border')||prop.startsWith('outline')||prop==='column-rule')return 'border';
  return 'text';
}

// --- minimal CSS parser (comments, strings, nested blocks) ---
function stripComments(css){return css.replace(/\/\*[\s\S]*?\*\//g,'')}
function parseBlocks(css){
  const out=[];let i=0;
  while(i<css.length){
    while(i<css.length&&/\s/.test(css[i]))i++;
    if(i>=css.length)break;
    let j=i,depthParen=0,quote=null;
    while(j<css.length){
      const ch=css[j];
      if(quote){if(ch==='\\'){j+=2;continue}if(ch===quote)quote=null;j++;continue}
      if(ch==='"'||ch==="'"){quote=ch;j++;continue}
      if(ch==='(')depthParen++;else if(ch===')')depthParen--;
      else if(depthParen===0&&(ch==='{'||ch===';'))break;
      j++;
    }
    const prelude=css.slice(i,j).trim();
    if(j>=css.length)break;
    if(css[j]===';'){i=j+1;continue}            // @import/@charset etc.
    let depth=1,k=j+1;quote=null;
    while(k<css.length&&depth>0){
      const ch=css[k];
      if(quote){if(ch==='\\'){k+=2;continue}if(ch===quote)quote=null;k++;continue}
      if(ch==='"'||ch==="'")quote=ch;else if(ch==='{')depth++;else if(ch==='}')depth--;
      k++;
    }
    out.push({prelude,body:css.slice(j+1,k-1)});
    i=k;
  }
  return out;
}
function splitDecls(body){
  const out=[];let cur='',paren=0,quote=null;
  for(let i=0;i<body.length;i++){
    const ch=body[i];
    if(quote){cur+=ch;if(ch==='\\'){cur+=body[++i]||'';continue}if(ch===quote)quote=null;continue}
    if(ch==='"'||ch==="'"){quote=ch;cur+=ch;continue}
    if(ch==='(')paren++;else if(ch===')')paren--;
    if(ch===';'&&paren===0){out.push(cur);cur='';continue}
    cur+=ch;
  }
  if(cur.trim())out.push(cur);
  return out.map(d=>{const at=d.indexOf(':');if(at<0)return null;return {prop:d.slice(0,at).trim().toLowerCase(),value:d.slice(at+1).trim()}}).filter(Boolean);
}
function splitSelectors(sel){
  const out=[];let cur='',paren=0,bracket=0;
  for(const ch of sel){
    if(ch==='(')paren++;else if(ch===')')paren--;else if(ch==='[')bracket++;else if(ch===']')bracket--;
    if(ch===','&&!paren&&!bracket){out.push(cur.trim());cur='';continue}
    cur+=ch;
  }
  if(cur.trim())out.push(cur.trim());
  return out;
}
const PREFIX='html[data-theme="dark"]';
function prefixSelector(sel){
  if(/^:root\b/.test(sel))return PREFIX+sel.slice(5);
  if(/^html\b/.test(sel))return PREFIX+sel.slice(4);
  return PREFIX+' '+sel;
}
// Ink tokens flip to light in Dark Mode; on a kept BOEKUNA green/status fill the ink must stay dark.
const INK_TOKEN_RE=/var\(--(?:app-ink|app-charcoal|ink|accent-ink|text-primary|sc-ink)\b[^)]*\)/g;
const KEPT_FILL_TOKEN_RE=/var\(--(?:app-brand|app-brand-hover|app-brand-pressed|app-green|accent|brand-primary|brand-primary-hover|sc-green)\)/;
function themedValue(prop,value,keptBg){
  if(keptBg&&roleOf(prop)==='text'&&!prop.startsWith('border'))value=value.replace(INK_TOKEN_RE,'#10150F');
  if(/var\(/.test(value)&&!COLOR_RE.test(value)){COLOR_RE.lastIndex=0;return value}
  COLOR_RE.lastIndex=0;
  const role=roleOf(prop);
  return value.replace(COLOR_RE,m=>mapColor(m,role,keptBg));
}
function backgroundIsKept(decls){
  for(const d of decls){
    if(d.prop!=='background'&&d.prop!=='background-color')continue;
    if(KEPT_FILL_TOKEN_RE.test(d.value))return true;
    const m=d.value.match(COLOR_RE);COLOR_RE.lastIndex=0;if(!m)continue;
    const c=parseColor(m[0]);if(!c||c[3]<0.6)continue;
    if(mapColor(m[0],'bg')===m[0])return true;
  }
  return false;
}

function processRules(css,skipSelector){
  let out='';
  for(const block of parseBlocks(css)){
    const p=block.prelude;
    if(p.startsWith('@')){
      const name=p.slice(1).split(/[\s({]/)[0].toLowerCase();
      if(name==='media'){
        if(/\bprint\b/.test(p)&&!/\bscreen\b/.test(p))continue;
        const inner=processRules(block.body,skipSelector);
        if(inner)out+=p+'{'+inner+'}\n';
      }else if(name==='supports'||name==='layer'||name==='container'){
        const inner=processRules(block.body,skipSelector);
        if(inner)out+=p+'{'+inner+'}\n';
      }
      continue; // @font-face, @keyframes, @page: no theme colours
    }
    const selectors=splitSelectors(p).filter(s=>!skipSelector(s));
    if(!selectors.length)continue;
    const decls=splitDecls(block.body).filter(d=>COLOR_PROPS.has(d.prop.replace(/^--.*/,'')));
    if(!decls.length)continue;
    const keptBg=backgroundIsKept(decls);
    const themed=decls.map(d=>{
      const important=/!\s*important\s*$/i.test(d.value);
      const value=d.value.replace(/!\s*important\s*$/i,'').trim();
      return d.prop+':'+themedValue(d.prop,value,keptBg)+(important?'!important':'');
    });
    out+=selectors.map(prefixSelector).join(',')+'{'+themed.join(';')+'}\n';
  }
  return out;
}

// sources: [{css, media}] in cascade order.
export function generateDarkTheme(sources){
  const skip=sel=>/@page|::-webkit-scrollbar|\.marketing|\.mk-|\.landing|#landing|\.product-window|\.print-|\.invoice-paper|data-theme|settings-theme-swatch|\.fb-shot img/.test(sel);
  let out='/* Generated by scripts/theme-dark-generate.mjs from the app CSS cascade. Do not edit. */\n';
  for(const {css,media} of sources){
    const body=processRules(stripComments(css),skip);
    if(!body)continue;
    out+=media?'@media '+media+'{\n'+body+'}\n':body;
  }
  return out;
}

// Collect the real stylesheet cascade from the generated app document.
export function appCssSources(appHtml,readAsset){
  const sources=[];
  const withoutScripts=appHtml.replace(/<script\b[\s\S]*?<\/script>/gi,m=>' '.repeat(0));
  const re=/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/gi;let m;
  while((m=re.exec(withoutScripts))){
    if(m[1]!=null){sources.push({css:m[1],media:null});continue}
    const tag=m[0];const href=(tag.match(/href="([^"]+)"/)||[])[1]||'';
    const media=(tag.match(/media="([^"]+)"/)||[])[1]||null;
    const file=href.replace(/^\/assets\//,'').replace(/\?.*$/,'');
    if(!href.startsWith('/assets/')||/theme-dark/.test(file))continue;
    const css=readAsset(file);if(css!=null)sources.push({css,media});
  }
  return sources;
}
