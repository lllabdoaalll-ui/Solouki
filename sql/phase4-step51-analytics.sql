-- Solouki 4.62.18 — Scoped Behavioral Analytics RPC (v2)
-- IMPORTANT: The RPC enforces the current user's allowed stage/class scope inside the database.
-- Counselors are restricted to their assigned classes; stage managers/IT officers to assigned stages.
-- Safe: does NOT delete or modify existing students/violations.

DROP FUNCTION IF EXISTS public.get_behavior_analytics(date,date,text);
DROP FUNCTION IF EXISTS public.get_behavior_analytics(date,date,text,text);

CREATE OR REPLACE FUNCTION public.get_behavior_analytics_v2(
  p_from date,
  p_to date,
  p_stage_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_profile
  FROM profiles
  WHERE id = v_uid AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE';
  END IF;

  IF v_profile.role_type NOT IN ('superadmin','stage_manager','it_officer','counselor') THEN
    RAISE EXCEPTION 'ANALYTICS_NOT_ALLOWED';
  END IF;

  WITH
  allowed_stages AS (
    SELECT s.id, s.name_ar AS name
    FROM stages s
    WHERE s.school_id = v_profile.school_id
      AND s.is_active = TRUE
      AND (p_stage_id IS NULL OR s.id = p_stage_id)
      AND (
        v_profile.role_type = 'superadmin'
        OR EXISTS (
          SELECT 1 FROM stage_assignments sa
          WHERE sa.profile_id = v_uid AND sa.stage_id = s.id
        )
        OR (
          v_profile.role_type = 'counselor'
          AND EXISTS (
            SELECT 1 FROM counselor_class_assignments cca
            WHERE cca.counselor_id = v_uid AND cca.stage_id = s.id
          )
        )
      )
  ),
  allowed_classes AS (
    SELECT DISTINCT cca.stage_id, cca.grade, cca.class_name
    FROM counselor_class_assignments cca
    WHERE cca.counselor_id = v_uid
  ),
  base AS (
    SELECT
      vr.id, vr.student_id, vr.stage_id, vr.violation_id, vr.custom_violation_ar,
      vr.degree_id, vr.violation_date, vr.location_id, vr.custom_location_ar,
      vr.applied_penalty_id, vr.notes,
      s.full_name, s.grade, s.class_name, s.section,
      vc.code AS violation_code, vc.description_ar AS violation_description,
      vd.name_ar AS degree_name,
      vl.name_ar AS location_name,
      p.name_ar AS penalty_name
    FROM violation_records vr
    JOIN students s ON s.id = vr.student_id
    JOIN allowed_stages ast ON ast.id = vr.stage_id
    LEFT JOIN violations_catalog vc ON vc.id = vr.violation_id
    LEFT JOIN violation_degrees vd ON vd.id = vr.degree_id
    LEFT JOIN violation_locations vl ON vl.id = vr.location_id
    LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
    WHERE vr.school_id = v_profile.school_id
      AND vr.violation_date BETWEEN p_from AND p_to
      AND (
        v_profile.role_type IN ('superadmin','stage_manager','it_officer')
        OR EXISTS (
          SELECT 1 FROM allowed_classes ac
          WHERE ac.stage_id = vr.stage_id
            AND ac.grade = s.grade
            AND ac.class_name = s.class_name
        )
      )
  ),
  raw_period AS (
    SELECT count(*)::int AS cnt
    FROM violation_records vr
    WHERE vr.school_id = v_profile.school_id
      AND vr.violation_date BETWEEN p_from AND p_to
      AND (p_stage_id IS NULL OR vr.stage_id = p_stage_id)
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total_violations', (SELECT count(*) FROM base),
      'students_with_violations', (SELECT count(DISTINCT student_id) FROM base),
      'degree_1', (SELECT count(*) FROM base WHERE degree_id = 1),
      'degree_2', (SELECT count(*) FROM base WHERE degree_id = 2),
      'degree_3', (SELECT count(*) FROM base WHERE degree_id = 3),
      'degree_4', (SELECT count(*) FROM base WHERE degree_id = 4)
    ),
    'scope', jsonb_build_object(
      'role_type', v_profile.role_type,
      'school_id', v_profile.school_id,
      'stage_filter', p_stage_id,
      'allowed_stage_count', (SELECT count(*) FROM allowed_stages),
      'allowed_class_count', CASE WHEN v_profile.role_type = 'counselor' THEN (SELECT count(*) FROM allowed_classes) ELSE NULL END
    ),
    'diagnostics', jsonb_build_object(
      'raw_period_violations', (SELECT cnt FROM raw_period),
      'scoped_period_violations', (SELECT count(*) FROM base),
      'scope_empty', ((SELECT count(*) FROM allowed_stages) = 0 OR (v_profile.role_type = 'counselor' AND (SELECT count(*) FROM allowed_classes) = 0))
    ),
    'stages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM allowed_stages),'[]'::jsonb),
    'top_violations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label',label,'count',cnt) ORDER BY cnt DESC, label)
      FROM (
        SELECT COALESCE(violation_code || ' — ' || violation_description, custom_violation_ar, 'مخالفة غير محددة') AS label,
               count(*)::int AS cnt
        FROM base GROUP BY 1 ORDER BY cnt DESC, label LIMIT 10
      ) q
    ),'[]'::jsonb),
    'classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage_id',stage_id,'grade',grade,'section',section,'class_name',class_name,
        'violations_count',violations_count,'students_count',students_count
      ) ORDER BY violations_count DESC, grade, class_name)
      FROM (
        SELECT stage_id, grade, section, class_name, count(*)::int AS violations_count,
               count(DISTINCT student_id)::int AS students_count
        FROM base GROUP BY stage_id, grade, section, class_name
      ) q
    ),'[]'::jsonb),
    'attention', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'full_name',full_name,'grade',grade,'class_name',class_name,
        'total_count',total_count,'degree_2',degree_2,'degree_3',degree_3,'degree_4',degree_4,
        'last_violation_date',last_violation_date
      ) ORDER BY total_count DESC, degree_4 DESC, degree_3 DESC, full_name)
      FROM (
        SELECT full_name, grade, class_name,
               count(*)::int AS total_count,
               count(*) FILTER (WHERE degree_id = 2)::int AS degree_2,
               count(*) FILTER (WHERE degree_id = 3)::int AS degree_3,
               count(*) FILTER (WHERE degree_id = 4)::int AS degree_4,
               max(violation_date) AS last_violation_date
        FROM base
        GROUP BY student_id, full_name, grade, class_name
        HAVING count(*) >= 3 OR count(*) FILTER (WHERE degree_id IN (2,3,4)) > 0
      ) q
    ),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_behavior_analytics_v2(date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_behavior_analytics_v2(date,date,text) TO authenticated;

-- Ask PostgREST to refresh its schema cache immediately.
NOTIFY pgrst, 'reload schema';
