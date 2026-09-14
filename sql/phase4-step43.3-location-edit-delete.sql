-- ============================================================
-- Solouki — Phase 4 / STEP 43.3: تعديل / حذف مكان مخصص
-- المسؤول العام فقط. الأماكن النظامية: إيقاف/تفعيل فقط.
-- نفّذه بعد phase4-step43-catalog.sql و step43.2
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_location(
  p_location_id int,
  p_name_ar text
)
RETURNS public.violation_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_row violation_locations%rowtype;
  v_name text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM violation_locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المكان غير موجود';
  END IF;

  IF coalesce(v_row.is_custom, false) = false THEN
    RAISE EXCEPTION 'لا يمكن تعديل الأماكن النظامية — المخصصة فقط';
  END IF;

  v_name := btrim(coalesce(p_name_ar, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'اسم المكان مطلوب';
  END IF;

  UPDATE violation_locations
  SET name_ar = v_name
  WHERE id = p_location_id
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (actor.full_name, actor.role_type, 'update_location', v_name, 'info');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_location(int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_location(
  p_location_id int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_row violation_locations%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM violation_locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المكان غير موجود';
  END IF;

  IF coalesce(v_row.is_custom, false) = false THEN
    RAISE EXCEPTION 'لا يمكن حذف الأماكن النظامية — المخصصة فقط';
  END IF;

  BEGIN
    DELETE FROM violation_locations WHERE id = p_location_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'لا يمكن الحذف: المكان مرتبط بسجلات أخرى. استخدم إيقاف بدلًا من الحذف.';
  END;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name,
      actor.role_type,
      'delete_location',
      coalesce(v_row.name_ar, p_location_id::text),
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_location(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
