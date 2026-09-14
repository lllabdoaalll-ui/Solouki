-- تحسين توليد PIN العشوائي (6 أرقام) مع تجنب الأرقام الضعيفة
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
  i int;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO target FROM profiles WHERE id = p_profile_id;
  IF target.id IS NULL OR target.school_id IS DISTINCT FROM actor.school_id THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF p_pin IS NULL OR length(trim(p_pin)) = 0 THEN
    FOR i IN 1..30 LOOP
      new_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
      IF new_pin NOT IN ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','121212','112233') THEN
        EXIT;
      END IF;
    END LOOP;
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

  BEGIN
    PERFORM record_role_audit('pin_reset', target.full_name || ' <' || coalesce(target.email,'') || '>', 'info');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN new_pin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_pin(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
