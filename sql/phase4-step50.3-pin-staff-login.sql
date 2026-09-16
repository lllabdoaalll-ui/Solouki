-- STEP 50.3: دخول الطاقم بالاسم + PIN (أسلوب نظام رصد الدرجات)
-- قائمة أسماء للدخول (بدون بيانات حساسة) + تحقق PIN للخدمة

CREATE OR REPLACE FUNCTION public.list_staff_for_login()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.role_sort, x.full_name), '[]'::jsonb)
  FROM (
    SELECT
      p.id,
      p.full_name,
      p.role_type,
      CASE p.role_type
        WHEN 'superadmin' THEN 1
        WHEN 'stage_manager' THEN 2
        WHEN 'it_officer' THEN 3
        WHEN 'counselor' THEN 4
        ELSE 9
      END AS role_sort
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.role_type IN ('superadmin', 'stage_manager', 'it_officer', 'counselor')
      AND p.pin_hash IS NOT NULL
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.list_staff_for_login() TO anon, authenticated;

-- تحقق PIN قابل للاستدعاء من service_role / edge
CREATE OR REPLACE FUNCTION public.verify_pin_service(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT pin_hash INTO stored_hash
  FROM profiles
  WHERE id = p_user_id AND is_active = true;
  IF stored_hash IS NULL THEN RETURN false; END IF;
  RETURN (stored_hash = crypt(p_pin, stored_hash));
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_pin_service(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_pin(uuid, text) TO service_role;

-- تأكد أن verify_pin الأصلي يعمل
CREATE OR REPLACE FUNCTION public.verify_pin(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT pin_hash INTO stored_hash
  FROM profiles
  WHERE id = p_user_id AND is_active = true;
  IF stored_hash IS NULL THEN RETURN false; END IF;
  RETURN (stored_hash = crypt(p_pin, stored_hash));
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_pin(uuid, text) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
