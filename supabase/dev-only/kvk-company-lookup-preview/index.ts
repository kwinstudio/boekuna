// Isolated preview adapter. Never deploy this entrypoint to the production project.
// KVK credentials live encrypted in Vault; this adapter contains no API key.
import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import {createRuntimeHandler} from "../../functions/kvk-company-lookup/runtime.ts";

const project=Deno.env.get('SUPABASE_URL')||'';
if(project!=='https://ozisiotrzeubwbffnxyr.supabase.co')throw new Error('PREVIEW_PROJECT_REQUIRED');
const admin=createClient(project,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
const {data,error}=await admin.rpc('get_kvk_preview_configuration');
const env={SUPABASE_URL:project,BOEKUNA_DEPLOYMENT_ENV:'preview',KVK_API_MODE:'test',KVK_LOOKUP_ENABLED:error?'false':'true',KVK_API_KEY:data?.kvk_preview_api_key||'',KVK_SELECTION_SECRET:data?.kvk_preview_selection_secret||'',KVK_PREVIEW_ORIGINS:data?.kvk_preview_origins||''};
Deno.serve(createRuntimeHandler(env));
