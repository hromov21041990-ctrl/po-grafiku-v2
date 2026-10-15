-- Business conflicts must not use SQLSTATE 40001: the API retries that state.
create or replace function public.pvz2_support_reply(p_ticket_id uuid,p_message text,p_status text,p_admin boolean,p_requester text,p_version integer,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t public.pvz2_support_tickets%rowtype; next_status text; actor text;
begin
 if p_admin is null then raise insufficient_privilege; end if;
 select * into t from public.pvz2_support_tickets where id=p_ticket_id for update;
 if not found then raise insufficient_privilege; end if;
 if not p_admin and not exists(select 1 from public.pvz2_support_access where ticket_id=p_ticket_id and requester_hash=p_requester) then raise insufficient_privilege; end if;
 actor=case when p_admin then 'admin' else 'user' end;
 if exists(select 1 from public.pvz2_support_events where ticket_id=p_ticket_id and sender=actor and request_id=p_request_id) then return true; end if;
 if t.support_version<>p_version then raise exception 'support_conflict' using errcode='P0001'; end if;
 if char_length(p_message)>4000 or (not p_admin and char_length(p_message)<1) then raise exception 'Invalid message'; end if;
 next_status=case when p_admin then coalesce(p_status,case when t.status='new' then 'in_progress' else t.status end) when t.status='resolved' then 'in_progress' else t.status end;
 if char_length(p_message)>0 then
  insert into public.pvz2_support_events(ticket_id,kind,sender,body,request_id) values(p_ticket_id,'reply',actor,p_message,p_request_id);
 end if;
 if next_status<>t.status or p_message='' then
  insert into public.pvz2_support_events(ticket_id,kind,sender,status,request_id) values(p_ticket_id,'status',actor,next_status,case when p_message='' then p_request_id else null end);
 end if;
 update public.pvz2_support_tickets set status=next_status,updated_at=now(),support_version=support_version+1,
 last_user_at=case when not p_admin then now() else last_user_at end,
 last_admin_at=case when p_admin then now() else last_admin_at end,
 admin_seen_at=case when p_admin then now() else admin_seen_at end
 where id=p_ticket_id;
 return true;
end $$;
