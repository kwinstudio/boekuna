import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import {createLookupHandler} from "./lib.mjs";

export function createRuntimeHandler(env:Record<string,string>){
 const boundedFetch=(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)});
 const admin=createClient(env.SUPABASE_URL,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
 return createLookupHandler({env,
  authenticate:async(req:Request)=>{
    const client=createClient(env.SUPABASE_URL,Deno.env.get('SUPABASE_ANON_KEY')!,{
      global:{headers:{Authorization:req.headers.get('authorization')!},fetch:boundedFetch},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.is_anonymous)return null;
    const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel(req.headers.get('authorization')!.slice(7));
    if(assurance.error||!assurance.data||(assurance.data.nextLevel==='aal2'&&assurance.data.currentLevel!=='aal2'))return null;
    return data.user;
  },
  consumeBudget:async(userId:string,action:string)=>{
    const {data,error}=await admin.rpc('consume_kvk_lookup_budget',{p_user_id:userId,p_action:action});
    if(error)throw new Error('BUDGET_UNAVAILABLE');return data;
  },
  log:(entry:unknown)=>console.info('kvk_lookup',entry)
 });
}
