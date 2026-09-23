-- Solouki 4.70.1 — WhatsApp queue for counselor + pgcrypto digest fix
-- Run once in Supabase SQL Editor (project: Solouki)

create extension if not exists pgcrypto with schema extensions;

create or replace function public.queue_student_whatsapp_notifications(
  p_student_id uuid,
  p_date date default current_date
)
returns setof public.whatsapp_notifications
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor profiles%rowtype;
  stu students%rowtype;
  v_count int;
  v_ids uuid[];
  v_msg text;
  rec record;
  v_parent text;
  v_phone text;
  v_key text;
  outrow public.whatsapp_notifications;
begin
  select * into actor from profiles where id = auth.uid() and is_active = true;
  if actor.id is null or actor.role_type not in ('superadmin','stage_manager','counselor') then
    raise exception 'not authorized';
  end if;

  select * into stu from students where id = p_student_id and is_active = true;
  if stu.id is null then
    raise exception 'الطالب غير موجود أو غير نشط';
  end if;

  if actor.role_type = 'stage_manager' and not exists (
    select 1 from stage_assignments sa
    where sa.profile_id = actor.id and sa.stage_id = stu.stage_id
  ) then
    raise exception 'لا صلاحية على مرحلة الطالب';
  end if;

  if actor.role_type = 'counselor' and not exists (
    select 1
    from counselor_class_assignments c
    where c.counselor_id = actor.id
      and c.stage_id = stu.stage_id
      and lower(trim(c.grade)) = lower(trim(stu.grade))
      and lower(trim(c.class_name)) = lower(trim(stu.class_name))
      and (
        nullif(trim(coalesce(c.section,'')), '') is null
        or nullif(trim(coalesce(stu.section,'')), '') is null
        or lower(trim(c.section)) = lower(trim(stu.section))
      )
  ) then
    raise exception 'لا صلاحية على فصل الطالب';
  end if;

  select array_agg(v.id order by v.violation_date, v.registration_date), count(*)
  into v_ids, v_count
  from violation_records v
  where v.student_id = stu.id
    and v.violation_date = coalesce(p_date, current_date);

  if coalesce(v_count, 0) = 0 then
    raise exception 'لا توجد مخالفات للطالب في هذا التاريخ';
  end if;

  v_msg := 'السلام عليكم ورحمة الله،' || E'\n' ||
    'إشعار من إدارة المدرسة بخصوص الطالب/ة: ' || stu.full_name || E'\n' ||
    'الصف: ' || coalesce(stu.grade,'') || ' / الفصل: ' || coalesce(stu.class_name,'') || E'\n' ||
    'تم تسجيل ' || v_count::text || ' ملاحظة سلوكية بتاريخ ' ||
    to_char(coalesce(p_date, current_date), 'YYYY-MM-DD') || E':\n';

  for rec in
    select vc.code,
           coalesce(vc.description_ar, v.custom_violation_ar, 'ملاحظة سلوكية') as label,
           v.degree_id
    from violation_records v
    left join violations_catalog vc on vc.id = v.violation_id
    where v.student_id = stu.id
      and v.violation_date = coalesce(p_date, current_date)
    order by v.registration_date, v.id
  loop
    v_msg := v_msg || '- ' || coalesce(rec.code || ' — ', '') || rec.label ||
      case when rec.degree_id is not null
        then ' (درجة ' || rec.degree_id::text || ')'
        else '' end || E'\n';
  end loop;

  v_msg := v_msg || E'\nنرجو المتابعة والتعاون.\nمع تحيات إدارة المدرسة — نظام سلوكي';

  foreach v_parent in array array['father', 'mother'] loop
    if v_parent = 'father' then
      v_phone := regexp_replace(coalesce(stu.father_phone, ''), '[^0-9]', '', 'g');
    else
      v_phone := regexp_replace(coalesce(stu.mother_phone, ''), '[^0-9]', '', 'g');
    end if;

    if left(v_phone, 1) = '0' then
      v_phone := '20' || substr(v_phone, 2);
    end if;

    if length(v_phone) < 10 then
      continue;
    end if;

    if v_parent = 'mother'
       and regexp_replace(coalesce(stu.mother_phone, ''), '[^0-9]', '', 'g')
         = regexp_replace(coalesce(stu.father_phone, ''), '[^0-9]', '', 'g') then
      continue;
    end if;

    v_key := encode(
      extensions.digest(
        convert_to(
          stu.id::text || '|' || coalesce(p_date, current_date)::text || '|' || v_parent || '|' || v_phone,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into whatsapp_notifications (
      student_id, stage_id, stage_name, parent_type, recipient_phone, message,
      violation_count, provider, status, sent_by, created_at, violation_ids, notification_key
    ) values (
      stu.id, stu.stage_id, stu.stage_name, v_parent, v_phone, v_msg,
      v_count, 'meta_cloud', 'queued', auth.uid(), now(), v_ids, v_key
    )
    on conflict (notification_key) do update set
      violation_count = excluded.violation_count,
      message = excluded.message,
      violation_ids = excluded.violation_ids,
      error_text = null
    returning * into outrow;

    return next outrow;
  end loop;
end;
$$;

create or replace function public.queue_daily_whatsapp_notifications(p_date date default current_date)
returns table(queued_count int, skipped_count int, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor profiles%rowtype;
  s record;
  r public.whatsapp_notifications;
  q int := 0;
  sk int := 0;
  last_err text := null;
begin
  select * into actor from profiles where id = auth.uid() and is_active = true;
  if actor.id is null or actor.role_type not in ('superadmin','stage_manager','counselor') then
    raise exception 'not authorized';
  end if;

  for s in
    select distinct v.student_id
    from violation_records v
    join students st on st.id = v.student_id
    where v.violation_date = coalesce(p_date, current_date)
      and st.is_active = true
      and (
        actor.role_type = 'superadmin'
        or (
          actor.role_type = 'stage_manager'
          and exists (
            select 1 from stage_assignments sa
            where sa.profile_id = actor.id and sa.stage_id = st.stage_id
          )
        )
        or (
          actor.role_type = 'counselor'
          and exists (
            select 1 from counselor_class_assignments c
            where c.counselor_id = actor.id
              and c.stage_id = st.stage_id
              and lower(trim(c.grade)) = lower(trim(st.grade))
              and lower(trim(c.class_name)) = lower(trim(st.class_name))
              and (
                nullif(trim(coalesce(c.section,'')), '') is null
                or nullif(trim(coalesce(st.section,'')), '') is null
                or lower(trim(c.section)) = lower(trim(st.section))
              )
          )
        )
      )
  loop
    begin
      for r in select * from public.queue_student_whatsapp_notifications(s.student_id, coalesce(p_date, current_date))
      loop
        q := q + 1;
      end loop;
    exception when others then
      sk := sk + 1;
      last_err := SQLERRM;
    end;
  end loop;

  queued_count := q;
  skipped_count := sk;
  message := format(
    'تم تجهيز %s إشعاراً، وتخطي %s.%s',
    q, sk,
    case when last_err is not null then ' آخر خطأ: ' || last_err else '' end
  );
  return next;
end;
$$;
