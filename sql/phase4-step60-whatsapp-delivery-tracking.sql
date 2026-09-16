-- Solouki STEP 60 — WhatsApp delivery tracking + webhook events
-- Provider secrets remain in Edge Function secrets; nothing sensitive is stored here.

alter table public.whatsapp_notifications
  add column if not exists provider_status text,
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_error_code text;

create index if not exists whatsapp_notifications_provider_status_idx
  on public.whatsapp_notifications(provider_status, provider_status_at desc);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  notification_id uuid references public.whatsapp_notifications(id) on delete set null,
  provider_message_id text,
  event_status text not null,
  event_timestamp timestamptz,
  error_code text,
  error_title text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_message_idx
  on public.whatsapp_webhook_events(provider_message_id, received_at desc);
create index if not exists whatsapp_webhook_events_received_idx
  on public.whatsapp_webhook_events(received_at desc);

alter table public.whatsapp_webhook_events enable row level security;

-- Operational visibility is restricted to privileged staff; webhook inserts are server-side.
drop policy if exists whatsapp_webhook_events_select on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_select
on public.whatsapp_webhook_events for select to authenticated
using (
  public.solouki_my_role() in ('superadmin','stage_manager','counselor')
);

create or replace function public.list_my_whatsapp_notifications(
  p_date date default current_date,
  p_status text default null,
  p_limit int default 100
)
returns table(
  id uuid, student_id uuid, student_name text, grade text, class_name text,
  parent_type text, recipient_phone text, message text, violation_count int,
  status text, provider_message_id text, provider_status text, provider_status_at timestamptz,
  provider_error_code text, error_text text, attempts int,
  created_at timestamptz, sent_at timestamptz, last_attempt_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select n.id,n.student_id,s.full_name,s.grade,s.class_name,n.parent_type,n.recipient_phone,n.message,
    n.violation_count,n.status,n.provider_message_id,n.provider_status,n.provider_status_at,
    n.provider_error_code,n.error_text,n.attempts,n.created_at,n.sent_at,n.last_attempt_at
  from whatsapp_notifications n
  left join students s on s.id=n.student_id
  where n.created_at::date=coalesce(p_date,current_date)
    and (p_status is null or n.status=p_status)
    and public.solouki_my_role() in ('superadmin','stage_manager','it_officer','counselor')
  order by n.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
grant execute on function public.list_my_whatsapp_notifications(date,text,int) to authenticated;

notify pgrst, 'reload schema';
