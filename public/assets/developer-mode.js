(function(){
  'use strict';

  const PRODUCTION_ORIGINS=new Set([
    'https://app.boekuna.nl',
    'https://boekuna.nl',
    'https://www.boekuna.nl',
    'https://boekuna-boekhouding.onrender.com',
    'https://kwinest-boekhouding.onrender.com'
  ]);
  const TICKET_KEY='boekuna-developer-session-v1';
  const VALID_ENVIRONMENTS=new Set(['development','preview','staging']);
  let boundUserId='';

  function config(){
    const raw=window.BOEKUNA_DEV_MODE_CONFIG||{};
    return {
      enabled:raw.enabled===true,
      environment:String(raw.environment||'').trim().toLowerCase(),
      allowedOrigins:Array.isArray(raw.allowedOrigins)?raw.allowedOrigins.map(String):[]
    };
  }

  function evaluate(origin=location.origin){
    const cfg=config();
    const normalized=String(origin||'').replace(/\/$/,'');
    return {
      allowed:cfg.enabled===true &&
        VALID_ENVIRONMENTS.has(cfg.environment) &&
        !PRODUCTION_ORIGINS.has(normalized) &&
        cfg.allowedOrigins.includes(normalized),
      origin:normalized,
      environment:cfg.environment
    };
  }

  function removeStoredTicket(){
    let hadState=false;
    try{
      hadState=!!sessionStorage.getItem(TICKET_KEY);
      sessionStorage.removeItem(TICKET_KEY)
    }catch(_error){}
    const badge=document.getElementById('boekunaDeveloperModeBadge');
    if(badge){hadState=true;badge.remove()}
    if(hadState){
      try{window.dispatchEvent(new CustomEvent('boekuna:developer-mode-invalidated'))}catch(_error){}
    }
  }

  function readStoredTicket(){
    try{
      const policy=evaluate();
      if(!policy.allowed){removeStoredTicket();return null}
      const raw=sessionStorage.getItem(TICKET_KEY);
      if(!raw){document.getElementById('boekunaDeveloperModeBadge')?.remove();return null}
      const value=JSON.parse(raw);
      if(!value||typeof value!=='object'){removeStoredTicket();return null}
      if(String(value.origin||'')!==policy.origin){removeStoredTicket();return null}
      if(String(value.environment||'')!==policy.environment){removeStoredTicket();return null}
      if(!value.token||Number(value.expires_at||0)*1000<=Date.now()+15000){
        removeStoredTicket();
        return null;
      }
      return value;
    }catch(_error){
      removeStoredTicket();
      return null;
    }
  }

  function readTicket(expectedUserId=boundUserId){
    const userId=String(expectedUserId||'').trim();
    if(!userId)return null;
    const value=readStoredTicket();
    if(!value)return null;
    if(String(value.user_id||'')!==userId){
      removeStoredTicket();
      return null;
    }
    return value;
  }

  function bindUser(userId=''){
    const next=String(userId||'').trim();
    if(!next){
      boundUserId='';
      removeStoredTicket();
      return false;
    }
    const stored=readStoredTicket();
    boundUserId=next;
    if(stored&&String(stored.user_id||'')!==next)removeStoredTicket();
    return !!readTicket(next);
  }

  function storeTicket(ticket){
    const policy=evaluate();
    const userId=String(ticket?.user_id||'').trim();
    if(!policy.allowed||!ticket?.token||!userId||!boundUserId||userId!==boundUserId){
      removeStoredTicket();
      return;
    }
    sessionStorage.setItem(TICKET_KEY,JSON.stringify({
      token:String(ticket.token),
      expires_at:Number(ticket.expires_at||0),
      user_id:userId,
      origin:policy.origin,
      environment:policy.environment
    }));
  }

  function clear(){
    boundUserId='';
    removeStoredTicket();
  }

  function decorateHeaders(extra={}){
    const headers=new Headers(extra||{});
    const ticket=readTicket();
    if(ticket?.token)headers.set('x-boekuna-dev-session',ticket.token);
    const out={};
    headers.forEach((value,key)=>{out[key]=value});
    return out;
  }

  async function bootstrap({supabaseClient,supabaseUrl,publishableKey,accessKey=''}){
    const policy=evaluate();
    if(!policy.allowed){
      clear();
      return {active:false,reason:'environment_not_allowed'};
    }

    const current=await supabaseClient.auth.getSession();
    const session=current?.data?.session||null;
    if(session?.user?.id)bindUser(session.user.id);
    // A browser-stored ticket is never trusted by itself. Every page load revalidates
    // the real Supabase QA session through the server-side bootstrap.
    if(!session?.access_token&&!String(accessKey||'').trim()){
      return {active:false,needsAccessKey:true};
    }

    const headers={
      'content-type':'application/json',
      'apikey':publishableKey
    };
    if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
    if(String(accessKey||'').trim())headers['x-boekuna-dev-access']=String(accessKey).trim();

    const response=await fetch(String(supabaseUrl).replace(/\/$/,'')+'/functions/v1/dev-session',{
      method:'POST',
      headers,
      body:'{}',
      cache:'no-store'
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok){
      clear();
      const error=new Error(body?.error||'Developer Mode kon niet worden gestart.');
      error.code=body?.code||'DEVELOPER_MODE_BOOTSTRAP_FAILED';
      error.status=response.status;
      throw error;
    }

    if(body?.session?.access_token&&body?.session?.refresh_token){
      const setResult=await supabaseClient.auth.setSession({
        access_token:body.session.access_token,
        refresh_token:body.session.refresh_token
      });
      if(setResult?.error)throw setResult.error;
    }

    const effective=await supabaseClient.auth.getSession();
    const userId=String(effective?.data?.session?.user?.id||body?.user_id||'').trim();
    if(!userId){
      clear();
      throw new Error('Developer Mode kreeg geen geldige authenticated user.');
    }
    bindUser(userId);
    storeTicket({
      token:body?.developer_session?.token,
      expires_at:body?.developer_session?.expires_at,
      user_id:userId
    });
    return {active:!!readTicket(userId),user_id:userId};
  }

  async function bootstrapInteractive(options){
    try{
      let result=await bootstrap(options);
      if(result.needsAccessKey){
        const accessKey=window.prompt('BOEKUNA Developer Mode — voer de tijdelijke preview-toegangscode in:')||'';
        if(!accessKey.trim())return {active:false,cancelled:true};
        result=await bootstrap({...options,accessKey});
      }
      return result;
    }catch(error){
      console.warn('Developer Mode bootstrap',error?.code||error?.message||error);
      return {active:false,error};
    }
  }

  function isActive(userId=boundUserId){
    return !!readTicket(String(userId||'').trim());
  }

  function mountIndicator(){
    if(!isActive()){
      document.getElementById('boekunaDeveloperModeBadge')?.remove();
      return;
    }
    let badge=document.getElementById('boekunaDeveloperModeBadge');
    if(badge)return;
    badge=document.createElement('div');
    badge.id='boekunaDeveloperModeBadge';
    badge.textContent='DEV MODE';
    badge.setAttribute('role','status');
    badge.style.cssText='position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 9px;border-radius:999px;background:#fff3cd;color:#594700;border:1px solid #ead589;font:700 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 4px 14px rgba(0,0,0,.08)';
    document.body.appendChild(badge);
  }

  window.BoekunaDeveloperMode=Object.freeze({
    bindUser,
    bootstrap,
    bootstrapInteractive,
    clear,
    decorateHeaders,
    evaluate,
    isActive,
    isEnabledHere:()=>evaluate().allowed,
    mountIndicator
  });
})();
