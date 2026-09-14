-- ============================================================
-- Solouki — Phase 4 / STEP 44: تسجيل المخالفة
-- دوال آمنة: بحث طلاب + تسجيل + قائمة + تعديل محدود + حذف إداري
-- نفّذه بعد step43.*
-- ============================================================

-- قراءة سجل المخالفات للمستخدمين المصادقين (التصفية داخل الدوال)
DROP POLICY IF EXISTS violations_read_auth ON public.violation_records;
CREATE POLICY violations_read_auth ON public.violation_records
  FOR SELECT TO authenticated USING (true);

-- لا INSERT/UPDATE/DELETE مباشرة — عبر الدوال فقط

-- ------------------------------------------------------------
-- بحث طلاب ضمن نطاق الدور
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_students_for_violation(
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  full_name text,
  national_id text,
  stage_id text,
  grade text,
  class_name text,
  section text,
  academic_year text,
  school_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  q text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE profiles.id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  q := btrim(coalesce(p_query, ''));
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.national_id,
    s.stage_id,
    s.grade,
    s.class_name,
    s.section,
    s.academic_year,
    st.school_id
  FROM students s
  JOIN stages st ON st.id = s.stage_id
  WHERE s.is_active = true
    AND (
      s.full_name ILIKE '%' || q || '%'
      OR s.national_id ILIKE '%' || q || '%'
      OR coalesce(s.seat_number, '') ILIKE '%' || q || '%'
    )
    AND (
      actor.role_type = 'superadmin'
      OR (
        actor.role_type IN ('stage_manager', 'it_officer')
        AND s.stage_id IN (
          SELECT sa.stage_id FROM stage_assignments sa WHERE sa.profile_id = actor.id
        )
      )
      OR (
        actor.role_type = 'counselor'
        AND EXISTS (
          SELECT 1 FROM counselor_class_assignments c
          WHERE c.counselor_id = actor.id
            AND c.stage_id = s.stage_id
            AND c.grade = s.grade
            AND c.class_name = s.class_name
            AND c.section = s.section
        )
      )
    )
  ORDER BY s.full_name
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_students_for_violation(text, int) TO authenticated;

-- ------------------------------------------------------------
-- تسجيل مخالفة
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_violation(
  p_student_id uuid,
  p_violation_id int,
  p_custom_violation_ar text,
  p_degree_id smallint,
  p_location_id int,
  p_custom_location_ar text,
  p_violation_date date,
  p_applied_penalty_id smallint,
  p_notes text
)
RETURNS public.violation_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  stg stages%rowtype;
  v_degree smallint;
  v_date date;
  v_row violation_records%rowtype;
  can_scope boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF actor.role_type NOT IN ('superadmin', 'stage_manager', 'counselor') THEN
    RAISE EXCEPTION 'not authorized to record violations';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود أو غير نشط';
  END IF;

  SELECT * INTO stg FROM stages WHERE id = stu.stage_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مرحلة الطالب غير موجودة';
  END IF;

  -- نطاق الوصول
  IF actor.role_type = 'superadmin' THEN
    can_scope := true;
  ELSIF actor.role_type = 'stage_manager' THEN
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

  IF p_violation_id IS NULL AND btrim(coalesce(p_custom_violation_ar, '')) = '' THEN
    RAISE EXCEPTION 'يجب اختيار مخالفة من الكتالوج أو كتابة وصف مخصص';
  END IF;

  IF p_location_id IS NULL AND btrim(coalesce(p_custom_location_ar, '')) = '' THEN
    RAISE EXCEPTION 'يجب اختيار مكان أو كتابة مكان مخصص';
  END IF;

  -- الدرجة: من الكتالوج إن وُجدت مخالفة، وإلا من المدخل
  IF p_violation_id IS NOT NULL THEN
    SELECT degree_id INTO v_degree FROM violations_catalog WHERE id = p_violation_id AND is_active = true;
    IF v_degree IS NULL THEN
      RAISE EXCEPTION 'المخالفة غير موجودة أو موقوفة';
    END IF;
  ELSE
    v_degree := p_degree_id;
    IF v_degree IS NULL OR v_degree NOT IN (1, 2, 3, 4) THEN
      RAISE EXCEPTION 'درجة المخالفة مطلوبة (1–4)';
    END IF;
  END IF;

  v_date := coalesce(p_violation_date, CURRENT_DATE);

  IF p_applied_penalty_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM degree_penalty_matrix
      WHERE degree_id = v_degree AND penalty_id = p_applied_penalty_id
    ) THEN
      RAISE EXCEPTION 'العقوبة غير مسموحة لهذه الدرجة';
    END IF;
  END IF;

  INSERT INTO violation_records (
    student_id, stage_id, school_id,
    violation_id, custom_violation_ar, degree_id,
    location_id, custom_location_ar,
    violation_date, registration_date, recorded_by,
    applied_penalty_id, notes
  ) VALUES (
    stu.id, stu.stage_id, stg.school_id,
    p_violation_id, NULLIF(btrim(coalesce(p_custom_violation_ar, '')), ''),
    v_degree,
    p_location_id, NULLIF(btrim(coalesce(p_custom_location_ar, '')), ''),
    v_date, NOW(), actor.id,
    p_applied_penalty_id, NULLIF(btrim(coalesce(p_notes, '')), '')
  )
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name, actor.role_type, 'record_violation',
      'student=' || stu.full_name || ' degree=' || v_degree::text,
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_violation(uuid, int, text, smallint, int, text, date, smallint, text) TO authenticated;

-- ------------------------------------------------------------
-- قائمة آخر المخالفات ضمن النطاق
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_recent_violations(
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  student_name text,
  national_id text,
  stage_id text,
  grade text,
  class_name text,
  degree_id smallint,
  violation_code text,
  violation_label text,
  location_label text,
  penalty_label text,
  violation_date date,
  registration_date timestamptz,
  recorded_by uuid,
  recorder_name text,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE profiles.id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    vr.id,
    vr.student_id,
    s.full_name,
    s.national_id,
    vr.stage_id,
    s.grade,
    s.class_name,
    vr.degree_id,
    vc.code,
    coalesce(vc.description_ar, vr.custom_violation_ar) AS violation_label,
    coalesce(vl.name_ar, vr.custom_location_ar) AS location_label,
    p.name_ar AS penalty_label,
    vr.violation_date,
    vr.registration_date,
    vr.recorded_by,
    pr.full_name AS recorder_name,
    vr.notes
  FROM violation_records vr
  JOIN students s ON s.id = vr.student_id
  LEFT JOIN violations_catalog vc ON vc.id = vr.violation_id
  LEFT JOIN violation_locations vl ON vl.id = vr.location_id
  LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
  LEFT JOIN profiles pr ON pr.id = vr.recorded_by
  WHERE
    actor.role_type = 'superadmin'
    OR (
      actor.role_type IN ('stage_manager', 'it_officer')
      AND vr.stage_id IN (
        SELECT sa.stage_id FROM stage_assignments sa WHERE sa.profile_id = actor.id
      )
    )
    OR (
      actor.role_type = 'counselor'
      AND EXISTS (
        SELECT 1 FROM counselor_class_assignments c
        WHERE c.counselor_id = actor.id
          AND c.stage_id = s.stage_id
          AND c.grade = s.grade
          AND c.class_name = s.class_name
          AND c.section = s.section
      )
    )
  ORDER BY vr.registration_date DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_recent_violations(int) TO authenticated;

-- ------------------------------------------------------------
-- حذف إداري (superadmin أو stage_manager ضمن مرحلته)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_violation_record(
  p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  vr violation_records%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO vr FROM violation_records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'السجل غير موجود';
  END IF;

  IF actor.role_type = 'superadmin' THEN
    NULL;
  ELSIF actor.role_type = 'stage_manager' THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = vr.stage_id
    ) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM violation_records WHERE id = p_record_id;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (actor.full_name, actor.role_type, 'delete_violation_record', p_record_id::text, 'info');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_violation_record(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
