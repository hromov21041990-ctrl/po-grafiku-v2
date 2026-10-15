-- Run with execute_sql. All test writes are rolled back.
begin;
do $$
declare t uuid; result boolean; hash text=repeat('a',64); rid uuid=gen_random_uuid(); n integer;
begin
 if has_table_privilege('anon','public.pvz2_support_tickets','SELECT') or has_table_privilege('authenticated','public.pvz2_support_events','SELECT') then raise exception 'Browser table grant'; end if;
 if has_function_privilege('anon','public.pvz2_support_create(jsonb,text,uuid)','EXECUTE') or has_function_privilege('authenticated','public.pvz2_support_reply(uuid,text,text,boolean,text,integer,uuid)','EXECUTE') then raise exception 'Browser RPC grant'; end if;
 select count(*) into n from pg_class where oid in ('public.pvz2_support_tickets'::regclass,'public.pvz2_support_events'::regclass,'public.pvz2_support_access'::regclass,'public.pvz2_support_rate_limits'::regclass) and relrowsecurity;
 if n<>4 then raise exception 'Missing RLS'; end if;
 t=public.pvz2_support_create(jsonb_build_object('category','bug','title','QA internal support','message','Isolated support transaction test.','contact_email','qa@example.invalid','sender_role','guest'),hash,rid);
 if public.pvz2_support_create(jsonb_build_object(),hash,rid)<>t then raise exception 'Duplicate submission'; end if;
 if not (select admin_unread from public.pvz2_support_tickets where id=t) then raise exception 'New ticket not unread'; end if;
 begin
  perform public.pvz2_support_reply(t,'Forbidden',null,false,repeat('b',64),0,gen_random_uuid());raise exception 'Cross requester accepted';
 exception when insufficient_privilege then null;end;
 rid=gen_random_uuid();perform public.pvz2_support_reply(t,'Answer shown on site','resolved',true,null,0,rid);
 perform public.pvz2_support_reply(t,'Answer shown on site','resolved',true,null,0,rid);
 if (select count(*) from public.pvz2_support_events where ticket_id=t and kind='reply')<>1 then raise exception 'Duplicate reply'; end if;
 if (select status<>'resolved' or support_version<>1 or admin_unread from public.pvz2_support_tickets where id=t) then raise exception 'Admin reply state'; end if;
 begin
  perform public.pvz2_support_reply(t,'Stale response',null,false,hash,0,gen_random_uuid());raise exception 'Stale update accepted';
 exception when raise_exception then if sqlerrm<>'support_conflict' then raise;end if;end;
 perform public.pvz2_support_reply(t,'User follows up',null,false,hash,1,gen_random_uuid());
 if (select status<>'in_progress' or support_version<>2 from public.pvz2_support_tickets where id=t) then raise exception 'Reopen failed'; end if;
 for n in 1..5 loop if not public.pvz2_support_consume(repeat('f',64),5) then raise exception 'Early throttle'; end if;end loop;
 if public.pvz2_support_consume(repeat('f',64),5) then raise exception 'Throttle failed'; end if;
end $$;
select 'RLS, grants, ownership, idempotency, status history, conflicts and rate limits passed' as result;
rollback;
