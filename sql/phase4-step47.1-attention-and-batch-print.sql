-- ============================================================
-- Solouki — STEP 47.1: طلاب يستحقون المتابعة (تراكم مخالفات)
-- عتبات افتراضية قابلة للتمرير من الواجهة
-- نفّذه بعد step47
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_students_needing_attention(
  p_min_total int DEFAULT 3,
  p_min_degree2 int DEFAULT 2,
  p_min_degree3 int DEFAULT 1,
  p_limit int DEFAULT 80
)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  national_id text,
  grade text,
  class_name text,
  section text,
  stage_id text,
  total_count int,
  degree_1 int,
  degree_2 int,
  degree_3 int,
  degree_4 int,
  last_violation_date date,
  alert_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT s.id, s.full_name, s.national_id, s.grade, s.class_name, s.section, s.stage_id::text AS stage_id
    FROM students s
    WHERE s.is_active = true
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
  ),
  agg AS (
    SELECT
      sc.id AS student_id,
      sc.full_name,
      sc.national_id,
      sc.grade,
      sc.class_name,
      sc.section,
      sc.stage_id,
      count(vr.id)::int AS total_count,
      count(vr.id) FILTER (WHERE vr.degree_id = 1)::int AS degree_1,
      count(vr.id) FILTER (WHERE vr.degree_id = 2)::int AS degree_2,
      count(vr.id) FILTER (WHERE vr.degree_id = 3)::int AS degree_3,
      count(vr.id) FILTER (WHERE vr.degree_id = 4)::int AS degree_4,
      max(vr.violation_date) AS last_violation_date
    FROM scoped sc
    JOIN violation_records vr ON vr.student_id = sc.id
    GROUP BY sc.id, sc.full_name, sc.national_id, sc.grade, sc.class_name, sc.section, sc.stage_id
  )
  SELECT
    a.student_id,
    a.full_name,
    a.national_id,
    a.grade,
    a.class_name,
    a.section,
    a.stage_id,
    a.total_count,
    a.degree_1,
    a.degree_2,
    a.degree_3,
    a.degree_4,
    a.last_violation_date,
    CASE
      WHEN a.degree_4 >= 1 OR a.degree_3 >= greatest(p_min_degree3, 1) THEN 'high'
      WHEN a.degree_2 >= p_min_degree2 OR a.total_count >= p_min_total THEN 'medium'
      ELSE 'low'
    END AS alert_level
  FROM agg a
  WHERE
    a.total_count >= p_min_total
    OR a.degree_2 >= p_min_degree2
    OR a.degree_3 >= p_min_degree3
    OR a.degree_4 >= 1
  ORDER BY
    CASE
      WHEN a.degree_4 >= 1 OR a.degree_3 >= greatest(p_min_degree3, 1) THEN 0
      WHEN a.degree_2 >= p_min_degree2 OR a.total_count >= p_min_total THEN 1
      ELSE 2
    END,
    a.total_count DESC,
    a.last_violation_date DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 80), 150));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_students_needing_attention(int, int, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
