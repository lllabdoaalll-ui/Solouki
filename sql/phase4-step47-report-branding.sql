-- ============================================================
-- Solouki — Phase 4 / STEP 47: هوية التقارير المطبوعة
-- إعدادات الترويسة + الشعارات (عربي / لغات) + نصوص رسمية
-- نفّذه بعد step46
-- ============================================================

CREATE TABLE IF NOT EXISTS public.school_report_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  governorate text NOT NULL DEFAULT '',
  directorate text NOT NULL DEFAULT '',
  administration text NOT NULL DEFAULT '',
  school_name text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '',
  -- شعارات: data URL أو رابط عام
  logo_right text,
  logo_left_arabic text,
  logo_left_languages text,
  -- مناصب التوقيع
  sign_counselor_title text NOT NULL DEFAULT 'الأخصائي الاجتماعي',
  sign_stage_manager_title text NOT NULL DEFAULT 'مدير المرحلة',
  sign_principal_title text NOT NULL DEFAULT 'مدير المدرسة',
  -- نصوص رسمية
  intro_text text NOT NULL DEFAULT 'تحية طيبة وبعد، نحيط سيادتكم علماً بأن الطالب/ة الموضّح بياناته بعاليه قد ثبت بحقه/ها المخالفات السلوكية المبيّنة بالجدول أدناه، وذلك وفقاً للائحة التحفيز التربوي والانضباط المدرسي الصادرة بالقرار الوزاري رقم (150) لسنة 2024.',
  notice_text text NOT NULL DEFAULT 'لذا لزم الإحاطة والتنويه بالعلم، مع رجاء التعاون مع إدارة المدرسة لتعديل السلوك ومتابعة الطالب/ة.',
  closing_text text NOT NULL DEFAULT 'وتفضلوا بقبول فائق الاحترام والتقدير.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

INSERT INTO public.school_report_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.school_report_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_report_settings_read ON public.school_report_settings;
CREATE POLICY school_report_settings_read ON public.school_report_settings
  FOR SELECT TO authenticated USING (true);

-- لا تعديل مباشر — عبر دالة فقط
DROP POLICY IF EXISTS school_report_settings_write ON public.school_report_settings;

CREATE OR REPLACE FUNCTION public.get_report_settings()
RETURNS public.school_report_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  row school_report_settings%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO row FROM school_report_settings WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO school_report_settings (id) VALUES (1)
    RETURNING * INTO row;
  END IF;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_report_settings(
  p_governorate text,
  p_directorate text,
  p_administration text,
  p_school_name text,
  p_academic_year text,
  p_logo_right text,
  p_logo_left_arabic text,
  p_logo_left_languages text,
  p_sign_counselor_title text,
  p_sign_stage_manager_title text,
  p_sign_principal_title text,
  p_intro_text text,
  p_notice_text text,
  p_closing_text text
)
RETURNS public.school_report_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor profiles%rowtype;
  row school_report_settings%rowtype;
BEGIN
  SELECT * INTO actor FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF actor.role_type NOT IN ('superadmin', 'stage_manager') THEN
    RAISE EXCEPTION 'تعديل إعدادات التقارير للمسؤول العام أو مدير المرحلة فقط';
  END IF;

  INSERT INTO school_report_settings AS s (
    id, governorate, directorate, administration, school_name, academic_year,
    logo_right, logo_left_arabic, logo_left_languages,
    sign_counselor_title, sign_stage_manager_title, sign_principal_title,
    intro_text, notice_text, closing_text, updated_at, updated_by
  ) VALUES (
    1,
    coalesce(btrim(p_governorate), ''),
    coalesce(btrim(p_directorate), ''),
    coalesce(btrim(p_administration), ''),
    coalesce(btrim(p_school_name), ''),
    coalesce(btrim(p_academic_year), ''),
    NULLIF(p_logo_right, ''),
    NULLIF(p_logo_left_arabic, ''),
    NULLIF(p_logo_left_languages, ''),
    coalesce(NULLIF(btrim(p_sign_counselor_title), ''), 'الأخصائي الاجتماعي'),
    coalesce(NULLIF(btrim(p_sign_stage_manager_title), ''), 'مدير المرحلة'),
    coalesce(NULLIF(btrim(p_sign_principal_title), ''), 'مدير المدرسة'),
    coalesce(NULLIF(btrim(p_intro_text), ''), (SELECT intro_text FROM school_report_settings WHERE id = 1)),
    coalesce(NULLIF(btrim(p_notice_text), ''), (SELECT notice_text FROM school_report_settings WHERE id = 1)),
    coalesce(NULLIF(btrim(p_closing_text), ''), (SELECT closing_text FROM school_report_settings WHERE id = 1)),
    now(),
    actor.id
  )
  ON CONFLICT (id) DO UPDATE SET
    governorate = EXCLUDED.governorate,
    directorate = EXCLUDED.directorate,
    administration = EXCLUDED.administration,
    school_name = EXCLUDED.school_name,
    academic_year = EXCLUDED.academic_year,
    logo_right = EXCLUDED.logo_right,
    logo_left_arabic = EXCLUDED.logo_left_arabic,
    logo_left_languages = EXCLUDED.logo_left_languages,
    sign_counselor_title = EXCLUDED.sign_counselor_title,
    sign_stage_manager_title = EXCLUDED.sign_stage_manager_title,
    sign_principal_title = EXCLUDED.sign_principal_title,
    intro_text = EXCLUDED.intro_text,
    notice_text = EXCLUDED.notice_text,
    closing_text = EXCLUDED.closing_text,
    updated_at = now(),
    updated_by = actor.id
  RETURNING * INTO row;

  BEGIN
    INSERT INTO audit_events (actor_name, actor_role, action, details, level)
    VALUES (actor.full_name, actor.role_type, 'upsert_report_settings', 'school report branding', 'info');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_report_settings(text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
