-- ============================================================
-- Solouki — Phase 4 / STEP 41: نظام صلاحيات مرن + تعديل بيانات الطالب يدويًا
-- ============================================================
-- الهدف بالضبط:
--  1) إطار صلاحيات عام قابل للتوسع: لكل صلاحية ولكل دور (مدير مرحلة/
--     مسؤول حاسب/أخصائي) وضع من ثلاثة: لا يوجد (none) / مراقب فقط
--     (observer) / فعّال (active). المسؤول العام دائمًا "فعّال" في كل
--     شيء بحكم دوره، ولا يظهر في الجدول لأنه غير قابل للتقييد.
--  2) أول صلاحية تُدار بهذا الإطار: "تعديل بيانات الطالب يدويًا".
--     الميزة نفسها (نموذج التعديل) كانت موجودة بالفعل في الواجهة،
--     لكنها كانت تعتمد على صلاحية RLS العامة لجدول students، وهذا
--     السكربت يضيف قفلًا صريحًا على مستوى الإجراء (RPC) بدل الاعتماد
--     على RLS وحدها لهذا الإجراء تحديدًا.
--
-- نفّذه بعد Phase 3 و phase4-step40-pin-security.sql.
-- لا يحذف أو يعطّل أي صلاحية RLS قائمة على جدول students، لذلك عملية
-- استيراد Excel الحالية (لمسؤول الحاسب/مدير المرحلة) تستمر كما هي.
-- ============================================================

-- ------------------------------------------------------------
-- 1) كتالوج الصلاحيات (قابل للتوسع مستقبلًا بإضافة صف جديد فقط)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permission_catalog (
  key text PRIMARY KEY,
  label_ar text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.permission_catalog (key, label_ar, category, sort_order) VALUES
  ('edit_students', 'تعديل بيانات الطالب يدويًا (الاسم، الرقم القومي، الفصل، وباقي البيانات)', 'students', 1)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2) جدول الصلاحيات لكل دور: none / observer / active
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_type text NOT NULL CHECK (role_type IN ('stage_manager','it_officer','counselor')),
  permission_key text NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'none' CHECK (mode IN ('none','observer','active')),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_type, permission_key)
);

-- قيم افتراضية تحافظ على السلوك الحالي دون كسر شيء:
--  - مدير المرحلة كان بالفعل يملك صلاحية الكتابة على جدول الطلاب عبر
--    RLS، فنُبقيها "فعّال" افتراضيًا حتى لا نكسر شيئًا يعمل.
--  - مسؤول الحاسب لم تكن لديه هذه الميزة في الواجهة أصلًا، فتبدأ
--    "لا يوجد" إلى أن يفعّلها المسؤول العام صراحة من شاشة الصلاحيات.
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('stage_manager', 'edit_students', 'active'),
  ('it_officer', 'edit_students', 'none'),
  ('counselor', 'edit_students', 'none')
ON CONFLICT (role_type, permission_key) DO NOTHING;

ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- القراءة متاحة لأي مستخدم مسجّل (لا بيانات حساسة هنا، مجرد إعدادات
-- صلاحيات)؛ الكتابة تمر حصرًا عبر set_role_permission بالأسفل — لا
-- توجد أي سياسة INSERT/UPDATE/DELETE، أي أنها ممنوعة افتراضيًا تحت RLS.
DROP POLICY IF EXISTS permission_catalog_read ON public.permission_catalog;
CREATE POLICY permission_catalog_read ON public.permission_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 3) دالة قراءة صلاحية المستخدم الحالي (لواجهات الأخصائي/مسؤول
--    الحاسب/مدير المرحلة كي تقرر إظهار زر "تعديل" أو "عرض" أو الإخفاء)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_permission(p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.solouki_my_role() = 'superadmin' THEN 'active'
    ELSE COALESCE(
      (SELECT mode FROM role_permissions
        WHERE role_type = public.solouki_my_role() AND permission_key = p_key),
      'none')
  END;
$$;

GRANT EXECUTE ON FUNCTION public.my_permission(text) TO authenticated;

-- ------------------------------------------------------------
-- 4) دالة ضبط الصلاحية — للمسؤول العام فقط (تُستخدم من شاشة الصلاحيات)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_role_permission(
  p_role_type text,
  p_permission_key text,
  p_mode text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.solouki_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_role_type NOT IN ('stage_manager','it_officer','counselor') THEN
    RAISE EXCEPTION 'invalid role_type';
  END IF;
  IF p_mode NOT IN ('none','observer','active') THEN
    RAISE EXCEPTION 'invalid mode';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permission_catalog WHERE key = p_permission_key) THEN
    RAISE EXCEPTION 'unknown permission';
  END IF;

  INSERT INTO role_permissions (role_type, permission_key, mode, updated_by, updated_at)
  VALUES (p_role_type, p_permission_key, p_mode, auth.uid(), now())
  ON CONFLICT (role_type, permission_key)
  DO UPDATE SET mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now();

  PERFORM record_role_audit('set_role_permission', p_role_type || ' / ' || p_permission_key || ' → ' || p_mode, 'info');
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_role_permission(text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 5) تعديل بيانات الطالب عبر إجراء صريح يفرض القاعدة الجديدة:
--    المسؤول العام دائمًا مسموح؛ غيره يُشترط أن يكون لديه "فعّال" في
--    edit_students (وهذا يشمل مدير المرحلة بقيمته الافتراضية أعلاه،
--    ومسؤول الحاسب فقط بعد أن يفعّلها المسؤول العام).
-- ------------------------------------------------------------
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
  actor profiles%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF actor.role_type IS DISTINCT FROM 'superadmin' AND public.my_permission('edit_students') <> 'active' THEN
    RAISE EXCEPTION 'not authorized: edit_students permission required';
  END IF;

  UPDATE students SET
    national_id = p_national_id,
    student_code = p_student_code,
    full_name = p_full_name,
    gender = p_gender,
    grade = p_grade,
    section = p_section,
    class_name = p_class_name,
    father_phone = p_father_phone,
    mother_phone = p_mother_phone,
    is_active = p_is_active,
    status = CASE WHEN p_is_active THEN 'active' ELSE 'withdrawn' END,
    updated_at = now()
  WHERE id = p_student_id;

  -- تسجيل مباشر في سجل التدقيق (وليس عبر record_role_audit المقيّدة
  -- بالمسؤول العام فقط)، لأن هذا الإجراء نفسه صرّح بالفعل بصلاحية
  -- الفاعل أعلاه (مسؤول عام أو صاحب صلاحية "فعّال" في edit_students).
  IF FOUND THEN
    INSERT INTO audit_events(actor_name, actor_role, action, details, level)
    VALUES (actor.full_name, actor.role_type, 'edit_student', p_full_name || ' <' || coalesce(p_national_id,'') || '>', 'info');
  END IF;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_student(uuid,text,text,text,text,text,text,text,text,text,boolean) TO authenticated;
