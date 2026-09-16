-- Solouki — STEP 58: WhatsApp Business stage settings hardening
-- IT officers may manage only stages assigned to them; superadmin may manage all stages.
-- No API token is stored in the database.

create or replace function public.can_manage_stage_whatsapp(p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role_type = 'superadmin'
  )
  or exists (
    select 1
    from public.profiles p
    join public.stage_assignments sa on sa.profile_id = p.id and sa.stage_id = p_stage_id
    where p.id = auth.uid() and p.is_active = true and p.role_type = 'it_officer'
  );
$$;
grant execute on function public.can_manage_stage_whatsapp(uuid) to authenticated;

create or replace function public.save_stage_whatsapp_settings(
  p_stage_id uuid,
  p_business_number text,
  p_phone_number_id text,
  p_enabled boolean
)
returns public.stage_whatsapp_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stage_whatsapp_settings;
  v_school uuid;
begin
  if not public.can_manage_stage_whatsapp(p_stage_id) then
    raise exception 'غير مصرح لك بإدارة إعدادات واتساب لهذه المرحلة';
  end if;

  select school_id into v_school from public.stages where id = p_stage_id limit 1;
  if v_school is null then
    raise exception 'المرحلة غير موجودة';
  end if;

  insert into public.stage_whatsapp_settings(stage_id,business_number,phone_number_id,enabled,updated_by,updated_at)
  values (
    p_stage_id,
    nullif(trim(p_business_number),''),
    nullif(trim(p_phone_number_id),''),
    coalesce(p_enabled,false),
    auth.uid(), now()
  )
  on conflict(stage_id) do update set
    business_number = excluded.business_number,
    phone_number_id = excluded.phone_number_id,
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.save_stage_whatsapp_settings(uuid,text,text,boolean) to authenticated;

-- Prevent direct client mutations; the RPC above is the write path.
drop policy if exists wa_settings_write on public.stage_whatsapp_settings;
drop policy if exists wa_settings_update on public.stage_whatsapp_settings;
drop policy if exists wa_settings_delete on public.stage_whatsapp_settings;
create policy wa_settings_write on public.stage_whatsapp_settings
for insert to authenticated with check (false);
create policy wa_settings_update on public.stage_whatsapp_settings
for update to authenticated using (false) with check (false);
create policy wa_settings_delete on public.stage_whatsapp_settings
for delete to authenticated using (false);

revoke insert, update, delete on public.stage_whatsapp_settings from authenticated;

comment on table public.stage_whatsapp_settings is
'STEP 58: per-stage WhatsApp Business configuration. API secrets/tokens are never stored here.';
