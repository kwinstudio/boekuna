-- Run only in the approved test project. Populate these named secrets with
-- the official public KVK test key, a random selection secret, and preview
-- origins using Vault secret management. No literal credential is committed.
create or replace function public.get_kvk_preview_configuration()
returns jsonb language sql security invoker set search_path=''
as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets
 where name in ('kvk_preview_api_key','kvk_preview_selection_secret','kvk_preview_origins');
$$;
revoke all on function public.get_kvk_preview_configuration() from public,anon,authenticated;
grant execute on function public.get_kvk_preview_configuration() to service_role;
