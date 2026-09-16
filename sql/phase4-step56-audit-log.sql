-- Solouki — STEP 56: سجل التدقيق التشغيلي
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid null,
  actor_user_id uuid null,
  actor_role text null,
  action_key text not null,
  entity_type text null,
  entity_id text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_school_created_idx on public.audit_logs(school_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs(action_key, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_superadmin on public.audit_logs;
create policy audit_logs_select_superadmin on public.audit_logs
for select to authenticated
using (public.is_superadmin());

create or replace function public.record_audit_event(
  p_action_key text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_id uuid;
  v_school uuid;
  v_role text;
begin
  select school_id, role_type into v_school, v_role
  from public.profiles where id = auth.uid() and is_active = true;
  if auth.uid() is null or v_school is null then
    raise exception 'لا توجد جلسة مستخدم فعالة';
  end if;
  insert into public.audit_logs(school_id, actor_user_id, actor_role, action_key, entity_type, entity_id, details)
  values (v_school, auth.uid(), v_role, left(trim(p_action_key),120), left(p_entity_type,80), left(p_entity_id,120), coalesce(p_details,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

drop policy if exists audit_logs_insert_authenticated on public.audit_logs;
create policy audit_logs_insert_authenticated on public.audit_logs
for insert to authenticated
with check (actor_user_id = auth.uid());

grant execute on function public.record_audit_event(text,text,text,jsonb) to authenticated;
