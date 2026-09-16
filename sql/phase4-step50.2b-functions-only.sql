-- STEP 50.2c: إصلاح admin_withdraw / restore بدون الاعتماد على students.school_id
-- نفّذ هذا الملف مرة واحدة

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawal_reason text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

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
  stu_id uuid;
  stu_name text;
  stu_nid text;
  stu_stage text;
  stu_active boolean;
  can_delete boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

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

  IF NOT can_delete THEN RAISE EXCEPTION 'لا صلاحية لحذف الطلاب'; END IF;

  SELECT id, full_name, national_id, stage_id, COALESCE(is_active, true)
  INTO stu_id, stu_name, stu_nid, stu_stage, stu_active
  FROM students WHERE id = p_student_id;

  IF stu_id IS NULL THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;

  IF actor.role_type = 'it_officer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu_stage
    ) THEN
      RAISE EXCEPTION 'خارج نطاق صلاحياتك (المرحلة)';
    END IF;
  END IF;

  IF stu_active = false THEN
    RETURN jsonb_build_object('id', stu_id, 'full_name', stu_name, 'already_withdrawn', true);
  END IF;

  UPDATE public.students SET
    is_active = false,
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawal_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
    updated_at = now()
  WHERE id = p_student_id;

  BEGIN
    INSERT INTO public.audit_events (actor_id, actor_name, actor_role, stage_id, action, details, level)
    VALUES (
      actor.id, actor.full_name, actor.role_type, stu_stage,
      'انسحاب طالب',
      'طالب: ' || COALESCE(stu_name, '') || ' | قومي: ' || COALESCE(stu_nid, ''),
      'warning'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- لا نوقف العملية إن فشل السجل
  END;

  RETURN jsonb_build_object(
    'id', stu_id,
    'full_name', stu_name,
    'national_id', stu_nid,
    'withdrawn', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_withdraw_student(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restore_student(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  stu_id uuid;
  stu_name text;
  stu_nid text;
  stu_stage text;
  can_delete boolean := false;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

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

  IF NOT can_delete THEN RAISE EXCEPTION 'لا صلاحية لاستعادة الطلاب'; END IF;

  SELECT id, full_name, national_id, stage_id
  INTO stu_id, stu_name, stu_nid, stu_stage
  FROM students WHERE id = p_student_id;

  IF stu_id IS NULL THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;

  IF actor.role_type = 'it_officer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM stage_assignments sa
      WHERE sa.profile_id = actor.id AND sa.stage_id = stu_stage
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

  BEGIN
    INSERT INTO public.audit_events (actor_id, actor_name, actor_role, stage_id, action, details, level)
    VALUES (
      actor.id, actor.full_name, actor.role_type, stu_stage,
      'استعادة طالب',
      'طالب: ' || COALESCE(stu_name, '') || ' | قومي: ' || COALESCE(stu_nid, ''),
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('id', stu_id, 'full_name', stu_name, 'restored', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_student(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
