-- ============================================================
-- Solouki — Phase 4 / STEP 51: تحليلات ولوحات تنفيذية
-- قراءة تحليلية آمنة ضمن نطاق المستخدم + فلترة تاريخ/مرحلة
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_behavior_analytics(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_from date := coalesce(p_from, CURRENT_DATE - 29);
  v_to date := coalesce(p_to, CURRENT_DATE);
  v_result jsonb;
BEGIN
  SELECT * INTO actor
  FROM profiles
  WHERE id = auth.uid() AND is_active = true;

  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF actor.role_type NOT IN ('superadmin','stage_manager','it_officer','counselor') THEN
    RAISE EXCEPTION 'غير مصرح بعرض التحليلات';
  END IF;

  IF v_from > v_to THEN
    RAISE EXCEPTION 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية';
  END IF;

  WITH scoped_students AS (
    SELECT s.id, s.stage_id, s.grade, s.class_name, s.section, s.full_name
    FROM students s
    WHERE s.is_active = true
      AND (p_stage_id IS NULL OR s.stage_id = p_stage_id)
      AND (
        actor.role_type = 'superadmin'
        OR (
          actor.role_type IN ('stage_manager','it_officer')
          AND s.stage_id IN (
            SELECT sa.stage_id
            FROM stage_assignments sa
            WHERE sa.profile_id = actor.id
          )
        )
        OR (
          actor.role_type = 'counselor'
          AND EXISTS (
            SELECT 1
            FROM counselor_class_assignments c
            WHERE c.counselor_id = actor.id
              AND c.stage_id = s.stage_id
              AND c.grade = s.grade
              AND c.class_name = s.class_name
              AND c.section = s.section
          )
        )
      )
  ),
  scoped_v AS (
    SELECT vr.*, ss.full_name, ss.stage_id, ss.grade, ss.class_name, ss.section
    FROM violation_records vr
    JOIN scoped_students ss ON ss.id = vr.student_id
    WHERE vr.violation_date BETWEEN v_from AND v_to
  ),
  summary AS (
    SELECT
      count(*)::int AS total_violations,
      count(DISTINCT student_id)::int AS students_with_violations,
      count(*) FILTER (WHERE degree_id = 1)::int AS degree_1,
      count(*) FILTER (WHERE degree_id = 2)::int AS degree_2,
      count(*) FILTER (WHERE degree_id = 3)::int AS degree_3,
      count(*) FILTER (WHERE degree_id = 4)::int AS degree_4
    FROM scoped_v
  ),
  top_v AS (
    SELECT
      coalesce(vc.code, 'custom') AS code,
      coalesce(vc.description_ar, max(sv.custom_violation_ar), 'مخالفة مخصصة') AS label,
      count(*)::int AS count
    FROM scoped_v sv
    LEFT JOIN violations_catalog vc ON vc.id = sv.violation_id
    GROUP BY coalesce(vc.code, 'custom'), vc.description_ar
    ORDER BY count(*) DESC, label
    LIMIT 10
  ),
  class_v AS (
    SELECT
      stage_id,
      grade,
      section,
      class_name,
      count(*)::int AS violations_count,
      count(DISTINCT student_id)::int AS students_count
    FROM scoped_v
    GROUP BY stage_id, grade, section, class_name
    ORDER BY violations_count DESC, class_name
    LIMIT 30
  ),
  repeaters AS (
    SELECT
      sv.student_id,
      max(sv.full_name) AS full_name,
      max(sv.stage_id)::text AS stage_id,
      max(sv.grade) AS grade,
      max(sv.class_name) AS class_name,
      max(sv.section) AS section,
      count(*)::int AS violation_count,
      count(*) FILTER (WHERE sv.degree_id = 2)::int AS degree_2,
      count(*) FILTER (WHERE sv.degree_id = 3)::int AS degree_3,
      count(*) FILTER (WHERE sv.degree_id = 4)::int AS degree_4,
      max(sv.violation_date) AS last_violation_date
    FROM scoped_v sv
    GROUP BY sv.student_id
    HAVING count(*) >= 3
    ORDER BY violation_count DESC, last_violation_date DESC
    LIMIT 20
  ),
  attention AS (
    SELECT
      sv.student_id,
      max(sv.full_name) AS full_name,
      max(sv.stage_id)::text AS stage_id,
      max(sv.grade) AS grade,
      max(sv.class_name) AS class_name,
      max(sv.section) AS section,
      count(*)::int AS total_count,
      count(*) FILTER (WHERE sv.degree_id = 2)::int AS degree_2,
      count(*) FILTER (WHERE sv.degree_id = 3)::int AS degree_3,
      count(*) FILTER (WHERE sv.degree_id = 4)::int AS degree_4,
      max(sv.violation_date) AS last_violation_date
    FROM scoped_v sv
    GROUP BY sv.student_id
    HAVING count(*) >= 3
        OR count(*) FILTER (WHERE sv.degree_id = 2) >= 2
        OR count(*) FILTER (WHERE sv.degree_id = 3) >= 1
        OR count(*) FILTER (WHERE sv.degree_id = 4) >= 1
    ORDER BY
      CASE WHEN count(*) FILTER (WHERE sv.degree_id = 4) >= 1
              OR count(*) FILTER (WHERE sv.degree_id = 3) >= 1 THEN 0 ELSE 1 END,
      count(*) DESC,
      max(sv.violation_date) DESC
    LIMIT 20
  ),
  daily AS (
    SELECT violation_date AS day, count(*)::int AS count
    FROM scoped_v
    GROUP BY violation_date
    ORDER BY violation_date
  ),
  stage_options AS (
    SELECT DISTINCT
      st.id::text AS id,
      st.name_ar AS name
    FROM stages st
    JOIN scoped_students ss ON ss.stage_id = st.id
    ORDER BY st.name_ar
  )
  SELECT jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'summary', coalesce((SELECT to_jsonb(s) FROM summary s), jsonb_build_object(
      'total_violations',0,'students_with_violations',0,'degree_1',0,'degree_2',0,'degree_3',0,'degree_4',0
    )),
    'top_violations', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM top_v t), '[]'::jsonb),
    'classes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM class_v c), '[]'::jsonb),
    'repeaters', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM repeaters r), '[]'::jsonb),
    'attention', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM attention a), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM daily d), '[]'::jsonb),
    'stages', coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM stage_options o), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_behavior_analytics(date, date, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
