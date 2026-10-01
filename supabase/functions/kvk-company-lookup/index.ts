import {createRuntimeHandler} from "./runtime.ts";

const env=Object.fromEntries([
  'KVK_LOOKUP_ENABLED','KVK_API_MODE','KVK_API_KEY','KVK_SELECTION_SECRET',
  'BOEKUNA_DEPLOYMENT_ENV','SUPABASE_URL','KVK_PREVIEW_ORIGINS'
].map(name=>[name,Deno.env.get(name)||'']));
Deno.serve(createRuntimeHandler(env));
