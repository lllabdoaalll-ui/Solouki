-- Solouki — STEP 57: Audit integrity hardening
-- Server-side mutation audit for critical business tables.
-- Does not store passwords, WhatsApp message bodies, or phone numbers.

create or replace function public.audit_critical_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_school uuid;
  v_student uuid;
  v_stage uuid;
  v_entity jsonb;
  v_old jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else '{}'::jsonb end;
  v_new jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else '{}'::jsonb end;
  v_changed text[] := array[]::text[];
  v_key text;
begin
  -- Database/background jobs without an authenticated actor are not attributed to a staff user.
  if v_actor is null then
    return coalesce(NEW, OLD);
  end if;

  v_entity := case when TG_OP = 'DELETE' then v_old else v_new end;
  v_school := nullif(v_entity->>'school_id','')::uuid;
  v_student := nullif(v_entity->>'student_id','')::uuid;
  v_stage := nullif(v_entity->>'stage_id','')::uuid;

  if v_school is null and v_stage is not null then
    select school_id into v_school from public.stages where id = v_stage limit 1;
  end if;
  if v_school is null and v_student is not null then
    select st.school_id into v_school
    from public.students s
    left join public.stages st on st.id = s.stage_id
    where s.id = v_student
    limit 1;
  end if;

  if TG_OP = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_old->v_key) is distinct from (v_new->v_key) then
        v_changed := array_append(v_changed, v_key);
      end if;
    end loop;
  end if;

  insert into public.audit_logs(
    school_id, actor_user_id, actor_role, action_key, entity_type, entity_id, details
  )
  select
    v_school,
    v_actor,
    p.role_type,
    'db_' || lower(TG_OP) || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    coalesce(v_entity->>'id', ''),
    jsonb_build_object(
      'source', 'database_trigger',
      'changed_columns', to_jsonb(v_changed)
    )
  from public.profiles p
  where p.id = v_actor and p.is_active = true;

  return coalesce(NEW, OLD);
end;
$$;

-- Direct client writes to audit_logs are no longer allowed. The RPC and triggers run server-side.
drop policy if exists audit_logs_insert_authenticated on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated;

-- Critical mutation coverage. Existing duplicate triggers are removed first for idempotency.
do $$
declare
  t text;
begin
  foreach t in array array['students','violation_records','merit_records','behavior_followups','whatsapp_notifications'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_critical_mutation()',
      'trg_audit_' || t, t
    );
  end loop;
end $$;

comment on function public.audit_critical_mutation() is
'STEP 57: server-side audit trail for critical business mutations; intentionally excludes sensitive values.';
