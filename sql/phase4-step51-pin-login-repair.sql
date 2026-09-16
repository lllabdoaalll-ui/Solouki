-- Solouki — Step 51: PIN Login Repair / Compatibility
-- Run once in Supabase SQL Editor, then deploy the Edge Function:
--   supabase functions deploy pin-login
--
-- This ensures the RPCs used by the PIN login function are current.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  FROM public.profiles
  WHERE id = p_user_id AND is_active = true;

  IF stored_hash IS NULL OR p_pin IS NULL OR length(trim(p_pin)) = 0 THEN
    RETURN false;
  END IF;

  RETURN stored_hash = crypt(trim(p_pin), stored_hash);
END;
$$;

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
  FROM public.profiles
  WHERE id = p_user_id AND is_active = true;

  IF stored_hash IS NULL OR p_pin IS NULL OR length(trim(p_pin)) = 0 THEN
    RETURN false;
  END IF;

  RETURN stored_hash = crypt(trim(p_pin), stored_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_pin_service(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_pin(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_staff_for_login()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.role_sort, x.full_name), '[]'::jsonb)
  FROM (
    SELECT p.id, p.full_name, p.role_type,
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
      AND p.pin_hash LIKE '$2%'
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.list_staff_for_login() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- Safe diagnostic; never displays the PIN itself:
-- SELECT id, full_name, email, role_type, is_active,
--   CASE WHEN pin_hash IS NULL THEN 'NO_PIN'
--        WHEN pin_hash LIKE '$2%' THEN 'BCRYPT'
--        ELSE 'OTHER_FORMAT' END AS pin_format
-- FROM public.profiles
-- WHERE is_active = true
--   AND role_type IN ('superadmin','stage_manager','it_officer','counselor')
-- ORDER BY full_name;
