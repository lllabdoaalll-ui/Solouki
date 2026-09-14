-- ============================================================
-- Solouki — STEP 49: متابعات + تصعيد + تنبيه كتابي
-- نفّذه بعد step48
-- ============================================================

-- سجل المتابعات والإشعارات الرسمية
CREATE TABLE IF NOT EXISTS public.behavior_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  followup_type text NOT NULL CHECK (followup_type IN (
    'written_warning', 'parent_call', 'referral', 'committee', 'other'
  )),
  title text NOT NULL DEFAULT 'تنبيه كتابي',
  body_text text,
  related_record_ids uuid[] DEFAULT '{}',
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  issued_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_student ON public.behavior_followups(student_id, issued_at DESC);

ALTER TABLE public.behavior_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS followups_read_auth ON public.behavior_followups;
CREATE POLICY followups_read_auth ON public.behavior_followups
  FOR SELECT TO authenticated USING (true);

-- اقتراح تصعيد بناءً على سجل الطالب
CREATE OR REPLACE FUNCTION public.suggest_student_escalation(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  total_c int := 0;
  d1 int := 0; d2 int := 0; d3 int := 0; d4 int := 0;
  written_n int := 0;
  verbal_n int := 0;
  last_penalty text;
  suggestion text;
  level text;
  reason text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;

  -- نطاق صلاحية مبسّط (نفس فلسفة التقارير)
  IF actor.role_type = 'counselor' THEN
    IF NOT EXISTS (
      SELECT 1 FROM counselor_class_assignments c
      WHERE c.counselor_id = actor.id
        AND c.stage_id = stu.stage_id
        AND c.grade = stu.grade
        AND c.class_name = stu.class_name
        AND c.section = stu.section
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك';
    END IF;
  ELSIF actor.role_type IN ('stage_manager', 'it_officer') THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك';
    END IF;
  ELSIF actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE degree_id = 1)::int,
    count(*) FILTER (WHERE degree_id = 2)::int,
    count(*) FILTER (WHERE degree_id = 3)::int,
    count(*) FILTER (WHERE degree_id = 4)::int
  INTO total_c, d1, d2, d3, d4
  FROM violation_records WHERE student_id = p_student_id;

  SELECT count(*)::int INTO written_n
  FROM behavior_followups
  WHERE student_id = p_student_id AND followup_type = 'written_warning';

  SELECT count(*)::int INTO verbal_n
  FROM violation_records vr
  JOIN penalties p ON p.id = vr.applied_penalty_id
  WHERE vr.student_id = p_student_id
    AND (p.tier = 'verbal' OR p.name_ar ILIKE '%شفوي%');

  SELECT p.name_ar INTO last_penalty
  FROM violation_records vr
  LEFT JOIN penalties p ON p.id = vr.applied_penalty_id
  WHERE vr.student_id = p_student_id
  ORDER BY vr.violation_date DESC NULLS LAST, vr.registration_date DESC
  LIMIT 1;

  -- قواعد تصعيد عملية (قابلة للتطوير لاحقاً)
  IF d4 >= 1 THEN
    level := 'critical';
    suggestion := 'إحالة فورية للجنة الحماية / السلطات المختصة (درجة رابعة)';
    reason := 'وجود مخالفة من الدرجة الرابعة';
  ELSIF d3 >= 1 OR total_c >= 6 THEN
    level := 'high';
    suggestion := 'استدعاء ولي الأمر + تحويل للأخصائي / النظر في خصم السلوك أو فصل مؤقت وفق المصفوفة';
    reason := 'مخالفات درجة ثالثة أو تراكم مرتفع';
  ELSIF written_n >= 1 AND (d2 >= 1 OR total_c >= 4) THEN
    level := 'high';
    suggestion := 'تصعيد بعد تنبيه كتابي سابق: مهام إضافية أو خصم درجات أو استدعاء ولي الأمر';
    reason := 'تكرار بعد صدور تنبيه كتابي';
  ELSIF written_n = 0 AND (total_c >= 2 OR verbal_n >= 1 OR d2 >= 1) THEN
    level := 'medium';
    suggestion := 'إصدار تنبيه كتابي رسمي وإخطار ولي الأمر';
    reason := 'تراكم مخالفات أو وجود تنبيه شفوي دون تنبيه كتابي';
  ELSIF total_c >= 1 THEN
    level := 'low';
    suggestion := 'متابعة تربوية وتنبيه شفوي عند اللزوم';
    reason := 'مخالفات محدودة حتى الآن';
  ELSE
    level := 'none';
    suggestion := 'لا يوجد تصعيد مطلوب';
    reason := 'لا مخالفات مسجّلة';
  END IF;

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'total', total_c,
    'degree_1', d1,
    'degree_2', d2,
    'degree_3', d3,
    'degree_4', d4,
    'written_warnings_count', written_n,
    'verbal_penalties_count', verbal_n,
    'last_penalty_label', last_penalty,
    'level', level,
    'suggestion', suggestion,
    'reason', reason
  );
END;
$$;

-- تسجيل صدور تنبيه كتابي (متابعة)
CREATE OR REPLACE FUNCTION public.issue_written_warning(
  p_student_id uuid,
  p_body_text text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_related_record_ids uuid[] DEFAULT NULL
)
RETURNS public.behavior_followups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  row behavior_followups%rowtype;
  body text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF actor.role_type NOT IN ('superadmin', 'stage_manager', 'counselor') THEN
    RAISE EXCEPTION 'غير مصرح بإصدار تنبيه كتابي';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;

  IF actor.role_type = 'counselor' THEN
    IF NOT EXISTS (
      SELECT 1 FROM counselor_class_assignments c
      WHERE c.counselor_id = actor.id
        AND c.stage_id = stu.stage_id AND c.grade = stu.grade
        AND c.class_name = stu.class_name AND c.section = stu.section
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك';
    END IF;
  END IF;

  body := NULLIF(btrim(coalesce(p_body_text, '')), '');
  IF body IS NULL THEN
    body := 'يُنذَر الطالب/ة كتابياً بما ثبت بحقه/ها من مخالفات سلوكية، ويُطلب من ولي الأمر التعاون مع إدارة المدرسة لتعديل السلوك، وذلك وفقاً للائحة التحفيز التربوي والانضباط المدرسي الصادرة بالقرار الوزاري رقم (150) لسنة 2024.';
  END IF;

  INSERT INTO behavior_followups (
    student_id, followup_type, title, body_text, related_record_ids,
    issued_at, issued_by, notes
  ) VALUES (
    p_student_id, 'written_warning', 'تنبيه كتابي', body,
    coalesce(p_related_record_ids, '{}'),
    CURRENT_DATE, actor.id, NULLIF(btrim(coalesce(p_notes, '')), '')
  )
  RETURNING * INTO row;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name, actor.role_type, 'issue_written_warning',
      'student=' || p_student_id::text, 'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_student_followups(p_student_id uuid)
RETURNS SETOF public.behavior_followups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  RETURN QUERY
  SELECT f.*
  FROM behavior_followups f
  WHERE f.student_id = p_student_id
  ORDER BY f.issued_at DESC, f.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_student_escalation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_written_warning(uuid, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_followups(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
