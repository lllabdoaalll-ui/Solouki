-- ============================================================
-- إصلاح/تحصين admin_update_student للتعديل اليدوي
-- نفّذ مرة واحدة في SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_student(
  p_student_id uuid,
  p_national_id text,
  p_student_code text,
  p_full_name text,
  p_gender text,
  p_grade text,
  p_section text,
  p_class_name text,
  p_father_phone text,
  p_mother_phone text,
  p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.profiles%ROWTYPE;
  v_gender text;
  v_section text;
BEGIN
  SELECT * INTO actor
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = true;

  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF actor.role_type IS DISTINCT FROM 'superadmin'
     AND public.my_permission('edit_students') IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'not authorized: edit_students permission required';
  END IF;

  -- تطبيع الجنس ليتوافق مع CHECK (M/F)
  v_gender := lower(trim(coalesce(p_gender, '')));
  IF v_gender IN ('m', 'male', 'ذكر', 'ولد') THEN
    v_gender := 'M';
  ELSIF v_gender IN ('f', 'female', 'أنثى', 'انثى', 'بنت') THEN
    v_gender := 'F';
  ELSIF v_gender IN ('m', 'f') THEN
    v_gender := upper(v_gender);
  ELSE
    -- أبقِ القيمة القديمة إن وُجدت
    SELECT gender INTO v_gender FROM public.students WHERE id = p_student_id;
  END IF;

  -- تطبيع القسم ليتوافق مع CHECK (arabic/languages)
  v_section := lower(trim(coalesce(p_section, '')));
  IF v_section IN ('arabic', 'عربي', 'عربى', 'قسم عربي', 'قسم عربى') OR v_section LIKE '%عربي%' OR v_section LIKE '%عربى%' THEN
    v_section := 'arabic';
  ELSIF v_section IN ('languages', 'لغات', 'لغة', 'قسم لغات') OR v_section LIKE '%لغات%' OR v_section LIKE '%لغة%' THEN
    v_section := 'languages';
  ELSE
    SELECT section INTO v_section FROM public.students WHERE id = p_student_id;
  END IF;

  UPDATE public.students SET
    national_id   = NULLIF(trim(p_national_id), ''),
    student_code  = NULLIF(trim(p_student_code), ''),
    full_name     = NULLIF(trim(p_full_name), ''),
    gender        = v_gender,
    grade         = NULLIF(trim(p_grade), ''),
    section       = v_section,
    class_name    = NULLIF(trim(p_class_name), ''),
    father_phone  = NULLIF(trim(p_father_phone), ''),
    mother_phone  = NULLIF(trim(p_mother_phone), ''),
    is_active     = coalesce(p_is_active, true),
    status        = CASE WHEN coalesce(p_is_active, true) THEN 'active' ELSE 'withdrawn' END,
    updated_at    = now()
  WHERE id = p_student_id;

  IF FOUND THEN
    BEGIN
      INSERT INTO public.audit_events(actor_name, actor_role, action, details, level)
      VALUES (
        coalesce(actor.full_name, 'unknown'),
        coalesce(actor.role_type, 'unknown'),
        'edit_student',
        coalesce(p_full_name, '') || ' <' || coalesce(p_national_id, '') || '>',
        'info'
      );
    EXCEPTION WHEN OTHERS THEN
      -- لا تفشل عملية التعديل بسبب سجل التدقيق
      NULL;
    END;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_student(
  uuid, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
