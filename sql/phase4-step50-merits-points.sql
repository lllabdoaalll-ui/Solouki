-- ============================================================
-- Solouki — STEP 50: التكريمات + نظام النقاط (التحفيز التربوي)
-- نفّذه بعد step49
-- ============================================================

-- جدول التكريمات / السلوك الإيجابي
-- يدعم وجود جدول قديم (من Schema v1) بدون أعمدة category/notes/school_id
CREATE TABLE IF NOT EXISTS public.merit_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  stage_id          text NOT NULL,
  title             text NOT NULL,
  description       text,
  points            smallint NOT NULL DEFAULT 10,
  merit_date        date NOT NULL DEFAULT CURRENT_DATE,
  awarded_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ترقية آمنة إن وُجد الجدول من مخطط قديم
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- ضمان القيمة الافتراضية للصفوف القديمة
UPDATE public.merit_records SET category = 'general' WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_merits_student ON public.merit_records(student_id, merit_date DESC);
CREATE INDEX IF NOT EXISTS idx_merits_stage ON public.merit_records(stage_id, merit_date DESC);
CREATE INDEX IF NOT EXISTS idx_merits_awarded ON public.merit_records(awarded_by);

ALTER TABLE public.merit_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merits_read_auth ON public.merit_records;
CREATE POLICY merits_read_auth ON public.merit_records
  FOR SELECT TO authenticated USING (true);

-- إعدادات النقاط الافتراضية (لكل مدرسة، اختيارية)
CREATE TABLE IF NOT EXISTS public.behaviour_point_settings (
  school_id           uuid PRIMARY KEY,
  default_merit_points smallint NOT NULL DEFAULT 10,
  demerit_d1          smallint NOT NULL DEFAULT 1,
  demerit_d2          smallint NOT NULL DEFAULT 3,
  demerit_d3          smallint NOT NULL DEFAULT 5,
  demerit_d4          smallint NOT NULL DEFAULT 10,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.behaviour_point_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bps_read_auth ON public.behaviour_point_settings;
CREATE POLICY bps_read_auth ON public.behaviour_point_settings
  FOR SELECT TO authenticated USING (true);

-- أنواع تكريم شائعة (مرجع فقط — التسجيل يقبل نصاً حراً)
CREATE TABLE IF NOT EXISTS public.merit_categories (
  id          serial PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  label_ar    text NOT NULL,
  default_points smallint NOT NULL DEFAULT 10,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  smallint NOT NULL DEFAULT 0
);

INSERT INTO public.merit_categories (code, label_ar, default_points, sort_order) VALUES
  ('ideal',       'الطالب المثالي',           15, 10),
  ('participation','مشاركة فعّالة في الحصة',    5, 20),
  ('help_peer',   'مساعدة زميل',               8, 30),
  ('leadership',  'قيادة / مسؤولية',          12, 40),
  ('attendance',  'انتظام وحضور متميز',        5, 50),
  ('cleanliness', 'المحافظة على النظافة',      5, 60),
  ('achievement', 'إنجاز أكاديمي أو فني',      10, 70),
  ('other',       'تكريم آخر',                10, 99)
ON CONFLICT (code) DO UPDATE
  SET label_ar = EXCLUDED.label_ar,
      default_points = EXCLUDED.default_points,
      sort_order = EXCLUDED.sort_order;

ALTER TABLE public.merit_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merit_cat_read ON public.merit_categories;
CREATE POLICY merit_cat_read ON public.merit_categories
  FOR SELECT TO authenticated USING (is_active = true);

-- ────────────────────────────────────────────────────────────
-- دالة مساعدة: التحقق من نطاق الطالب (نفس فلسفة التقارير)
-- ────────────────────────────────────────────────────────────
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

  IF actor.role_type = 'superadmin' THEN
    RETURN true;
  ELSIF actor.role_type IN ('stage_manager', 'it_officer') THEN
    RETURN EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    );
  ELSIF actor.role_type = 'counselor' THEN
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

-- ────────────────────────────────────────────────────────────
-- تسجيل تكريم
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_merit(
  p_student_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_points smallint DEFAULT 10,
  p_merit_date date DEFAULT CURRENT_DATE,
  p_category text DEFAULT 'general',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  new_id uuid;
  pts smallint;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- صلاحية record_merits
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_type = actor.role_type
      AND rp.permission_key = 'record_merits'
      AND rp.mode = 'active'
  ) AND actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'لا صلاحية لتسجيل التكريمات';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود أو غير نشط';
  END IF;

  IF NOT public._can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'خارج نطاق صلاحياتك';
  END IF;

  pts := COALESCE(p_points, 10);
  IF pts < 0 OR pts > 100 THEN
    RAISE EXCEPTION 'النقاط يجب أن تكون بين 0 و 100';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'عنوان التكريم مطلوب';
  END IF;

  INSERT INTO public.merit_records (
    student_id, stage_id, school_id, title, description,
    points, merit_date, category, awarded_by, notes
  ) VALUES (
    stu.id,
    stu.stage_id,
    stu.school_id,
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    pts,
    COALESCE(p_merit_date, CURRENT_DATE),
    COALESCE(NULLIF(btrim(p_category), ''), 'general'),
    actor.id,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO new_id;

  -- Audit
  INSERT INTO public.audit_events (actor_id, actor_name, actor_role, school_id, stage_id, action, details, level)
  VALUES (
    actor.id,
    actor.full_name,
    actor.role_type,
    stu.school_id,
    stu.stage_id,
    'تسجيل تكريم',
    'طالب: ' || stu.full_name || ' | ' || btrim(p_title) || ' (+' || pts || ')',
    'info'
  );

  RETURN jsonb_build_object(
    'id', new_id,
    'student_id', stu.id,
    'title', btrim(p_title),
    'points', pts,
    'merit_date', COALESCE(p_merit_date, CURRENT_DATE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_merit(uuid, text, text, smallint, date, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- قائمة تكريمات طالب
-- ────────────────────────────────────────────────────────────
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
      m.category,
      m.notes,
      m.created_at,
      pr.full_name AS awarded_by_name
    FROM public.merit_records m
    LEFT JOIN public.profiles pr ON pr.id = m.awarded_by
    WHERE m.student_id = p_student_id
  ) x;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_merits(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- حساب نقاط الطالب (إيجابي − سلبي)
-- ────────────────────────────────────────────────────────────
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
  settings public.behaviour_point_settings%rowtype;
  stu students%rowtype;
BEGIN
  IF NOT public._can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'خارج نطاق صلاحياتك';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id;

  SELECT * INTO settings
  FROM public.behaviour_point_settings
  WHERE school_id = stu.school_id;

  IF NOT FOUND THEN
    settings.demerit_d1 := 1;
    settings.demerit_d2 := 3;
    settings.demerit_d3 := 5;
    settings.demerit_d4 := 10;
  END IF;

  SELECT COALESCE(SUM(points), 0)::int, COUNT(*)::int
  INTO positive_pts, merits_count
  FROM public.merit_records
  WHERE student_id = p_student_id;

  SELECT COALESCE(SUM(
    CASE degree_id
      WHEN 1 THEN settings.demerit_d1
      WHEN 2 THEN settings.demerit_d2
      WHEN 3 THEN settings.demerit_d3
      WHEN 4 THEN settings.demerit_d4
      ELSE 1
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

-- ────────────────────────────────────────────────────────────
-- توسيع تقرير السلوك ليشمل التكريمات والنقاط
-- ────────────────────────────────────────────────────────────
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
      mr.category,
      mr.notes,
      pr.full_name AS awarded_by_name
    FROM public.merit_records mr
    LEFT JOIN public.profiles pr ON pr.id = mr.awarded_by
    WHERE mr.student_id = stu.id
  ) m;

  points := public.get_student_points(stu.id);

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

-- ────────────────────────────────────────────────────────────
-- توسيع تقرير ولي الأمر ليشمل التكريمات والنقاط
-- ────────────────────────────────────────────────────────────
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
  merits jsonb;
  positive_pts int := 0;
  negative_pts int := 0;
  merits_count int := 0;
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

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.violation_date DESC), '[]'::jsonb)
  INTO records
  FROM (
    SELECT
      vr.violation_date,
      vr.degree_id,
      coalesce(vc.description_ar, vr.custom_violation_ar) AS violation_label,
      coalesce(vl.name_ar, vr.custom_location_ar) AS location_label,
      p.name_ar AS penalty_label
    FROM violation_records vr
    LEFT JOIN violations_catalog vc ON vc.id = vr.violation_id
    LEFT JOIN violation_locations vl ON vl.id = vr.location_id
    LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
    WHERE vr.student_id = sid
  ) x;

  SELECT coalesce(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.merit_date DESC), '[]'::jsonb)
  INTO merits
  FROM (
    SELECT title, description, points, merit_date
    FROM public.merit_records
    WHERE student_id = sid
  ) m;

  SELECT COALESCE(SUM(points), 0)::int, COUNT(*)::int
  INTO positive_pts, merits_count
  FROM public.merit_records WHERE student_id = sid;

  SELECT COALESCE(SUM(
    CASE degree_id WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 5 WHEN 4 THEN 10 ELSE 1 END
  ), 0)::int
  INTO negative_pts
  FROM public.violation_records WHERE student_id = sid;

  RETURN jsonb_build_object(
    'student', info,
    'stats', coalesce(stats, jsonb_build_object('total', 0, 'degree_1', 0, 'degree_2', 0, 'degree_3', 0, 'degree_4', 0)),
    'records', coalesce(records, '[]'::jsonb),
    'merits', coalesce(merits, '[]'::jsonb),
    'points', jsonb_build_object(
      'positive', positive_pts,
      'negative', negative_pts,
      'net', positive_pts - negative_pts,
      'merits_count', merits_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardian_get_behavior_report(text, text) TO anon, authenticated;

-- قائمة التصنيفات
CREATE OR REPLACE FUNCTION public.list_merit_categories()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.sort_order), '[]'::jsonb)
  FROM public.merit_categories c
  WHERE c.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.list_merit_categories() TO authenticated;

NOTIFY pgrst, 'reload schema';
