-- ============================================================
-- STEP 53-C: مزامنة المستخدمين الحاليين + إصلاح قيود PIN القديمة
-- ============================================================
-- الهدف:
--   1. جعل أعمدة PIN المهملة قابلة لـ NULL (لم تعد مستخدمة)
--   2. مزامنة كل auth.users مع profiles
--   3. إلزام تغيير كلمة المرور للحسابات التجريبية
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) إزالة NOT NULL من أعمدة PIN المهملة (إن وُجدت)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- pin_hash_deprecated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pin_hash_deprecated'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN pin_hash_deprecated DROP NOT NULL;
  END IF;

  -- pin_plain_deprecated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pin_plain_deprecated'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN pin_plain_deprecated DROP NOT NULL;
  END IF;

  -- احتياطي: إن لم تُعاد التسمية بعد
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN pin_hash DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pin_plain'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN pin_plain DROP NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2) مزامنة auth.users → profiles
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.profiles (
  id,
  full_name,
  email,
  role_type,
  must_change_password,
  is_active
)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1)
  ),
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'role_type',
    'counselor'
  ),
  TRUE,   -- إلزام تغيير كلمة المرور
  TRUE
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email                = COALESCE(EXCLUDED.email, public.profiles.email),
  full_name            = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  must_change_password = TRUE,
  is_active            = TRUE,
  updated_at           = NOW();

-- ─────────────────────────────────────────────────────────────
-- 3) تحقق نهائي
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_auth_count     INT;
  v_profile_count  INT;
  v_must_count     INT;
  v_missing        INT;
BEGIN
  SELECT COUNT(*) INTO v_auth_count FROM auth.users;
  SELECT COUNT(*) INTO v_profile_count FROM public.profiles;
  SELECT COUNT(*) INTO v_must_count
    FROM public.profiles WHERE must_change_password = TRUE;

  SELECT COUNT(*) INTO v_missing
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE ' ✅ STEP 53-C — تمت المزامنة';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE ' مستخدمو Auth: %', v_auth_count;
  RAISE NOTICE ' ملفات profiles: %', v_profile_count;
  RAISE NOTICE ' بحاجة لتغيير كلمة المرور: %', v_must_count;
  RAISE NOTICE ' مستخدمون بدون profile: %', v_missing;
  RAISE NOTICE '════════════════════════════════════════';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
