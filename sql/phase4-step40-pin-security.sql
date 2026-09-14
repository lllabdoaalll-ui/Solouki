-- ============================================================
-- Solouki — Phase 4 / STEP 40: PIN Security Hardening
-- ============================================================
-- الهدف: التوقف عن تخزين/عرض الرقم السري (PIN) بصورته الصريحة بشكل
-- دائم. المرجع الوحيد للتحقق يظل pin_hash (bcrypt عبر pgcrypto).
-- هذا السكربت آمن للتشغيل على قاعدة تعمل بالفعل: لا يحذف أي جدول
-- ولا يفقد أي مستخدم قدرته على الدخول.
--
-- نفّذه في SQL Editor بعد نسخة Phase 3 (وبعد verify_pin.sql).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- سجل توقيت آخر إصدار/تجديد للـ PIN (مفيد للتدقيق ولمعرفة الحسابات
-- التي لم تُطبع بطاقتها بعد).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_last_reset_at timestamptz;

-- ------------------------------------------------------------
-- 1) دالة إصدار/تجديد PIN من الواجهة (لمسؤول عام فقط)
--    تُستخدم من زر "تجديد وطباعة" في صفحة الأدوار، وأيضًا عند
--    تعديل مستخدم قائم يحتاج رقمًا جديدًا.
--    تُعيد الرقم الصريح مرة واحدة فقط في نتيجة الاستدعاء؛ لا يتم
--    حفظه صريحًا في قاعدة البيانات إطلاقًا.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_pin(
  p_profile_id uuid,
  p_pin text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  target profiles%rowtype;
  new_pin text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO target FROM profiles WHERE id = p_profile_id;
  IF target.id IS NULL OR target.school_id IS DISTINCT FROM actor.school_id THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF p_pin IS NULL THEN
    new_pin := lpad(floor(random() * 1000000)::int::text, 6, '0');
  ELSE
    IF p_pin !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'invalid pin';
    END IF;
    new_pin := p_pin;
  END IF;

  UPDATE profiles
    SET pin_hash = crypt(new_pin, gen_salt('bf')),
        pin_plain = NULL,
        pin_last_reset_at = now(),
        updated_at = now()
    WHERE id = p_profile_id;

  PERFORM record_role_audit('pin_reset', target.full_name || ' <' || coalesce(target.email,'') || '>', 'info');

  RETURN new_pin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_pin(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) تحديث الدالة المستخدمة من الاستيراد الجماعي (service_role)
--    بحيث تتوقف هي أيضًا عن الاحتفاظ بالنص الصريح.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_profile_pin(p_profile_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(p_pin) <> 6 OR p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'invalid pin';
  END IF;
  UPDATE profiles
    SET pin_hash = crypt(p_pin, gen_salt('bf')),
        pin_plain = NULL,
        pin_last_reset_at = now(),
        updated_at = now()
    WHERE id = p_profile_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_pin(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 3) ترحيل تنظيفي: أي صف لديه بالفعل pin_hash صالح لا يحتاج أن
--    يبقى محتفظًا بنسخة صريحة من رقمه القديم في pin_plain.
--    (لا يمس pin_hash إطلاقًا، فلن يتأثر تسجيل الدخول لأحد.)
-- ------------------------------------------------------------
UPDATE public.profiles
  SET pin_plain = NULL
  WHERE pin_hash IS NOT NULL AND pin_plain IS NOT NULL;

-- ------------------------------------------------------------
-- ملاحظة (لا يُنفَّذ تلقائيًا): بعد التأكد أن لا كود آخر يقرأ
-- عمود pin_plain، يمكن حذفه نهائيًا لاحقًا بأمر منفصل:
--   ALTER TABLE public.profiles DROP COLUMN pin_plain;
-- تُرك هذا الحذف لخطوة لاحقة تالية لفترة تشغيل تجريبي مستقرة،
-- تماشيًا مع سياسة "لا نكسر شيئًا يعمل".
-- ------------------------------------------------------------
