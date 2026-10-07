#!/usr/bin/env node

const args=process.argv.slice(2);
const readArg=(name,fallback='')=>{
  const i=args.indexOf('--'+name);
  return i>=0?String(args[i+1]??''):fallback;
};
const count=Number(readArg('count','1'));
const campaign=readArg('campaign','manual');
const durationDays=Number(readArg('duration','30'));
const codeExpiresAt=readArg('code-expires-at','')||null;

if(!Number.isInteger(count)||count<1||count>500)throw new Error('Gebruik --count tussen 1 en 500.');
if(durationDays!==30)throw new Error('BOEKUNA testcodes geven exact 30 dagen toegang.');
if(!campaign.trim())throw new Error('Gebruik een campaign/source label.');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_SERVICE_ROLE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
  throw new Error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn verplicht in de lokale adminomgeving.');
}

const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/generate_tester_invite_codes',{
  method:'POST',
  headers:{
    apikey:SUPABASE_SERVICE_ROLE_KEY,
    Authorization:'Bearer '+SUPABASE_SERVICE_ROLE_KEY,
    'content-type':'application/json',
    accept:'application/json'
  },
  body:JSON.stringify({
    p_count:count,
    p_campaign:campaign.trim(),
    p_duration_days:30,
    p_code_expires_at:codeExpiresAt
  })
});
const body=await response.json().catch(()=>null);
if(!response.ok){
  throw new Error('Testcodes genereren mislukt ('+response.status+'). Controleer serverconfiguratie en rechten.');
}
if(!Array.isArray(body)||body.length!==count){
  throw new Error('Onverwacht antwoord bij testcodegeneratie.');
}

process.stdout.write(body.map(row=>String(row.code||'')).filter(Boolean).join('\n')+'\n');
