-- ============================================================
-- Solouki — STEP 50.2: انسحاب / حذف طالب من القائمة النشطة
-- أدوار مسموحة: superadmin + it_officer
-- الحذف ناعم (is_active=false) — المخالفات والتكريمات تُحفظ
-- ============================================================

INSERT INTO public.permission_catalog (key, label_ar, category, sort_order) VALUES
  ('delete_students', 'حذف / انسحاب طالب من القائمة النشطة', 'students', 35)
ON CONFLICT (key) DO UPDATE
  SET label_ar = EXCLUDED.label_ar,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- افتراضي: مسؤول عام + مسؤول حاسب فقط
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('superadmin',   'delete_students', 'active'),
  ('it_officer',   'delete_students', 'active'),
  ('stage_manager','delete_students', 'none'),
  ('counselor',    'delete_students', 'none')
ON CONFLICT (role_type, permission_key) DO UPDATE
  SET mode = EXCLUDED.mode;

-- انسحاب (حذف ناعم)
CREATE OR REPLACE FUNCTION public.admin_withdraw_student(
  p_student_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  can_delete boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- صلاحية delete_students أو superadmin
  IF actor.role_type = 'superadmin' THEN
    can_delete := true;
  ELSIF actor.role_type = 'it_officer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role_type = 'it_officer'
        AND rp.permission_key = 'delete_students'
        AND rp.mode = 'active'
    ) INTO can_delete;
  END IF;

  IF NOT can_delete THEN
    RAISE EXCEPTION 'لا صلاحية لحذف الطلاب';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود';
  END IF;

  -- مسؤول الحاسب: فقط ضمن مراحله
  IF actor.role_type = 'it_officer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك (المرحلة)';
    END IF;
  END IF;

  IF stu.is_active = false THEN
    RETURN jsonb_build_object(
      'id', stu.id,
      'full_name', stu.full_name,
      'already_withdrawn', true
    );
  END IF;

  UPDATE public.students SET
    is_active = false,
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawal_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
    updated_at = now()
  WHERE id = p_student_id;

  INSERT INTO public.audit_events (actor_id, actor_name, actor_role, school_id, stage_id, action, details, level)
  VALUES (
    actor.id,
    actor.full_name,
    actor.role_type,
    stu.school_id,
    stu.stage_id,
    'انسحاب طالب',
    'طالب: ' || COALESCE(stu.full_name, '') || ' | قومي: ' || COALESCE(stu.national_id, '') ||
      CASE WHEN NULLIF(btrim(COALESCE(p_reason, '')), '') IS NOT NULL
           THEN ' | سبب: ' || btrim(p_reason) ELSE '' END,
    'warning'
  );

  RETURN jsonb_build_object(
    'id', stu.id,
    'full_name', stu.full_name,
    'national_id', stu.national_id,
    'withdrawn', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_withdraw_student(uuid, text) TO authenticated;

-- استعادة طالب منسحب
CREATE OR REPLACE FUNCTION public.admin_restore_student(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu students%rowtype;
  can_delete boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

  IF actor.role_type = 'superadmin' THEN
    can_delete := true;
  ELSIF actor.role_type = 'it_officer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role_type = 'it_officer' AND rp.permission_key = 'delete_students' AND rp.mode = 'active'
    ) INTO can_delete;
  END IF;

  IF NOT can_delete THEN
    RAISE EXCEPTION 'لا صلاحية لاستعادة الطلاب';
  END IF;

  SELECT * INTO stu FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;

  IF actor.role_type = 'it_officer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu.stage_id
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك (المرحلة)';
    END IF;
  END IF;

  UPDATE public.students SET
    is_active = true,
    status = 'active',
    withdrawn_at = NULL,
    withdrawal_reason = NULL,
    updated_at = now()
  WHERE id = p_student_id;

  INSERT INTO public.audit_events (actor_id, actor_name, actor_role, school_id, stage_id, action, details, level)
  VALUES (
    actor.id, actor.full_name, actor.role_type, stu.school_id, stu.stage_id,
    'استعادة طالب',
    'طالب: ' || COALESCE(stu.full_name, '') || ' | قومي: ' || COALESCE(stu.national_id, ''),
    'info'
  );

  RETURN jsonb_build_object(
    'id', stu.id,
    'full_name', stu.full_name,
    'restored', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_student(uuid) TO authenticated;

-- أعمدة انسحاب إن لم تكن موجودة
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawal_reason text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id uuid;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE 'OK STEP 50.2: admin_withdraw_student + admin_restore_student';
END $$;
