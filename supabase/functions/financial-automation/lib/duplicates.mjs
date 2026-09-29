function norm(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
async function digest(v){const b=v instanceof Uint8Array?v:new TextEncoder().encode(String(v||'')),d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('')}
export const sha256Hex=digest;
export async function textFingerprint(v){return digest(norm(v).replace(/[^a-z0-9]+/g,' ').trim())}
export async function supplierFingerprint(v){return digest(norm(v).replace(/[^a-z0-9]+/g,''))}
export function hammingHex(a,b){if(!/^[0-9a-f]{16}$/i.test(String(a||''))||!/^[0-9a-f]{16}$/i.test(String(b||'')))return null;let n=0;for(let i=0;i<16;i++){let x=parseInt(a[i],16)^parseInt(b[i],16);while(x){n+=x&1;x>>=1}}return n}
function cents(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?Math.round((n+(n>=0?Number.EPSILON:-Number.EPSILON))*100):null}
export function normalizeDuplicateFingerprint(v){return {document_ref:String(v&&v.document_ref||''),document_sha256:String(v&&v.document_sha256||'').toLowerCase(),perceptual_hash:String(v&&v.perceptual_hash||'').toLowerCase(),supplier_fingerprint:String(v&&v.supplier_fingerprint||''),document_date:String(v&&v.document_date||''),gross_cents:v&&v.gross_cents!=null?Number(v.gross_cents):cents(v&&v.gross),vat_cents:v&&v.vat_cents!=null?Number(v.vat_cents):cents(v&&v.vat),text_fingerprint:String(v&&v.text_fingerprint||''),document_type:String(v&&v.document_type||'')}}
export function compareDuplicateFingerprint(a0,b0){
 const a=normalizeDuplicateFingerprint(a0),b=normalizeDuplicateFingerprint(b0),reasons=[];
 if(a.document_sha256&&a.document_sha256===b.document_sha256)return {state:'exact_duplicate',score:100,reasons:['exact_sha256'],perceptual_distance:0};
 let score=0,strong=false,distance=hammingHex(a.perceptual_hash,b.perceptual_hash);
 if(distance!=null&&distance<=4){score+=55;strong=true;reasons.push('perceptual_0_4')}else if(distance!=null&&distance<=8){score+=45;strong=true;reasons.push('perceptual_5_8')}else if(distance!=null&&distance<=12){score+=25;reasons.push('perceptual_9_12')}
 if(a.text_fingerprint&&a.text_fingerprint===b.text_fingerprint){score+=35;strong=true;reasons.push('ocr_text')}
 if(a.supplier_fingerprint&&a.supplier_fingerprint===b.supplier_fingerprint){score+=10;reasons.push('supplier')}
 if(a.document_date&&a.document_date===b.document_date){score+=10;reasons.push('date')}
 if(a.gross_cents!=null&&a.gross_cents===b.gross_cents){score+=10;reasons.push('gross')}
 if(a.vat_cents!=null&&a.vat_cents===b.vat_cents){score+=5;reasons.push('vat')}
 if(a.document_type&&a.document_type===b.document_type){score+=5;reasons.push('document_type')}
 return {state:strong&&score>=55?'possible_duplicate':'distinct',score:Math.min(99,score),reasons,perceptual_distance:distance};
}
export function findDuplicateCandidates(candidate,rows,{limit=5}={}){return (rows||[]).map(row=>({row,comparison:compareDuplicateFingerprint(candidate,row)})).filter(x=>x.comparison.state!=='distinct').sort((a,b)=>b.comparison.score-a.comparison.score).slice(0,limit).map(x=>({document_ref:x.row.document_ref,created_at:x.row.created_at||null,state:x.comparison.state,score:x.comparison.score,reasons:x.comparison.reasons,perceptual_distance:x.comparison.perceptual_distance}))}
