-- Solouki STEP 62 — Cross-device sync for manual WhatsApp confirmations
-- Version: 4.62.12

create table if not exists public.whatsapp_manual_send_confirmations (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null,
  student_id text,
  student_name text,
  send_date date not null,
  message_mode text not null check (message_mode in ('access','warning','warning_escalation')),
  confirmed_by uuid not null default auth.uid(),
  confirmed_at timestamptz not null default now(),
  unique (notification_key, send_date, message_mode, confirmed_by)
);

alter table public.whatsapp_manual_send_confirmations enable row level security;

drop policy if exists "manual_whatsapp_select_own" on public.whatsapp_manual_send_confirmations;
create policy "manual_whatsapp_select_own" on public.whatsapp_manual_send_confirmations
for select to authenticated using (confirmed_by = auth.uid());

drop policy if exists "manual_whatsapp_insert_own" on public.whatsapp_manual_send_confirmations;
create policy "manual_whatsapp_insert_own" on public.whatsapp_manual_send_confirmations
for insert to authenticated with check (confirmed_by = auth.uid());

drop policy if exists "manual_whatsapp_update_own" on public.whatsapp_manual_send_confirmations;
create policy "manual_whatsapp_update_own" on public.whatsapp_manual_send_confirmations
for update to authenticated using (confirmed_by = auth.uid()) with check (confirmed_by = auth.uid());

create index if not exists whatsapp_manual_send_confirmations_date_idx
on public.whatsapp_manual_send_confirmations (confirmed_by, send_date);

create or replace function public.list_my_manual_whatsapp_confirmations(
  p_date date,
  p_mode text default null
)
returns table (
  notification_key text,
  student_id text,
  student_name text,
  send_date date,
  message_mode text,
  confirmed_at timestamptz
)
language sql security invoker set search_path = public
as $$
  select notification_key, student_id, student_name, send_date, message_mode, confirmed_at
  from public.whatsapp_manual_send_confirmations
  where confirmed_by = auth.uid()
    and send_date = p_date
    and (p_mode is null or message_mode = p_mode)
  order by confirmed_at;
$$;

create or replace function public.confirm_manual_whatsapp_send(
  p_notification_key text,
  p_student_id text,
  p_student_name text,
  p_date date,
  p_mode text
)
returns boolean
language plpgsql security invoker set search_path = public
as $$
begin
  if nullif(trim(p_notification_key), '') is null then raise exception 'notification_key is required'; end if;
  if p_mode not in ('access','warning','warning_escalation') then raise exception 'invalid message mode'; end if;
  insert into public.whatsapp_manual_send_confirmations
    (notification_key, student_id, student_name, send_date, message_mode, confirmed_by)
  values
    (trim(p_notification_key), p_student_id, p_student_name, p_date, p_mode, auth.uid())
  on conflict (notification_key, send_date, message_mode, confirmed_by)
  do update set confirmed_at = now(), student_id = excluded.student_id, student_name = excluded.student_name;
  return true;
end;
$$;

revoke all on function public.list_my_manual_whatsapp_confirmations(date,text) from public;
grant execute on function public.list_my_manual_whatsapp_confirmations(date,text) to authenticated;
revoke all on function public.confirm_manual_whatsapp_send(text,text,text,date,text) from public;
grant execute on function public.confirm_manual_whatsapp_send(text,text,text,date,text) to authenticated;
