-- Solouki STEP 59 — WhatsApp notification queue + deduplication
-- Secrets are NEVER stored in the database. Sending is performed by Edge Function.

alter table public.whatsapp_notifications
  add column if not exists notification_key text,
  add column if not exists violation_ids uuid[] not null default '{}',
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

create unique index if not exists whatsapp_notifications_key_uq
  on public.whatsapp_notifications(notification_key)
  where notification_key is not null;
create index if not exists whatsapp_notifications_status_idx
  on public.whatsapp_notifications(status, created_at desc);

-- Build a safe, grouped notification for one student/date. Father is preferred;
-- mother is also queued when a different valid number exists.
create or replace function public.queue_student_whatsapp_notifications(
  p_student_id uuid,
  p_date date default current_date
)
returns setof public.whatsapp_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles%rowtype;
  stu students%rowtype;
  rec record;
  v_msg text;
  v_key text;
  v_phone text;
  v_parent text;
  v_ids uuid[];
  v_count int;
  outrow public.whatsapp_notifications;
begin
  select * into actor from profiles where id=auth.uid() and is_active=true;
  if actor.id is null or actor.role_type not in ('superadmin','stage_manager','counselor') then
    raise exception 'not authorized';
  end if;
  select * into stu from students where id=p_student_id and is_active=true;
  if stu.id is null then raise exception 'الطالب غير موجود أو غير نشط'; end if;

  -- Scope check mirrors violation recording.
  if actor.role_type='stage_manager' and not exists(
    select 1 from stage_assignments sa where sa.profile_id=actor.id and sa.stage_id=stu.stage_id
  ) then raise exception 'لا صلاحية على مرحلة الطالب'; end if;
  if actor.role_type='counselor' and not exists(
    select 1 from counselor_class_assignments c where c.counselor_id=actor.id and c.stage_id=stu.stage_id
      and c.grade=stu.grade and c.class_name=stu.class_name and c.section=stu.section
  ) then raise exception 'لا صلاحية على فصل الطالب'; end if;

  select array_agg(v.id order by v.violation_date, v.registration_date), count(*)
    into v_ids, v_count
  from violation_records v
  where v.student_id=stu.id and v.violation_date=coalesce(p_date,current_date);
  if coalesce(v_count,0)=0 then raise exception 'لا توجد مخالفات للطالب في هذا التاريخ'; end if;

  v_msg := 'السلام عليكم ورحمة الله،' || E'\n' ||
    'إشعار من إدارة المدرسة بخصوص الطالب/ة: ' || stu.full_name || E'\n' ||
    'الصف: ' || coalesce(stu.grade,'') || ' / الفصل: ' || coalesce(stu.class_name,'') || E'\n' ||
    'تم تسجيل ' || v_count::text || ' ملاحظة سلوكية بتاريخ ' || to_char(coalesce(p_date,current_date),'YYYY-MM-DD') || E':\n';
  for rec in
    select vc.code, coalesce(vc.description_ar,v.custom_violation_ar,'ملاحظة سلوكية') label, v.degree_id
    from violation_records v
    left join violations_catalog vc on vc.id=v.violation_id
    where v.student_id=stu.id and v.violation_date=coalesce(p_date,current_date)
    order by v.registration_date, v.id
  loop
    v_msg := v_msg || '- ' || coalesce(rec.code || ' — ','') || rec.label ||
      case when rec.degree_id is not null then ' (درجة '||rec.degree_id::text||')' else '' end || E'\n';
  end loop;
  v_msg := v_msg || E'\n' || 'نرجو المتابعة والتعاون.' || E'\n' || 'مع تحيات إدارة المدرسة — نظام سلوكي';

  foreach v_parent in array array['father','mother'] loop
    if v_parent='father' then v_phone:=regexp_replace(coalesce(stu.father_phone,''),'[^0-9]','','g');
    else v_phone:=regexp_replace(coalesce(stu.mother_phone,''),'[^0-9]','','g'); end if;
    if left(v_phone,1)='0' then v_phone:='20'||substr(v_phone,2); end if;
    if length(v_phone) < 10 then continue; end if;
    if v_parent='mother' and regexp_replace(coalesce(stu.mother_phone,''),'[^0-9]','','g') = regexp_replace(coalesce(stu.father_phone,''),'[^0-9]','','g') then continue; end if;

    v_key := encode(digest(stu.id::text || '|' || coalesce(p_date,current_date)::text || '|' || v_parent || '|' || v_phone,'sha256'),'hex');
    insert into whatsapp_notifications(
      student_id,stage_id,stage_name,parent_type,recipient_phone,message,violation_count,
      provider,status,sent_by,created_at,violation_ids,notification_key
    ) values (
      stu.id,stu.stage_id,stu.stage_name,v_parent::text,v_phone,v_msg,v_count,
      'meta_cloud','queued',auth.uid(),now(),v_ids,v_key
    ) on conflict(notification_key) do update set
      violation_count=excluded.violation_count,
      message=excluded.message,
      violation_ids=excluded.violation_ids,
      error_text=null
    returning * into outrow;
    return next outrow;
  end loop;
end;
$$;
grant execute on function public.queue_student_whatsapp_notifications(uuid,date) to authenticated;

create or replace function public.queue_daily_whatsapp_notifications(p_date date default current_date)
returns table(queued_count int, skipped_count int, message text)
language plpgsql
security definer
set search_path=public
as $$
declare
  actor profiles%rowtype; s record; r public.whatsapp_notifications; q int:=0; sk int:=0;
begin
  select * into actor from profiles where id=auth.uid() and is_active=true;
  if actor.id is null or actor.role_type not in ('superadmin','stage_manager','counselor') then raise exception 'not authorized'; end if;
  for s in select distinct v.student_id from violation_records v join students st on st.id=v.student_id where v.violation_date=coalesce(p_date,current_date) and st.is_active=true loop
    begin
      for r in select * from public.queue_student_whatsapp_notifications(s.student_id,coalesce(p_date,current_date)) loop q:=q+1; end loop;
    exception when others then sk:=sk+1;
    end;
  end loop;
  queued_count:=q; skipped_count:=sk; message:=format('تم تجهيز %s إشعاراً، وتخطي %s.',q,sk); return next;
end;
$$;
grant execute on function public.queue_daily_whatsapp_notifications(date) to authenticated;

create or replace function public.list_my_whatsapp_notifications(
  p_date date default current_date,
  p_status text default null,
  p_limit int default 100
)
returns table(
  id uuid, student_id uuid, student_name text, grade text, class_name text,
  parent_type text, recipient_phone text, message text, violation_count int,
  status text, provider_message_id text, error_text text, attempts int,
  created_at timestamptz, sent_at timestamptz, last_attempt_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select n.id,n.student_id,s.full_name,s.grade,s.class_name,n.parent_type,n.recipient_phone,n.message,
    n.violation_count,n.status,n.provider_message_id,n.error_text,n.attempts,n.created_at,n.sent_at,n.last_attempt_at
  from whatsapp_notifications n
  left join students s on s.id=n.student_id
  where n.created_at::date=coalesce(p_date,current_date)
    and (p_status is null or n.status=p_status)
    and public.solouki_my_role() in ('superadmin','stage_manager','it_officer','counselor')
  order by n.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
grant execute on function public.list_my_whatsapp_notifications(date,text,int) to authenticated;

notify pgrst, 'reload schema';
