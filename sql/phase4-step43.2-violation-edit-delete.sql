-- ============================================================
-- Solouki — Phase 4 / STEP 43.2: تعديل / نقل درجة / حذف مخالفة مخصصة
-- ============================================================
-- - تعديل الوصف ونقل الدرجة (1–3) للمخالفات المخصصة فقط
-- - عند تغيير الدرجة يُعاد توليد الكود داخل الدرجة الجديدة
-- - الحذف النهائي للمخصصة فقط (لا يُمس المخالفات النظامية من اللائحة)
-- نفّذه بعد phase4-step43-catalog.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) تعديل مخالفة مخصصة (وصف + درجة)
-- ------------------------------------------------------------
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

  -- إن تغيّرت الدرجة: كود جديد داخل الدرجة الهدف
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

  INSERT INTO audit_events (actor_name, actor_role, action, details, level)
  VALUES (
    actor.full_name,
    actor.role_type,
    'update_violation',
    coalesce(v_old_code, '') || ' → ' || v_row.code || ' — ' || v_desc,
    'info'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_violation(int, smallint, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) حذف مخالفة مخصصة نهائيًا
-- ------------------------------------------------------------
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

  -- إن وُجدت جداول مرتبطة لاحقًا قد يفشل الحذف بقيود FK — الرسالة ستكون واضحة
  DELETE FROM violations_catalog WHERE id = p_violation_id;

  INSERT INTO audit_events (actor_name, actor_role, action, details, level)
  VALUES (
    actor.full_name,
    actor.role_type,
    'delete_violation',
    coalesce(v_row.code, p_violation_id::text) || ' — ' || coalesce(v_row.description_ar, ''),
    'warn'
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_violation(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
