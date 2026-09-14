-- ============================================================
-- Solouki — Phase 4 / STEP 48: بوابة ولي الأمر
-- دخول برقم قومي + كود/رقم جلوس — قراءة مخالفات الطالب فقط
-- نفّذه بعد step47.1
-- ============================================================

-- التحقق من ولي الأمر وإرجاع بيانات الطالب المحدودة
CREATE OR REPLACE FUNCTION public.guardian_lookup_student(
  p_national_id text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid text;
  code text;
  stu students%rowtype;
  stg stages%rowtype;
BEGIN
  nid := regexp_replace(coalesce(p_national_id, ''), '\D', '', 'g');
  code := btrim(coalesce(p_code, ''));

  IF length(nid) <> 14 THEN
    RAISE EXCEPTION 'الرقم القومي يجب أن يكون 14 رقماً';
  END IF;
  IF code = '' THEN
    RAISE EXCEPTION 'أدخل كود الطالب أو رقم الجلوس';
  END IF;

  SELECT * INTO stu
  FROM students s
  WHERE s.is_active = true
    AND s.national_id = nid
    AND (
      btrim(coalesce(s.student_code, '')) = code
      OR btrim(coalesce(s.seat_number, '')) = code
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد طالب مطابق. تحقق من الرقم القومي والكود';
  END IF;

  SELECT * INTO stg FROM stages WHERE id = stu.stage_id;

  RETURN jsonb_build_object(
    'id', stu.id,
    'full_name', stu.full_name,
    'national_id', stu.national_id,
    'student_code', coalesce(stu.student_code, stu.seat_number, ''),
    'grade', stu.grade,
    'class_name', stu.class_name,
    'section', stu.section,
    'stage_id', stu.stage_id,
    'stage_name', coalesce(stg.name_ar, stu.stage_name, stu.stage_id::text),
    'academic_year', stu.academic_year
  );
END;
$$;

-- تقرير سلوك لولي الأمر (بعد التحقق من الرقم + الكود)
CREATE OR REPLACE FUNCTION public.guardian_get_behavior_report(
  p_national_id text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  info jsonb;
  sid uuid;
  stats jsonb;
  records jsonb;
BEGIN
  info := public.guardian_lookup_student(p_national_id, p_code);
  sid := (info->>'id')::uuid;

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'degree_1', count(*) FILTER (WHERE vr.degree_id = 1)::int,
    'degree_2', count(*) FILTER (WHERE vr.degree_id = 2)::int,
    'degree_3', count(*) FILTER (WHERE vr.degree_id = 3)::int,
    'degree_4', count(*) FILTER (WHERE vr.degree_id = 4)::int,
    'last_date', max(vr.violation_date)
  )
  INTO stats
  FROM violation_records vr
  WHERE vr.student_id = sid;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.violation_date DESC, x.registration_date DESC), '[]'::jsonb)
  INTO records
  FROM (
    SELECT
      vr.violation_date,
      vr.registration_date,
      vr.degree_id,
      vc.code AS violation_code,
      coalesce(vc.description_ar, vr.custom_violation_ar) AS violation_label,
      coalesce(vl.name_ar, vr.custom_location_ar) AS location_label,
      p.name_ar AS penalty_label,
      vr.notes
    FROM violation_records vr
    LEFT JOIN violations_catalog vc ON vc.id = vr.violation_id
    LEFT JOIN violation_locations vl ON vl.id = vr.location_id
    LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
    WHERE vr.student_id = sid
  ) x;

  RETURN jsonb_build_object(
    'student', info,
    'stats', coalesce(stats, jsonb_build_object(
      'total', 0, 'degree_1', 0, 'degree_2', 0, 'degree_3', 0, 'degree_4', 0, 'last_date', null
    )),
    'records', records
  );
END;
$$;

-- متاح لـ anon + authenticated (ولي الأمر بدون حساب موظفين)
GRANT EXECUTE ON FUNCTION public.guardian_lookup_student(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_behavior_report(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
