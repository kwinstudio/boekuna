const LENGTHS={AD:24,AE:23,AL:28,AT:20,AZ:28,BA:20,BE:16,BG:22,BH:22,BR:29,BY:28,CH:21,CR:22,CY:28,CZ:24,DE:22,DK:18,DO:28,EE:20,EG:29,ES:24,FI:18,FO:18,FR:27,GB:22,GE:22,GI:23,GL:18,GR:27,GT:28,HR:21,HU:28,IE:22,IL:23,IQ:23,IS:26,IT:27,JO:30,KW:30,KZ:20,LB:28,LC:32,LI:21,LT:20,LU:20,LV:21,MC:27,MD:24,ME:22,MK:19,MR:27,MT:31,MU:30,NL:18,NO:15,PK:24,PL:28,PS:29,PT:25,QA:29,RO:24,RS:22,SA:24,SC:31,SE:24,SI:19,SK:24,SM:27,ST:25,SV:28,TL:23,TN:24,TR:26,UA:29,VA:22,VG:24,XK:20};
export const normalizeIban=v=>String(v||'').replace(/[\s-]+/g,'').toUpperCase();
export const normalizeBic=v=>String(v||'').replace(/\s+/g,'').toUpperCase();
function mod97(s){let r=0;for(const c of s){const d=c>='A'&&c<='Z'?String(c.charCodeAt(0)-55):c;if(!/^\d+$/.test(d))return -1;for(const x of d)r=(r*10+Number(x))%97}return r}
export function validateIban(value){
 const normalized=normalizeIban(value),country=normalized.slice(0,2),expectedLength=LENGTHS[country]||null,errors=[];
 if(!normalized)errors.push('IBAN_EMPTY');
 if(normalized&&!/^[A-Z0-9]+$/.test(normalized))errors.push('IBAN_CHARACTERS');
 if(normalized&&!/^[A-Z]{2}\d{2}/.test(normalized))errors.push('IBAN_PREFIX');
 if(normalized&&!expectedLength)errors.push('IBAN_COUNTRY_UNSUPPORTED');
 if(expectedLength&&normalized.length!==expectedLength)errors.push('IBAN_LENGTH');
 if(!errors.length&&mod97(normalized.slice(4)+normalized.slice(0,4))!==1)errors.push('IBAN_CHECKSUM');
 return {normalized,country:country||null,expectedLength,valid:!errors.length,status:errors.length?'invalid':'valid',errors};
}
export function validateBic(value,ibanValue=''){
 const normalized=normalizeBic(value),errors=[];
 if(!normalized)errors.push('BIC_EMPTY');
 if(normalized&&!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalized))errors.push('BIC_SYNTAX');
 const iban=normalizeIban(ibanValue);
 if(!errors.length&&iban&&normalized.slice(4,6)!==iban.slice(0,2))errors.push('IBAN_BIC_COUNTRY_MISMATCH');
 return {normalized,country:normalized.length>=6?normalized.slice(4,6):null,valid:!errors.length,status:errors.length?'invalid':'valid',errors};
}
const OCR={O:'0',I:'1',L:'1',S:'5',B:'8',Z:'2'};
export function analyzeOcrIban(value){
 const exact=validateIban(value);if(exact.valid)return {...exact,status:'valid',candidates:[],corrected:false};
 const source=normalizeIban(value),idx=[];for(let i=4;i<source.length;i++)if(OCR[source[i]])idx.push(i);
 const candidates=[];const max=Math.min(idx.length,6);
 for(let mask=1;mask<(1<<max)&&candidates.length<8;mask++){const chars=[...source];for(let b=0;b<max;b++)if(mask&(1<<b))chars[idx[b]]=OCR[chars[idx[b]]];const c=chars.join('');if(validateIban(c).valid)candidates.push(c)}
 return {...exact,status:candidates.length?'uncertain':'invalid',candidates:[...new Set(candidates)],corrected:false};
}
export const IBAN_COUNTRY_LENGTHS=LENGTHS;
