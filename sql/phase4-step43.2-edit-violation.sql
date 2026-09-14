-- ============================================================
-- Solouki — Phase 4 / STEP 43.2: تعديل مخالفة مخصصة
-- ============================================================
-- يسمح للمسؤول العام بتعديل وصف ودرجة المخالفات المخصصة فقط
-- (is_custom = true). المخالفات الثابتة من اللائحة لا تُعدَّل.
-- نفّذه بعد phase4-step43-catalog.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_violation(
  p_violation_id int,
  p_description text,
  p_degree_id smallint DEFAULT NULL
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
  v_degree smallint;
  v_next int;
  v_code text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM violations_catalog WHERE id = p_violation_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'المخالفة غير موجودة';
  END IF;

  IF coalesce(v_row.is_custom, false) = false THEN
    RAISE EXCEPTION 'لا يمكن تعديل مخالفات اللائحة الثابتة — التعديل للمخصصة فقط';
  END IF;

  v_desc := btrim(coalesce(p_description, ''));
  IF v_desc = '' THEN
    RAISE EXCEPTION 'وصف المخالفة مطلوب';
  END IF;

  -- الدرجة: إن لم تُمرَّر تبقى كما هي
  v_degree := coalesce(p_degree_id, v_row.degree_id);
  IF v_degree NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'الدرجة يجب أن تكون 1 أو 2 أو 3';
  END IF;

  -- إذا تغيّرت الدرجة: أعد توليد الكود ضمن الدرجة الجديدة
  IF v_degree <> v_row.degree_id THEN
    SELECT COALESCE(MAX(split_part(code, '.', 2)::int), 0) + 1
    INTO v_next
    FROM violations_catalog
    WHERE degree_id = v_degree AND id <> p_violation_id;

    v_code := v_degree::text || '.' || v_next::text;

    UPDATE violations_catalog
    SET description_ar = v_desc,
        degree_id = v_degree,
        code = v_code
    WHERE id = p_violation_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE violations_catalog
    SET description_ar = v_desc
    WHERE id = p_violation_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO audit_events (actor_name, actor_role, action, details, level)
  VALUES (
    actor.full_name,
    actor.role_type,
    'update_violation',
    v_row.code || ' — ' || v_desc,
    'info'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_violation(int, text, smallint) TO authenticated;

NOTIFY pgrst, 'reload schema';
