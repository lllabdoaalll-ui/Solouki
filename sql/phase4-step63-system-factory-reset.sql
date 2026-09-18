-- ============================================================
-- Solouki STEP 63 — System Factory Reset
-- تنظيف جميع بيانات التشغيل مع الإبقاء على المسؤول العام
-- والكتالوجات المرجعية (مخالفات / عقوبات / صلاحيات)
-- ============================================================
-- يتطلب امتداد pgcrypto (digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) جدول رموز التحقق لمرة واحدة
CREATE TABLE IF NOT EXISTS public.system_reset_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_ip      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_reset_tokens_user
  ON public.system_reset_tokens (user_id, created_at DESC);

ALTER TABLE public.system_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_reset_tokens_no_direct" ON public.system_reset_tokens;
CREATE POLICY "system_reset_tokens_no_direct" ON public.system_reset_tokens
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 2) هل المستخدم مسؤول عام نشط؟
CREATE OR REPLACE FUNCTION public.is_active_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role_type = 'superadmin'
      AND COALESCE(p.is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_superadmin() TO authenticated;

-- 3) طلب تهيئة إعادة الضبط (من الواجهة) — لا يُرجع الكود الصريح
CREATE OR REPLACE FUNCTION public.request_system_reset_otp(
  p_client_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT public.is_active_superadmin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF (
    SELECT COUNT(*) FROM public.system_reset_tokens t
    WHERE t.user_id = v_uid
      AND t.created_at > NOW() - INTERVAL '15 minutes'
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email_hint', regexp_replace(v_email, '(^.).*(@.*$)', '\1***\2'),
    'user_id', v_uid,
    'message', 'call_edge_function_to_send_otp'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_system_reset_otp(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_system_reset_otp(JSONB) TO authenticated;

-- 4) إصدار الكود (service_role / Edge Function فقط)
CREATE OR REPLACE FUNCTION public.admin_issue_system_reset_otp(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_code TEXT;
  v_hash TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role_type = 'superadmin'
      AND COALESCE(p.is_active, true) = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_superadmin');
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email');
  END IF;

  IF (
    SELECT COUNT(*) FROM public.system_reset_tokens t
    WHERE t.user_id = p_user_id
      AND t.created_at > NOW() - INTERVAL '15 minutes'
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  v_code := lpad((floor(random() * 1000000)::int)::text, 6, '0');
  v_hash := encode(digest(v_code || p_user_id::text, 'sha256'), 'hex');
  v_expires := NOW() + INTERVAL '10 minutes';

  UPDATE public.system_reset_tokens
  SET used_at = NOW()
  WHERE user_id = p_user_id AND used_at IS NULL;

  INSERT INTO public.system_reset_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, v_hash, v_expires);

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'code', v_code,
    'expires_in_seconds', 600
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_issue_system_reset_otp(UUID) FROM PUBLIC;

-- 5) تنفيذ المسح بعد التحقق من الكود
CREATE OR REPLACE FUNCTION public.execute_system_factory_reset(p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_hash TEXT;
  v_token_id UUID;
  v_deleted JSONB := '{}'::jsonb;
  v_count BIGINT;
  v_tbl TEXT;
  v_tables TEXT[] := ARRAY[
    'whatsapp_manual_send_confirmations',
    'student_import_batches',
    'audit_logs',
    'audit_events',
    'violation_followups',
    'guardian_access_codes',
    'merits',
    'merit_records',
    'violation_records',
    'counselor_class_assignments',
    'stage_assignments',
    'stage_whatsapp_settings',
    'students',
    'stages',
    'schools',
    'behaviour_settings',
    'escalation_rules',
    'incident_groups'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT public.is_active_superadmin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_otp IS NULL OR length(trim(p_otp)) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_otp');
  END IF;

  v_hash := encode(digest(trim(p_otp) || v_uid::text, 'sha256'), 'hex');

  SELECT t.id INTO v_token_id
  FROM public.system_reset_tokens t
  WHERE t.user_id = v_uid
    AND t.token_hash = v_hash
    AND t.used_at IS NULL
    AND t.expires_at > NOW()
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF v_token_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'otp_mismatch_or_expired');
  END IF;

  UPDATE public.system_reset_tokens SET used_at = NOW() WHERE id = v_token_id;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_count;
      EXECUTE format('DELETE FROM public.%I', v_tbl);
      v_deleted := v_deleted || jsonb_build_object(v_tbl, v_count);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    SELECT count(*) INTO v_count FROM public.profiles WHERE id <> v_uid;
    DELETE FROM public.profiles WHERE id <> v_uid;
    v_deleted := v_deleted || jsonb_build_object('profiles_other', v_count);
  END IF;

  DELETE FROM public.system_reset_tokens WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'system_wiped',
    'kept_user_id', v_uid,
    'deleted', v_deleted,
    'kept_catalogs', jsonb_build_array(
      'violations_catalog',
      'violation_degrees',
      'violation_locations',
      'penalties',
      'degree_penalty_matrix',
      'permission_catalog',
      'role_permissions'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_system_factory_reset(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_system_factory_reset(TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'STEP 63 SQL ready: factory reset + OTP tokens';
END $$;
