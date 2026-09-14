-- ============================================================
-- Solouki — Phase 4 / STEP 43.2: تعديل / نقل درجة / حذف مخالفة مخصصة
-- (نسخة مُصلحة — level=info + رسائل أوضح)
-- نفّذه في Supabase SQL Editor حتى لو نُفِّذ سابقًا (CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_violation(
  p_violation_id int,
  p_degree_id smallint,
  p_description text
)
RETURNS public.violations_catalog
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_row violations_catalog%rowtype;
  v_desc text;
  v_next int;
  v_code text;
  v_old_code text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM violations_catalog WHERE id = p_violation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المخالفة غير موجودة';
  END IF;

  IF coalesce(v_row.is_custom, false) = false THEN
    RAISE EXCEPTION 'لا يمكن تعديل مخالفات اللائحة الرسمية — المخصصة فقط';
  END IF;

  IF p_degree_id NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'الدرجة يجب أن تكون 1 أو 2 أو 3';
  END IF;

  v_desc := btrim(coalesce(p_description, ''));
  IF v_desc = '' THEN
    RAISE EXCEPTION 'وصف المخالفة مطلوب';
  END IF;

  v_old_code := v_row.code;

  IF v_row.degree_id IS DISTINCT FROM p_degree_id THEN
    SELECT COALESCE(MAX(split_part(code, '.', 2)::int), 0) + 1
    INTO v_next
    FROM violations_catalog
    WHERE degree_id = p_degree_id
      AND id <> p_violation_id;

    v_code := p_degree_id::text || '.' || v_next::text;
  ELSE
    v_code := v_row.code;
  END IF;

  UPDATE violations_catalog
  SET
    degree_id = p_degree_id,
    description_ar = v_desc,
    code = v_code
  WHERE id = p_violation_id
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name,
      actor.role_type,
      'update_violation',
      coalesce(v_old_code, '') || ' → ' || v_row.code || ' — ' || v_desc,
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_violation(int, smallint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_violation(
  p_violation_id int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_row violations_catalog%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM violations_catalog WHERE id = p_violation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المخالفة غير موجودة';
  END IF;

  IF coalesce(v_row.is_custom, false) = false THEN
    RAISE EXCEPTION 'لا يمكن حذف مخالفات اللائحة الرسمية — المخصصة فقط';
  END IF;

  BEGIN
    DELETE FROM violations_catalog WHERE id = p_violation_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'لا يمكن الحذف: المخالفة مرتبطة بسجلات أخرى. استخدم إيقاف بدلًا من الحذف.';
  END;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name,
      actor.role_type,
      'delete_violation',
      coalesce(v_row.code, p_violation_id::text) || ' — ' || coalesce(v_row.description_ar, ''),
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_violation(int) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_update_violation'
      AND pg_get_function_identity_arguments(p.oid) = 'p_violation_id integer, p_description text, p_degree_id smallint'
  ) THEN
    DROP FUNCTION public.admin_update_violation(int, text, smallint);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
