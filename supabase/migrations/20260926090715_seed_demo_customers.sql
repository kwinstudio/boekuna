
create or replace function public.demo_customer_state()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'meta', jsonb_build_object('nextInvoice',1,'taxReservePct',30),
    'contacts', jsonb_build_array(
      jsonb_build_object('id','demo-customer-01','type','customer','demo',true,'name','Nova Studio Demo B.V.','contactPerson','Emma Jansen','email','demo1@example.com','phone','010 200 00 01','kvk','DEMO0001','vat','DEMO-BTW-001','peppolId','','address','Demostraat 1','postal','3011 AA','city','Rotterdam'),
      jsonb_build_object('id','demo-customer-02','type','customer','demo',true,'name','Rijn & Co Demo','contactPerson','Noah de Vries','email','demo2@example.com','phone','010 200 00 02','kvk','DEMO0002','vat','DEMO-BTW-002','peppolId','','address','Voorbeeldweg 22','postal','3062 BB','city','Rotterdam'),
      jsonb_build_object('id','demo-customer-03','type','customer','demo',true,'name','Luma Creative Demo B.V.','contactPerson','Sophie Bakker','email','demo3@example.com','phone','010 200 00 03','kvk','DEMO0003','vat','DEMO-BTW-003','peppolId','','address','Testlaan 14','postal','2902 CC','city','Capelle aan den IJssel'),
      jsonb_build_object('id','demo-customer-04','type','customer','demo',true,'name','Harbor Works Demo','contactPerson','Milan Visser','email','demo4@example.com','phone','010 200 00 04','kvk','DEMO0004','vat','DEMO-BTW-004','peppolId','','address','Havenkade 8','postal','3072 DD','city','Rotterdam'),
      jsonb_build_object('id','demo-customer-05','type','customer','demo',true,'name','Studio Bloom Demo','contactPerson','Lina Smit','email','demo5@example.com','phone','010 200 00 05','kvk','DEMO0005','vat','DEMO-BTW-005','peppolId','','address','Bloemstraat 33','postal','3038 EE','city','Rotterdam'),
      jsonb_build_object('id','demo-customer-06','type','customer','demo',true,'name','Northline Demo B.V.','contactPerson','Lucas Meijer','email','demo6@example.com','phone','070 200 00 06','kvk','DEMO0006','vat','DEMO-BTW-006','peppolId','','address','Proefplein 6','postal','2511 FF','city','Den Haag'),
      jsonb_build_object('id','demo-customer-07','type','customer','demo',true,'name','Atelier M Demo','contactPerson','Mila Mulder','email','demo7@example.com','phone','015 200 00 07','kvk','DEMO0007','vat','DEMO-BTW-007','peppolId','','address','Modelstraat 17','postal','2611 GG','city','Delft'),
      jsonb_build_object('id','demo-customer-08','type','customer','demo',true,'name','Peak Events Demo','contactPerson','Finn de Boer','email','demo8@example.com','phone','030 200 00 08','kvk','DEMO0008','vat','DEMO-BTW-008','peppolId','','address','Eventlaan 45','postal','3511 HH','city','Utrecht'),
      jsonb_build_object('id','demo-customer-09','type','customer','demo',true,'name','Green Table Demo','contactPerson','Nora Vos','email','demo9@example.com','phone','010 200 00 09','kvk','DEMO0009','vat','DEMO-BTW-009','peppolId','','address','Marktstraat 90','postal','3011 JJ','city','Rotterdam'),
      jsonb_build_object('id','demo-customer-10','type','customer','demo',true,'name','Bright Office Demo B.V.','contactPerson','Sem Hendriks','email','demo10@example.com','phone','010 200 00 10','kvk','DEMO0010','vat','DEMO-BTW-010','peppolId','','address','Kantoorweg 101','postal','3051 KK','city','Rotterdam')
    ),
    'invoices','[]'::jsonb,
    'expenses','[]'::jsonb,
    'transactions','[]'::jsonb,
    'hours','[]'::jsonb,
    'mileage','[]'::jsonb,
    'documents','[]'::jsonb,
    'bookings','[]'::jsonb,
    'plannedCash','[]'::jsonb,
    'settlements','[]'::jsonb,
    'audit','[]'::jsonb
  );
$$;

revoke all on function public.demo_customer_state() from public;
revoke all on function public.demo_customer_state() from anon;
revoke all on function public.demo_customer_state() from authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, company)
  values (new.id, coalesce(new.raw_user_meta_data->'company', '{}'::jsonb))
  on conflict (user_id) do nothing;

  insert into public.ledger_state(user_id, state)
  values (new.id, public.demo_customer_state())
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

update public.ledger_state
set state = public.demo_customer_state(),
    version = version + 1,
    updated_at = now()
where coalesce(jsonb_array_length(state->'contacts'),0)=0
  and coalesce(jsonb_array_length(state->'invoices'),0)=0
  and coalesce(jsonb_array_length(state->'expenses'),0)=0
  and coalesce(jsonb_array_length(state->'transactions'),0)=0;
