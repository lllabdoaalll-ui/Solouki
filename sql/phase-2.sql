-- Solouki Phase 2: role-management helpers.
-- Run after the existing Phase-0/Phase-1 schema. This script does not drop data.

CREATE OR REPLACE FUNCTION public.set_profile_active(p_profile_id uuid,p_is_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text;
BEGIN
 SELECT role_type INTO r FROM profiles WHERE id=auth.uid() AND is_active=true;
 IF r IS DISTINCT FROM 'superadmin' THEN RAISE EXCEPTION 'not authorized'; END IF;
 UPDATE profiles SET is_active=p_is_active,updated_at=now()
 WHERE id=p_profile_id AND role_type <> 'superadmin';
 RETURN FOUND;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_profile_active(uuid,boolean) TO authenticated;

-- Audit helper for role changes.
CREATE OR REPLACE FUNCTION public.record_role_audit(p_action text,p_details text,p_level text DEFAULT 'info')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p profiles%rowtype; x uuid;
BEGIN
 SELECT * INTO p FROM profiles WHERE id=auth.uid() AND is_active=true;
 IF p.id IS NULL OR p.role_type <> 'superadmin' THEN RAISE EXCEPTION 'not authorized'; END IF;
 INSERT INTO audit_events(actor_name,actor_role,action,details,level)
 VALUES(p.full_name,p.role_type,p_action,p_details,p_level) RETURNING id INTO x;
 RETURN x;
END; $$;

GRANT EXECUTE ON FUNCTION public.record_role_audit(text,text,text) TO authenticated;


-- Bulk import support: sections are stored as a small JSON array for IT officers.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Keep the audit helper available to the server-side Edge Function.
GRANT EXECUTE ON FUNCTION public.record_role_audit(text,text,text) TO service_role;


-- Secure PIN setter used by the server-side bulk importer.
CREATE OR REPLACE FUNCTION public.set_profile_pin(p_profile_id uuid,p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(p_pin) <> 6 OR p_pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'invalid pin'; END IF;
 UPDATE profiles SET pin_hash=crypt(p_pin,gen_salt('bf')), pin_plain=p_pin, updated_at=now()
 WHERE id=p_profile_id;
 RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_profile_pin(uuid,text) TO service_role;
