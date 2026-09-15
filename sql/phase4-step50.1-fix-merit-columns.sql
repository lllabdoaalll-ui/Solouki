-- ============================================================
-- Solouki — STEP 50.1 hotfix: ترقية merit_records بالكامل
-- يعالج:
--   column mr.category does not exist
--   column m.created_at does not exist
-- نفّذ هذا الملف كاملاً مرة واحدة في SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.merit_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  stage_id     text NOT NULL,
  title        text NOT NULL,
  description  text,
  points       smallint NOT NULL DEFAULT 10,
  merit_date   date NOT NULL DEFAULT CURRENT_DATE,
  awarded_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);

ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS school_id   uuid;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS category    text DEFAULT 'general';
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS notes       text;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

UPDATE public.merit_records SET category   = 'general' WHERE category IS NULL;
UPDATE public.merit_records SET created_at = COALESCE(created_at, now()) WHERE created_at IS NULL;
UPDATE public.merit_records SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_merits_student ON public.merit_records(student_id, merit_date DESC);
CREATE INDEX IF NOT EXISTS idx_merits_stage   ON public.merit_records(stage_id, merit_date DESC);
CREATE INDEX IF NOT EXISTS idx_merits_awarded ON public.merit_records(awarded_by);

ALTER TABLE public.merit_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merits_read_auth ON public.merit_records;
CREATE POLICY merits_read_auth ON public.merit_records
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public._can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN RETURN false; END IF;
  IF actor.role_type = 'superadmin' THEN RETURN true; END IF;
  IF actor.role_type IN ('stage_manager', 'it_officer') THEN
    RETURN EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    );
  END IF;
  IF actor.role_type = 'counselor' THEN
    RETURN EXISTS (
      SELECT 1 FROM counselor_class_assignments c
      WHERE c.counselor_id = actor.id
        AND c.stage_id = stu.stage_id
        AND c.grade = stu.grade
        AND c.class_name = stu.class_name
        AND c.section = stu.section
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_points(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  positive_pts int := 0;
  negative_pts int := 0;
  merits_count int := 0;
  d1 smallint := 1; d2 smallint := 3; d3 smallint := 5; d4 smallint := 10;
BEGIN
  IF NOT public._can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'خارج نطاق صلاحياتك';
  END IF;

  SELECT COALESCE(SUM(points), 0)::int, COUNT(*)::int
  INTO positive_pts, merits_count
  FROM public.merit_records
  WHERE student_id = p_student_id;

  SELECT COALESCE(SUM(
    CASE degree_id
      WHEN 1 THEN d1 WHEN 2 THEN d2 WHEN 3 THEN d3 WHEN 4 THEN d4 ELSE 1
    END
  ), 0)::int
  INTO negative_pts
  FROM public.violation_records
  WHERE student_id = p_student_id;

  RETURN jsonb_build_object(
    'positive', positive_pts,
    'negative', negative_pts,
    'net', positive_pts - negative_pts,
    'merits_count', merits_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_points(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_student_merits(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public._can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'خارج نطاق صلاحياتك';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.merit_date DESC, x.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      m.id,
      m.title,
      m.description,
      m.points,
      m.merit_date,
      COALESCE(m.category, 'general') AS category,
      m.notes,
      COALESCE(m.created_at, m.merit_date::timestamptz) AS created_at,
      pr.full_name AS awarded_by_name
    FROM public.merit_records m
    LEFT JOIN public.profiles pr ON pr.id = m.awarded_by
    WHERE m.student_id = p_student_id
  ) x;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_merits(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_behavior_report(p_student_id uuid)
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
  merits jsonb;
  points jsonb;
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

  SELECT coalesce(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.merit_date DESC, m.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO merits
  FROM (
    SELECT
      mr.id,
      mr.title,
      mr.description,
      mr.points,
      mr.merit_date,
      COALESCE(mr.category, 'general') AS category,
      mr.notes,
      COALESCE(mr.created_at, mr.merit_date::timestamptz) AS created_at,
      pr.full_name AS awarded_by_name
    FROM public.merit_records mr
    LEFT JOIN public.profiles pr ON pr.id = mr.awarded_by
    WHERE mr.student_id = stu.id
  ) m;

  BEGIN
    points := public.get_student_points(stu.id);
  EXCEPTION WHEN OTHERS THEN
    points := jsonb_build_object('positive', 0, 'negative', 0, 'net', 0, 'merits_count', 0);
  END;

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
    'records', coalesce(records, '[]'::jsonb),
    'merits', coalesce(merits, '[]'::jsonb),
    'points', coalesce(points, jsonb_build_object('positive', 0, 'negative', 0, 'net', 0, 'merits_count', 0))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_behavior_report(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE 'OK STEP 50.1: merit_records columns + functions ready';
END $$;
