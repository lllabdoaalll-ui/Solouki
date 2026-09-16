-- ============================================================
-- STEP 53: التحول من PIN إلى بريد + كلمة مرور
-- ============================================================
-- الهدف:
--   1. إضافة عمود must_change_password لإلزام تغيير كلمة المرور
--   2. Trigger ينشئ profile تلقائياً عند إنشاء مستخدم في auth.users
--   3. دالة mark_password_changed() لتحديث الحالة
--   4. إعادة تسمية أعمدة PIN (بدل حذفها) — حماية مؤقتة
--   5. حذف دوال PIN القديمة
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) أعمدة جديدة في profiles
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'TRUE = يجب تغيير كلمة المرور قبل الدخول (أول دخول أو بعد إعادة تعيين)';
COMMENT ON COLUMN public.profiles.password_changed_at IS
  'تاريخ آخر تغيير لكلمة المرور';
COMMENT ON COLUMN public.profiles.last_login_at IS
  'تاريخ آخر تسجيل دخول ناجح';

-- ─────────────────────────────────────────────────────────────
-- 2) حذف دوال PIN القديمة
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.verify_pin(uuid, text);
DROP FUNCTION IF EXISTS public.verify_pin_service(uuid, text);
DROP FUNCTION IF EXISTS public.list_staff_for_login();
DROP FUNCTION IF EXISTS public.admin_set_profile_pin(uuid, text);
DROP FUNCTION IF EXISTS public.set_profile_pin(uuid, text);
DROP FUNCTION IF EXISTS public.admin_set_pin(uuid, text);
DROP FUNCTION IF EXISTS public.admin_reset_pin(uuid);
DROP FUNCTION IF EXISTS public.set_pin(uuid, text);
DROP FUNCTION IF EXISTS public.reset_user_pin(uuid);
DROP FUNCTION IF EXISTS public.generate_random_pin();

-- ─────────────────────────────────────────────────────────────
-- 3) إعادة تسمية أعمدة PIN (بدل الحذف — حماية مؤقتة)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='profiles'
               AND column_name='pin_hash') THEN
    ALTER TABLE public.profiles RENAME COLUMN pin_hash TO pin_hash_deprecated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='profiles'
               AND column_name='pin_plain') THEN
    ALTER TABLE public.profiles RENAME COLUMN pin_plain TO pin_plain_deprecated;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4) Trigger: إنشاء profile تلقائياً عند إضافة مستخدم
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role_type, email,
    must_change_password, is_active
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role_type', 'counselor'),
    NEW.email,
    TRUE,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────
-- 5) دالة mark_password_changed
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET must_change_password = FALSE,
      password_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) دالة record_last_login
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_last_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = NOW()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_last_login() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7) تحقق نهائي
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_pin_hash BOOLEAN;
  v_has_pin_deprecated BOOLEAN;
  v_must_count INT;
  v_total_profiles INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND column_name='pin_hash'
  ) INTO v_has_pin_hash;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND column_name='pin_hash_deprecated'
  ) INTO v_has_pin_deprecated;

  SELECT COUNT(*) INTO v_must_count
  FROM public.profiles WHERE must_change_password = TRUE;

  SELECT COUNT(*) INTO v_total_profiles FROM public.profiles;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE ' ✅ STEP 53 — تم التنفيذ بنجاح';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE ' عمود pin_hash الأصلي موجود؟ %', v_has_pin_hash;
  RAISE NOTICE ' عمود pin_hash_deprecated موجود؟ %', v_has_pin_deprecated;
  RAISE NOTICE ' إجمالي المستخدمين: %', v_total_profiles;
  RAISE NOTICE ' بحاجة لتغيير كلمة المرور: %', v_must_count;
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE ' الخطوة التالية:';
  RAISE NOTICE ' 1. فعّل Email Provider في Authentication → Providers';
  RAISE NOTICE ' 2. اضبط Site URL في Authentication → URL Configuration';
  RAISE NOTICE ' 3. أضف Redirect URL: https://YOUR-DOMAIN/reset-password.html';
  RAISE NOTICE ' 4. أنشئ المستخدمين من Authentication → Add User';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

COMMIT;

-- إعادة تحميل مخطط PostgREST
NOTIFY pgrst, 'reload schema';
