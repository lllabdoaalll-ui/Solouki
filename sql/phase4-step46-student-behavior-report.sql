-- ============================================================
-- Solouki — Phase 4 / STEP 46: تقرير / ملف سلوك الطالب
-- + تجهيز بيانات للإشعار لولي الأمر
-- نفّذه بعد step45
-- ============================================================

-- ------------------------------------------------------------
-- ملف سلوك طالب واحد (بيانات + إحصائيات + السجلات)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_behavior_report(
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  stg stages%rowtype;
  can_scope boolean := false;
  stats jsonb;
  records jsonb;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود أو غير نشط';
  END IF;

  SELECT * INTO stg FROM stages WHERE id = stu.stage_id;

  IF actor.role_type = 'superadmin' THEN
    can_scope := true;
  ELSIF actor.role_type IN ('stage_manager', 'it_officer') THEN
    SELECT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    ) INTO can_scope;
  ELSIF actor.role_type = 'counselor' THEN
    SELECT EXISTS (
      SELECT 1 FROM counselor_class_assignments c
      WHERE c.counselor_id = actor.id
        AND c.stage_id = stu.stage_id
        AND c.grade = stu.grade
        AND c.class_name = stu.class_name
        AND c.section = stu.section
    ) INTO can_scope;
  END IF;

  IF NOT can_scope THEN
    RAISE EXCEPTION 'لا صلاحية على هذا الطالب';
  END IF;

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
  WHERE vr.student_id = stu.id;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.violation_date DESC, x.registration_date DESC), '[]'::jsonb)
  INTO records
  FROM (
    SELECT
      vr.id,
      vr.violation_date,
      vr.registration_date,
      vr.degree_id,
      vc.code AS violation_code,
      coalesce(vc.description_ar, vr.custom_violation_ar) AS violation_label,
      coalesce(vl.name_ar, vr.custom_location_ar) AS location_label,
      p.name_ar AS penalty_label,
      vr.notes,
      pr.full_name AS recorder_name
    FROM violation_records vr
    LEFT JOIN violations_catalog vc ON vc.id = vr.violation_id
    LEFT JOIN violation_locations vl ON vl.id = vr.location_id
    LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
    LEFT JOIN profiles pr ON pr.id = vr.recorded_by
    WHERE vr.student_id = stu.id
  ) x;

  RETURN jsonb_build_object(
    'student', jsonb_build_object(
      'id', stu.id,
      'full_name', stu.full_name,
      'national_id', stu.national_id,
      'student_code', coalesce(stu.student_code, stu.seat_number, ''),
      'grade', stu.grade,
      'class_name', stu.class_name,
      'section', stu.section,
      'stage_id', stu.stage_id,
      'stage_name', coalesce(stg.name_ar, stu.stage_name, stu.stage_id::text),
      'father_phone', stu.father_phone,
      'mother_phone', stu.mother_phone,
      'academic_year', stu.academic_year
    ),
    'stats', coalesce(stats, jsonb_build_object(
      'total', 0, 'degree_1', 0, 'degree_2', 0, 'degree_3', 0, 'degree_4', 0, 'last_date', null
    )),
    'records', records
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_behavior_report(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
