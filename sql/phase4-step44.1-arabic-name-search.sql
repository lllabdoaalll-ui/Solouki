-- ============================================================
-- Solouki — Phase 4 / STEP 44.1: تطبيع الأسماء العربية في بحث المخالفات
-- نفس قواعد قراءة الأسماء المستخدمة في Financial_Filter.html
-- نفّذه بعد phase4-step44-record-violation.sql
-- ============================================================

-- ------------------------------------------------------------
-- دالة تطبيع الاسم العربي (Immutable — آمنة للفهرسة لاحقاً)
-- قواعد مطابقة لملف Financial_Filter:
--   - إزالة التشكيل والـ tatweel
--   - توحيد الحروف المتشابهة: إأآا→ا ، ى→ي ، ة→ه ، ؤ→و ، ئ→ي
--   - توحيد "عبد " بدون مسافة زائدة
--   - إزالة بادئات أبو/أب/ابو/اب
--   - فصل مركّبات: ...الدين / ...الاسلام / ...الله
--   - توحيد المسافات
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_arabic_name(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  s text;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN
    RETURN '';
  END IF;

  s := btrim(t);

  -- إزالة التشكيل والـ tatweel (ـ)
  s := regexp_replace(s, '[\u064B-\u0652\u0670\u0640]', '', 'g');

  -- توحيد الحروف المتشابهة
  s := translate(s,
    'إأآاٱىةؤئ',
    'ااااايهوي'
  );

  -- عبد بدون مسافة زائدة بعدها
  s := regexp_replace(s, 'عبد\s+', 'عبد', 'g');

  -- إزالة بادئات أبو / أب / ابو / اب (مع المسافة بعدها إن وُجدت)
  s := regexp_replace(s, '(أبو|أب|ابو|اب)\s*', '', 'g');

  -- فصل المركّبات الشائعة (الدين، الاسلام، الله)
  s := regexp_replace(s, '([دحمجلسكتبرصعقفقطظثذشخغهيونزلر])الدين', E'\\1 الدين', 'g');
  s := regexp_replace(s, '([دحمجلسكتبرصعقفقطظثذشخغهيونزلر])الاسلام', E'\\1 الاسلام', 'g');
  s := regexp_replace(s, '([دحمجلسكتبرصعقفقطظثذشخغهيونزلر])الله', E'\\1 الله', 'g');

  -- توحيد المسافات المتعددة
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := btrim(s);

  RETURN s;
END;
$$;

COMMENT ON FUNCTION public.normalize_arabic_name(text) IS
  'تطبيع أسماء عربية للمطابقة المرنة — مطابق لقواعد Financial_Filter';

-- ------------------------------------------------------------
-- تحديث دالة البحث لاستخدام التطبيع على الاسم
-- مع الإبقاء على البحث العادي في الرقم القومي ورقم الجلوس/الكود
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_students_for_violation(
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  full_name text,
  national_id text,
  stage_id text,
  grade text,
  class_name text,
  section text,
  academic_year text,
  school_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  q text;
  q_norm text;
BEGIN
  SELECT * INTO actor FROM profiles WHERE profiles.id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  q := btrim(coalesce(p_query, ''));
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  q_norm := public.normalize_arabic_name(q);

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.national_id,
    s.stage_id,
    s.grade,
    s.class_name,
    s.section,
    s.academic_year,
    st.school_id
  FROM students s
  JOIN stages st ON st.id = s.stage_id
  WHERE s.is_active = true
    AND (
      -- بحث بالاسم بعد التطبيع (يغطي اختلافات الهمزات والياء/الألف والـ أبو/عبد ...)
      (q_norm <> '' AND public.normalize_arabic_name(s.full_name) ILIKE '%' || q_norm || '%')
      -- أو بحث عادي بدون تطبيع (للاحتياط إذا كان المستخدم يكتب حرفياً)
      OR s.full_name ILIKE '%' || q || '%'
      -- الرقم القومي
      OR s.national_id ILIKE '%' || q || '%'
      -- رقم الجلوس / كود الطالب (دعم العمودين إن وُجدا)
      OR coalesce(s.student_code, '') ILIKE '%' || q || '%'
      OR coalesce(s.seat_number, '') ILIKE '%' || q || '%'
    )
    AND (
      actor.role_type = 'superadmin'
      OR (
        actor.role_type IN ('stage_manager', 'it_officer')
        AND s.stage_id IN (
          SELECT sa.stage_id FROM stage_assignments sa WHERE sa.profile_id = actor.id
        )
      )
      OR (
        actor.role_type = 'counselor'
        AND EXISTS (
          SELECT 1 FROM counselor_class_assignments c
          WHERE c.counselor_id = actor.id
            AND c.stage_id = s.stage_id
            AND c.grade = s.grade
            AND c.class_name = s.class_name
            AND c.section = s.section
        )
      )
    )
  ORDER BY
    -- تفضيل التطابق الأدق أولاً (الاسم المطابق بعد التطبيع يبدأ بنفس النص)
    CASE
      WHEN q_norm <> '' AND public.normalize_arabic_name(s.full_name) ILIKE q_norm || '%' THEN 0
      WHEN q_norm <> '' AND public.normalize_arabic_name(s.full_name) ILIKE '%' || q_norm || '%' THEN 1
      ELSE 2
    END,
    s.full_name
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_students_for_violation(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_arabic_name(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
