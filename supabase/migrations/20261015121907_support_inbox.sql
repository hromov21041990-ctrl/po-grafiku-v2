-- Additive: no changes to Auth, schedules, members or their sessions.
alter table public.pvz2_support_tickets
  add column support_version integer not null default 0,
  add column last_user_at timestamptz,
  add column last_admin_at timestamptz,
  add column admin_seen_at timestamptz,
  add column user_seen_at timestamptz;
update public.pvz2_support_tickets set last_user_at=created_at;
alter table public.pvz2_support_tickets add column admin_unread boolean
  generated always as (last_user_at > coalesce(admin_seen_at,'-infinity'::timestamptz)) stored;

create table public.pvz2_support_access (
  ticket_id uuid primary key references public.pvz2_support_tickets(id) on delete cascade,
  requester_hash text not null check (requester_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  unique(requester_hash,request_id)
);
create table public.pvz2_support_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.pvz2_support_tickets(id) on delete cascade,
  kind text not null check (kind in ('created','reply','status')),
  sender text not null check (sender in ('user','admin','system')),
  body text not null default '' check (char_length(body)<=4000),
  status text check (status in ('new','in_progress','resolved')),
  request_id uuid,
  created_at timestamptz not null default now(),
  unique(ticket_id,sender,request_id)
);
create index pvz2_support_events_history on public.pvz2_support_events(ticket_id,created_at desc,id desc);
create index pvz2_support_tickets_recent on public.pvz2_support_tickets(updated_at desc,id);
create index pvz2_support_tickets_inbox on public.pvz2_support_tickets(status,created_at desc);
create index pvz2_support_tickets_point on public.pvz2_support_tickets(company_code);
alter table public.pvz2_support_access enable row level security;
alter table public.pvz2_support_events enable row level security;
alter table public.pvz2_support_tickets enable row level security;
alter table public.pvz2_support_rate_limits enable row level security;
-- No browser role can access these tables. Custom app sessions are verified
-- in the Edge Function; there is no unsafe authenticated/anon fallback policy.
revoke all on public.pvz2_support_access, public.pvz2_support_events,
 public.pvz2_support_tickets, public.pvz2_support_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.pvz2_support_access,public.pvz2_support_events,
 public.pvz2_support_tickets,public.pvz2_support_rate_limits to service_role;
comment on table public.pvz2_support_access is 'Server-only hashed requester identity, separate from ticket content. Never store raw session or guest credentials.';
comment on table public.pvz2_support_tickets is 'Internal support inbox. Browser access denied; Edge validates service admin or exact requester. Never store passwords or tokens.';
-- Retain previous responses in the new history without sending any messages.
insert into public.pvz2_support_events(ticket_id,kind,sender,body,created_at)
 select id,'reply','admin',left(staff_response,4000),updated_at from public.pvz2_support_tickets
 where coalesce(staff_response,'')<>'';
update public.pvz2_support_tickets set last_admin_at=updated_at where coalesce(staff_response,'')<>'';

create function public.pvz2_support_consume(p_key text,p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[0-9a-f]{64}$' or p_limit<1 or p_limit>100 then raise exception 'Invalid rate budget'; end if;
 insert into public.pvz2_support_rate_limits(ip_hash,window_started,attempts) values(p_key,now(),1)
 on conflict(ip_hash) do update set
 attempts=case when public.pvz2_support_rate_limits.window_started<=now()-interval '1 hour' then 1 else least(public.pvz2_support_rate_limits.attempts+1,1000) end,
 window_started=case when public.pvz2_support_rate_limits.window_started<=now()-interval '1 hour' then now() else public.pvz2_support_rate_limits.window_started end
 returning attempts into n;
 return n<=p_limit;
end $$;

create function public.pvz2_support_create(p_ticket jsonb,p_requester text,p_request_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ticket_id uuid;
begin
 if p_requester is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_requester||p_request_id::text,0));
  select a.ticket_id into ticket_id from public.pvz2_support_access a where a.requester_hash=p_requester and a.request_id=p_request_id;
  if ticket_id is not null then return ticket_id; end if;
 end if;
 insert into public.pvz2_support_tickets(company_id,owner_auth_uid,company_code,category,title,message,contact_email,sender_role,last_user_at)
 values((p_ticket->>'company_id')::uuid,(p_ticket->>'owner_auth_uid')::uuid,coalesce(p_ticket->>'company_code',''),p_ticket->>'category',p_ticket->>'title',p_ticket->>'message',p_ticket->>'contact_email',p_ticket->>'sender_role',now()) returning id into ticket_id;
 if p_requester is not null then insert into public.pvz2_support_access values(ticket_id,p_requester,p_request_id); end if;
 insert into public.pvz2_support_events(ticket_id,kind,sender,status) values(ticket_id,'created','user','new');
 return ticket_id;
end $$;

create function public.pvz2_support_reply(p_ticket_id uuid,p_message text,p_status text,p_admin boolean,p_requester text,p_version integer,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t public.pvz2_support_tickets%rowtype; next_status text; actor text;
begin
 if p_admin is null then raise insufficient_privilege; end if;
 select * into t from public.pvz2_support_tickets where id=p_ticket_id for update;
 if not found then raise insufficient_privilege; end if;
 if not p_admin and not exists(select 1 from public.pvz2_support_access where ticket_id=p_ticket_id and requester_hash=p_requester) then raise insufficient_privilege; end if;
 actor=case when p_admin then 'admin' else 'user' end;
 if exists(select 1 from public.pvz2_support_events where ticket_id=p_ticket_id and sender=actor and request_id=p_request_id) then return true; end if;
 if t.support_version<>p_version then raise serialization_failure using message='Ticket changed'; end if;
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

revoke all on function public.pvz2_support_consume(text,integer) from public,anon,authenticated;
revoke all on function public.pvz2_support_create(jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.pvz2_support_reply(uuid,text,text,boolean,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.pvz2_support_consume(text,integer),public.pvz2_support_create(jsonb,text,uuid),public.pvz2_support_reply(uuid,text,text,boolean,text,integer,uuid) to service_role;
