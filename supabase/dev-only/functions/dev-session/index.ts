import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PRODUCTION_ORIGINS=new Set([
  "https://app.boekuna.nl",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "https://boekuna-boekhouding.onrender.com",
  "https://kwinest-boekhouding.onrender.com"
]);
const VALID_ENVIRONMENTS=new Set(["development","preview","staging"]);
const normalize=(value:string)=>String(value||"").trim().replace(/\/$/,"");
const environment=String(Deno.env.get("BOEKUNA_DEV_MODE")||"").trim().toLowerCase();
const configuredOrigins=String(Deno.env.get("BOEKUNA_DEV_ALLOWED_ORIGINS")||"")
  .split(",").map(normalize).filter(Boolean);
const allowedOrigins=new Set(configuredOrigins);
const misconfiguredOrigin=configuredOrigins.some(origin=>PRODUCTION_ORIGINS.has(origin));
const modeEnabled=VALID_ENVIRONMENTS.has(environment)&&!misconfiguredOrigin;

function cors(origin:string){
  const allowed=modeEnabled&&!PRODUCTION_ORIGINS.has(origin)&&allowedOrigins.has(origin);
  return {
    "access-control-allow-origin":allowed?origin:"null",
    "access-control-allow-methods":"POST,OPTIONS",
    "access-control-allow-headers":"authorization,apikey,content-type,x-boekuna-dev-access",
    "cache-control":"no-store",
    "vary":"Origin"
  };
}
function json(origin:string,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"content-type":"application/json"}});
}
function randomToken(){
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function uuidLike(value:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async(req:Request)=>{
  const origin=normalize(req.headers.get("origin")||"");
  if(req.method==="OPTIONS"){
    if(!modeEnabled||PRODUCTION_ORIGINS.has(origin)||!allowedOrigins.has(origin))return json(origin,{error:"Developer Mode is hier niet beschikbaar.",code:"DEV_MODE_ORIGIN_DENIED"},403);
    return new Response(null,{status:204,headers:cors(origin)});
  }
  if(req.method!=="POST")return json(origin,{error:"Ongeldige aanvraag.",code:"METHOD_NOT_ALLOWED"},405);
  if(!modeEnabled)return json(origin,{error:"Developer Mode staat uit.",code:misconfiguredOrigin?"DEV_MODE_MISCONFIGURED":"DEV_MODE_DISABLED"},503);
  if(PRODUCTION_ORIGINS.has(origin)||!allowedOrigins.has(origin))return json(origin,{error:"Developer Mode is hier niet beschikbaar.",code:"DEV_MODE_ORIGIN_DENIED"},403);

  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const expectedUserId=String(Deno.env.get("BOEKUNA_DEV_USER_ID")||"").trim();
  const expectedEmail=String(Deno.env.get("BOEKUNA_DEV_USER_EMAIL")||"").trim();
  const expectedPassword=String(Deno.env.get("BOEKUNA_DEV_USER_PASSWORD")||"");
  const expectedAccessKey=String(Deno.env.get("BOEKUNA_DEV_ACCESS_KEY")||"");
  if(!url||!anon||!service||!uuidLike(expectedUserId)||!expectedAccessKey){
    return json(origin,{error:"Developer Mode is niet volledig geconfigureerd.",code:"DEV_MODE_NOT_CONFIGURED"},503);
  }

  let user:any=null;
  let issuedSession:any=null;
  const authHeader=req.headers.get("authorization")||"";
  if(authHeader.startsWith("Bearer ")){
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await userClient.auth.getUser();
    if(!error&&data?.user?.id===expectedUserId)user=data.user;
  }

  if(!user){
    const accessKey=String(req.headers.get("x-boekuna-dev-access")||"");
    if(!accessKey||accessKey!==expectedAccessKey)return json(origin,{error:"Preview-toegang geweigerd.",code:"DEV_MODE_ACCESS_DENIED"},403);
    if(!expectedEmail||!expectedPassword)return json(origin,{error:"QA-login is niet volledig geconfigureerd.",code:"DEV_MODE_QA_LOGIN_NOT_CONFIGURED"},503);
    const signInClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await signInClient.auth.signInWithPassword({email:expectedEmail,password:expectedPassword});
    if(error||!data?.user||!data?.session)return json(origin,{error:"QA-login kon niet worden gestart.",code:"DEV_MODE_QA_LOGIN_FAILED"},503);
    if(data.user.id!==expectedUserId)return json(origin,{error:"QA-identiteit komt niet overeen met de allowlist.",code:"DEV_MODE_QA_USER_MISMATCH"},403);
    user=data.user;
    issuedSession=data.session;
  }

  const token=randomToken();
  const expiresAt=new Date(Date.now()+8*60*60*1000);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:issueError}=await admin.rpc("issue_developer_mode_session",{
    p_user_id:user.id,
    p_token:token,
    p_origin:origin,
    p_environment:environment,
    p_expires_at:expiresAt.toISOString()
  });
  if(issueError)return json(origin,{error:"Developer Mode-sessie kon niet worden uitgegeven.",code:"DEV_MODE_SESSION_ISSUE_FAILED"},503);

  console.info("boekuna_developer_mode",{active:true,environment,qa_user:user.id});
  return json(origin,{
    ok:true,
    environment,
    user_id:user.id,
    session:issuedSession?{
      access_token:issuedSession.access_token,
      refresh_token:issuedSession.refresh_token,
      expires_at:issuedSession.expires_at,
      expires_in:issuedSession.expires_in
    }:null,
    developer_session:{token,expires_at:Math.floor(expiresAt.getTime()/1000)}
  });
});