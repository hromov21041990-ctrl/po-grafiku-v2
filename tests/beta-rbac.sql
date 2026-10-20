-- Read/write checks against isolated QA tenants only; all inserts/updates rollback.
-- Run the entire file via Supabase execute_sql, never one statement at a time.
begin;
do $beta$
declare
  a uuid;
  b uuid;
  aa uuid;
  owner_a text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  owner_b text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  admin_a text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  staff_a text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  va bigint;
  vb bigint;
  result jsonb;
begin
  insert into public.pvz2_companies(name,owner_salt,owner_hash,staff_salt,staff_hash,employees,config,rates,schedule,payments)
  values ('QA RBAC tenant A','qa','qa','qa','qa','["QA A"]'::jsonb,
    '{"positions":2,"opens":"10:00","closes":"22:00","days":[0,1,2,3,4,5,6],"payrollMode":"monthly"}'::jsonb,
    '{"shift":3000,"half":1500,"hour":200}'::jsonb,
    '[{"employee":"QA A","date":"2026-10-20","position":0,"pay":3000}]'::jsonb,'{}'::jsonb)
  returning id,version into a,va;
  insert into public.pvz2_companies(name,owner_salt,owner_hash,staff_salt,staff_hash,employees,config,rates,schedule,payments)
  values ('QA RBAC tenant B','qa','qa','qa','qa','["QA B"]'::jsonb,
    '{"positions":1,"opens":"10:00","closes":"22:00","days":[0,1,2,3,4,5,6],"payrollMode":"monthly"}'::jsonb,
    '{"shift":1800,"half":900,"hour":150}'::jsonb,
    '[{"employee":"QA B","date":"2026-10-20","position":0,"pay":1800}]'::jsonb,'{}'::jsonb)
  returning id,version into b,vb;
  insert into public.pvz2_members(company_id,employee_name,login,role,password_salt,password_hash,active)
  values (a,'QA A','qa.a','staff','qa','qa',true) returning id into aa;
  insert into public.pvz2_sessions(token_hash,company_id,role,expires_at)
  values
    (encode(sha256(convert_to(owner_a,'UTF8')),'hex'),a,'owner',now()+interval '1 hour'),
    (encode(sha256(convert_to(owner_b,'UTF8')),'hex'),b,'owner',now()+interval '1 hour'),
    (encode(sha256(convert_to('pvz-v2-members:'||admin_a,'UTF8')),'hex'),a,'admin',now()+interval '1 hour'),
    (encode(sha256(convert_to('pvz-v2-members:'||staff_a,'UTF8')),'hex'),a,'staff',now()+interval '1 hour');
  -- Neither a member token nor an admin may enter the owner-only payroll RPC.
  begin
    perform public.pvz2_monthly_payroll(admin_a,'fine','2026-10','QA A',500,va);
    raise exception 'QA_ADMIN_PAYMENT_ACCEPTED';
  exception when others then
    if sqlerrm='QA_ADMIN_PAYMENT_ACCEPTED' then raise; end if;
  end;
  begin
    perform public.pvz2_monthly_payroll(staff_a,'fine','2026-10','QA A',500,va);
    raise exception 'QA_STAFF_PAYMENT_ACCEPTED';
  exception when others then
    if sqlerrm='QA_STAFF_PAYMENT_ACCEPTED' then raise; end if;
  end;
  -- Tenant B's owner cannot mutate an employee record belonging to A.
  begin
    perform public.pvz2_monthly_payroll(owner_b,'fine','2026-10','QA A',500,vb);
    raise exception 'QA_CROSS_TENANT_ACCEPTED';
  exception when others then
    if sqlerrm='QA_CROSS_TENANT_ACCEPTED' then raise; end if;
  end;
  result:=public.pvz2_monthly_payroll(owner_a,'fine','2026-10','QA A',100,va);
  va:=(result->>'version')::bigint;
  if (result->'payments'->'__fines'->>'2026-10|QA A')::numeric<>100 then raise exception 'QA_A_PAYROLL_FAILURE';end if;
  result:=public.pvz2_monthly_payroll(owner_b,'salary_paid','2026-10','QA B',null,vb);
  vb:=(result->>'version')::bigint;
  if (result->'payments'->'salary|2026-10|QA B'->>'amount')::numeric<>1800 then raise exception 'QA_B_PAYROLL_FAILURE';end if;
  if (select version<>va or payments->'__fines'->>'2026-10|QA A'<>'100' from public.pvz2_companies where id=a)
    then raise exception 'QA_A_MUTATED_BY_B';end if;
  if (select version<>vb or payments ? 'salary|2026-10|QA A' from public.pvz2_companies where id=b)
    then raise exception 'QA_B_MUTATED_BY_A';end if;
  -- Revocation removes all the temporary member's access tokens.
  insert into public.pvz2_sessions(token_hash,company_id,role,member_id,expires_at)
  values (encode(sha256(convert_to('pvz-v2-members:'||md5(gen_random_uuid()::text),'UTF8')),'hex'),a,'staff',aa,now()+interval '1 hour');
  update public.pvz2_members set active=false where id=aa;
  delete from public.pvz2_sessions where member_id=aa;
  if (select count(*) from public.pvz2_sessions where member_id=aa)<>0 then raise exception 'QA_REVOKED_SESSION_PERSISTED';end if;
end $beta$;
rollback;
select 'PASS tenant A/B isolation, owner/admin/staff payroll rights, and session revocation; QA data rolled back' as result;
