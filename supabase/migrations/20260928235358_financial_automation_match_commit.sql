create or replace function public.commit_financial_bank_match(p_user_id uuid,p_expected_version bigint,p_state jsonb,p_bank_transaction_id uuid,p_target_type text,p_target_ref text,p_score integer,p_evidence jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_old_state jsonb;v_old_version bigint;v_new_version bigint;
begin
 if p_user_id is null or p_state is null then raise exception 'INVALID_MATCH_INPUT' using errcode='22023';end if;
 if p_target_type not in('invoice','expense') or nullif(trim(p_target_ref),'') is null then raise exception 'INVALID_MATCH_TARGET' using errcode='22023';end if;
 if not exists(select 1 from public.bank_transactions where id=p_bank_transaction_id and user_id=p_user_id) then raise exception 'BANK_TRANSACTION_NOT_FOUND' using errcode='P0002';end if;
 if p_target_type='invoice' and not exists(select 1 from jsonb_array_elements(coalesce(p_state->'invoices','[]'::jsonb)) x where x->>'id'=p_target_ref) then raise exception 'MATCH_INVOICE_NOT_FOUND' using errcode='P0002';end if;
 if p_target_type='expense' and not exists(select 1 from jsonb_array_elements(coalesce(p_state->'expenses','[]'::jsonb)) x where x->>'id'=p_target_ref) then raise exception 'MATCH_EXPENSE_NOT_FOUND' using errcode='P0002';end if;
 select state,version into v_old_state,v_old_version from public.ledger_state where user_id=p_user_id and version=p_expected_version for update;if not found then return null;end if;
 insert into public.ledger_revisions(user_id,version,state) values(p_user_id,v_old_version,v_old_state);
 update public.ledger_state set state=p_state,version=version+1,updated_at=now() where user_id=p_user_id and version=p_expected_version returning version into v_new_version;
 if v_new_version is null then return null;end if;
 insert into public.transaction_matches(user_id,bank_transaction_id,target_type,target_ref,state,score,evidence,confirmed_at,updated_at)
 values(p_user_id,p_bank_transaction_id,p_target_type,p_target_ref,'manually_matched',greatest(0,least(100,coalesce(p_score,0))),coalesce(p_evidence,'[]'::jsonb),now(),now())
 on conflict(user_id,bank_transaction_id,target_type,target_ref) do update set state='manually_matched',score=excluded.score,evidence=excluded.evidence,confirmed_at=now(),rejected_at=null,updated_at=now();
 update public.bank_transactions set status='matched' where id=p_bank_transaction_id and user_id=p_user_id;
 delete from public.ledger_revisions where user_id=p_user_id and id not in(select id from public.ledger_revisions where user_id=p_user_id order by created_at desc limit 25);
 return v_new_version;
end$$;
revoke all on function public.commit_financial_bank_match(uuid,bigint,jsonb,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_financial_bank_match(uuid,bigint,jsonb,uuid,text,text,integer,jsonb) to service_role;
