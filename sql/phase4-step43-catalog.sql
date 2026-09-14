-- ============================================================
-- Solouki — Phase 4 / STEP 43: كتالوج المخالفات والعقوبات (قراءة + إدارة محدودة)
-- ============================================================
-- الهدف بالضبط:
--  1) الجداول (violation_degrees / violations_catalog / violation_locations /
--     penalties / degree_penalty_matrix) أُنشئت أصلاً ضمن Schema v1.0، لكن
--     سياسات RLS الحالية عليها مكتوبة لدور anon فقط. النظام تحوّل منذ
--     STEP 40/41 إلى Supabase Auth (auth.uid())، أي أن المستخدم المسجّل
--     دخوله يعمل بدور authenticated — وسياسات anon لا تُطبَّق عليه، فتُحجب
--     عنه هذه الجداول فعليًا رغم أنها للقراءة العامة. هذا السكربت يضيف
--     سياسات SELECT صريحة لدور authenticated دون حذف سياسات anon القديمة.
--  2) "المخالفات" و"الأماكن" فقط قابلتان للتوسّع (حسب تصميمهما الأصلي:
--     عمود is_custom) — عبر دالتين لإضافة عنصر مخصص، ودالتين لتفعيل/إيقاف
--     عنصر قائم. المسؤول العام فقط. الدرجات والعقوبات والمصفوفة ثابتة
--     بنص اللائحة ولا تُدار من الواجهة.
--  3) الدرجة الرابعة (الجرائم الجنائية) مستبعدة من إضافة مخالفات جديدة —
--     نفس مبدأ الكتالوج الأصلي الذي لم يُدرجها.
--
-- نفّذه بعد phase4-step42-*.sql. لا يحذف أو يعدّل بيانات قائمة.
-- ============================================================

-- ------------------------------------------------------------
-- 1) قراءة للمستخدمين المسجّلين (authenticated)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS degrees_read_auth ON public.violation_degrees;
CREATE POLICY degrees_read_auth ON public.violation_degrees
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS catalog_read_auth ON public.violations_catalog;
CREATE POLICY catalog_read_auth ON public.violations_catalog
  FOR SELECT TO authenticated USING (
    is_active = true OR public.solouki_my_role() = 'superadmin'
  );

DROP POLICY IF EXISTS locations_read_auth ON public.violation_locations;
CREATE POLICY locations_read_auth ON public.violation_locations
  FOR SELECT TO authenticated USING (
    is_active = true OR public.solouki_my_role() = 'superadmin'
  );

DROP POLICY IF EXISTS penalties_read_auth ON public.penalties;
CREATE POLICY penalties_read_auth ON public.penalties
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS matrix_read_auth ON public.degree_penalty_matrix;
CREATE POLICY matrix_read_auth ON public.degree_penalty_matrix
  FOR SELECT TO authenticated USING (true);

-- لا سياسات INSERT/UPDATE/DELETE مباشرة على هذه الجداول لدور authenticated.
-- كل تعديل يمر حصرًا عبر الدوال أدناه (SECURITY DEFINER + تحقق من الدور).

-- ------------------------------------------------------------
-- 2) إضافة مخالفة مخصصة (المسؤول العام فقط، درجة 1–3 فقط)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_violation(
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
  v_desc text;
  v_next int;
  v_code text;
  v_row violations_catalog%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_degree_id NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'الدرجة الرابعة لا تُدرَج في الكتالوج — تُحال تلقائيًا للسلطات المختصة';
  END IF;

  v_desc := btrim(coalesce(p_description, ''));
  IF v_desc = '' THEN
    RAISE EXCEPTION 'وصف المخالفة مطلوب';
  END IF;

  -- التالي رقميًا داخل نفس الدرجة، مثل 1.12 بعد 1.11
  SELECT COALESCE(MAX(split_part(code, '.', 2)::int), 0) + 1
  INTO v_next
  FROM violations_catalog
  WHERE degree_id = p_degree_id;

  v_code := p_degree_id::text || '.' || v_next::text;

  INSERT INTO violations_catalog (code, degree_id, description_ar, is_custom, is_active)
  VALUES (v_code, p_degree_id, v_desc, true, true)
  RETURNING * INTO v_row;

  INSERT INTO audit_events (actor_name, actor_role, action, details, level)
  VALUES (actor.full_name, actor.role_type, 'add_violation', v_code || ' — ' || v_desc, 'info');

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_violation(smallint, text) TO authenticated;

-- ------------------------------------------------------------
-- 3) تفعيل/إيقاف مخالفة قائمة (لا حذف — للحفاظ على سجلات المخالفات المرتبطة)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_violation_active(
  p_violation_id int,
  p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_code text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE violations_catalog SET is_active = p_is_active WHERE id = p_violation_id
  RETURNING code INTO v_code;

  IF FOUND THEN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name, actor.role_type,
      CASE WHEN p_is_active THEN 'activate_violation' ELSE 'deactivate_violation' END,
      coalesce(v_code, p_violation_id::text), 'info'
    );
  END IF;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_violation_active(int, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 4) إضافة مكان مخصص لوقوع المخالفة
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_location(
  p_name_ar text
)
RETURNS public.violation_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_name text;
  v_sort int;
  v_row violation_locations%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_name := btrim(coalesce(p_name_ar, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'اسم المكان مطلوب';
  END IF;

  -- يُدرَج قبل "غير ذلك" (sort_order = 99) دائمًا
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort
  FROM violation_locations WHERE sort_order < 99;

  INSERT INTO violation_locations (name_ar, is_custom, is_active, sort_order)
  VALUES (v_name, true, true, v_sort)
  RETURNING * INTO v_row;

  INSERT INTO audit_events (actor_name, actor_role, action, details, level)
  VALUES (actor.full_name, actor.role_type, 'add_location', v_name, 'info');

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_location(text) TO authenticated;

-- ------------------------------------------------------------
-- 5) تفعيل/إيقاف مكان قائم
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_location_active(
  p_location_id int,
  p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  v_name text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL OR actor.role_type <> 'superadmin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE violation_locations SET is_active = p_is_active WHERE id = p_location_id
  RETURNING name_ar INTO v_name;

  IF FOUND THEN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (
      actor.full_name, actor.role_type,
      CASE WHEN p_is_active THEN 'activate_location' ELSE 'deactivate_location' END,
      coalesce(v_name, p_location_id::text), 'info'
    );
  END IF;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_location_active(int, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
