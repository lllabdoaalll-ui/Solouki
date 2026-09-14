-- ============================================================
-- Solouki — Phase 4 / STEP 45: تسجيل مخالفة جماعي
-- دوال: خيارات الفصول ضمن النطاق + قائمة طلاب الفصل + تسجيل دفعة
-- نفّذه بعد step44.1
-- ============================================================

-- ------------------------------------------------------------
-- 1) خيارات المرحلة/الصف/الفصل المتاحة للمستخدم الحالي
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_bulk_class_options()
RETURNS TABLE (
  stage_id text,
  stage_name text,
  grade text,
  class_name text,
  section text,
  student_count bigint
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

  IF actor.role_type = 'superadmin' THEN
    RETURN QUERY
    SELECT
      s.stage_id::text,
      coalesce(st.name_ar, s.stage_id::text) AS stage_name,
      s.grade,
      s.class_name,
      s.section,
      count(*)::bigint
    FROM students s
    LEFT JOIN stages st ON st.id = s.stage_id
    WHERE s.is_active = true
      AND coalesce(s.grade, '') <> ''
      AND coalesce(s.class_name, '') <> ''
    GROUP BY s.stage_id, st.name_ar, s.grade, s.class_name, s.section
    ORDER BY stage_name, s.grade, s.class_name, s.section;

  ELSIF actor.role_type IN ('stage_manager', 'it_officer') THEN
    RETURN QUERY
    SELECT
      s.stage_id::text,
      coalesce(st.name_ar, s.stage_id::text) AS stage_name,
      s.grade,
      s.class_name,
      s.section,
      count(*)::bigint
    FROM students s
    LEFT JOIN stages st ON st.id = s.stage_id
    WHERE s.is_active = true
      AND coalesce(s.grade, '') <> ''
      AND coalesce(s.class_name, '') <> ''
      AND s.stage_id IN (
        SELECT sa.stage_id FROM stage_assignments sa WHERE sa.profile_id = actor.id
      )
    GROUP BY s.stage_id, st.name_ar, s.grade, s.class_name, s.section
    ORDER BY stage_name, s.grade, s.class_name, s.section;

  ELSIF actor.role_type = 'counselor' THEN
    RETURN QUERY
    SELECT
      c.stage_id::text,
      coalesce(st.name_ar, c.stage_id::text) AS stage_name,
      c.grade,
      c.class_name,
      c.section,
      (
        SELECT count(*)::bigint FROM students s
        WHERE s.is_active = true
          AND s.stage_id = c.stage_id
          AND s.grade = c.grade
          AND s.class_name = c.class_name
          AND s.section = c.section
      ) AS student_count
    FROM counselor_class_assignments c
    LEFT JOIN stages st ON st.id = c.stage_id
    WHERE c.counselor_id = actor.id
    ORDER BY stage_name, c.grade, c.class_name, c.section;

  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_bulk_class_options() TO authenticated;

-- ------------------------------------------------------------
-- 2) طلاب فصل معيّن ضمن نطاق الصلاحية
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_students_for_bulk(
  p_stage_id text,
  p_grade text,
  p_class_name text,
  p_section text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  national_id text,
  student_code text,
  grade text,
  class_name text,
  section text,
  stage_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  can_scope boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE profiles.id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF actor.role_type = 'superadmin' THEN
    can_scope := true;
  ELSIF actor.role_type IN ('stage_manager', 'it_officer') THEN
    SELECT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = p_stage_id
    ) INTO can_scope;
  ELSIF actor.role_type = 'counselor' THEN
    SELECT EXISTS (
      SELECT 1 FROM counselor_class_assignments c
      WHERE c.counselor_id = actor.id
        AND c.stage_id = p_stage_id
        AND c.grade = p_grade
        AND c.class_name = p_class_name
        AND (p_section IS NULL OR c.section = p_section)
    ) INTO can_scope;
  END IF;

  IF NOT can_scope THEN
    RAISE EXCEPTION 'لا صلاحية على هذا الفصل';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.national_id,
    coalesce(s.student_code, s.seat_number, '')::text,
    s.grade,
    s.class_name,
    s.section,
    s.stage_id::text
  FROM students s
  WHERE s.is_active = true
    AND s.stage_id = p_stage_id
    AND s.grade = p_grade
    AND s.class_name = p_class_name
    AND (p_section IS NULL OR s.section = p_section)
  ORDER BY s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_students_for_bulk(text, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 3) تسجيل مخالفة جماعي (حد أقصى 50)
-- المكان اختياري في التسجيل الجماعي حسب طلب الأخصائي
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_violation_bulk(
  p_student_ids uuid[],
  p_violation_id int,
  p_custom_violation_ar text,
  p_degree_id smallint,
  p_location_id int,
  p_custom_location_ar text,
  p_violation_date date,
  p_applied_penalty_id smallint,
  p_notes text
)
RETURNS TABLE (
  ok_count int,
  skipped_count int,
  message text,
  recorded_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  sid uuid;
  stu students%rowtype;
  stg stages%rowtype;
  v_degree smallint;
  v_date date;
  can_scope boolean;
  n_ok int := 0;
  n_skip int := 0;
  names text[] := ARRAY[]::text[];
  max_batch int := 50;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF actor.role_type NOT IN ('superadmin', 'stage_manager', 'counselor') THEN
    RAISE EXCEPTION 'not authorized to record violations';
  END IF;

  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'اختر طالباً واحداً على الأقل';
  END IF;

  IF array_length(p_student_ids, 1) > max_batch THEN
    RAISE EXCEPTION 'الحد الأقصى % طالباً في الدفعة الواحدة', max_batch;
  END IF;

  IF p_violation_id IS NULL AND btrim(coalesce(p_custom_violation_ar, '')) = '' THEN
    RAISE EXCEPTION 'يجب اختيار مخالفة من الكتالوج';
  END IF;

  -- الدرجة من الكتالوج
  IF p_violation_id IS NOT NULL THEN
    SELECT degree_id INTO v_degree
    FROM violations_catalog
    WHERE id = p_violation_id AND is_active = true;
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

  FOREACH sid IN ARRAY p_student_ids
  LOOP
    SELECT * INTO stu FROM students WHERE id = sid AND is_active = true;
    IF NOT FOUND THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    SELECT * INTO stg FROM stages WHERE id = stu.stage_id;
    IF NOT FOUND THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    can_scope := false;
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
      n_skip := n_skip + 1;
      CONTINUE;
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
    );

    n_ok := n_ok + 1;
    names := array_append(names, stu.full_name);
  END LOOP;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name,
      actor.role_type,
      'record_violation_bulk',
      'count=' || n_ok::text || ' skip=' || n_skip::text || ' degree=' || v_degree::text,
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  ok_count := n_ok;
  skipped_count := n_skip;
  message := format('تم تسجيل المخالفة لـ %s طالباً%s', n_ok,
    CASE WHEN n_skip > 0 THEN format(' (تم تخطي %s)', n_skip) ELSE '' END);
  recorded_names := names;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_violation_bulk(uuid[], int, text, smallint, int, text, date, smallint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
