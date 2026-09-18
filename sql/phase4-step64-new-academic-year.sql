-- ============================================================
-- Solouki STEP 64 — بداية عام دراسي جديد (أرشفة دون مسح)
-- ============================================================
-- لا يحذف المخالفات ولا التكريمات ولا الحسابات.
-- يحدّث العام الدراسي، ويؤرشف الطلاب النشطين اختيارياً،
-- ويسجّل العملية في سجل انتقالات الأعوام.

CREATE TABLE IF NOT EXISTS public.academic_year_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_year         TEXT,
  to_year           TEXT NOT NULL,
  archived_students INT DEFAULT 0,
  active_students_before INT DEFAULT 0,
  violations_kept   INT DEFAULT 0,
  merits_kept       INT DEFAULT 0,
  archive_students  BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  performed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_year_transitions_at
  ON public.academic_year_transitions (performed_at DESC);

ALTER TABLE public.academic_year_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "year_transitions_superadmin_read" ON public.academic_year_transitions;
CREATE POLICY "year_transitions_superadmin_read" ON public.academic_year_transitions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role_type = 'superadmin'
        AND COALESCE(p.is_active, true)
    )
  );

-- لا كتابة مباشرة من العميل — عبر RPC فقط
DROP POLICY IF EXISTS "year_transitions_no_direct_write" ON public.academic_year_transitions;
CREATE POLICY "year_transitions_no_direct_write" ON public.academic_year_transitions
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ضمان وجود is_active / status / academic_year على الطلاب إن لزم
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='students') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='students' AND column_name='status'
    ) THEN
      ALTER TABLE public.students ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='students' AND column_name='academic_year'
    ) THEN
      ALTER TABLE public.students ADD COLUMN academic_year TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='students' AND column_name='archived_at'
    ) THEN
      ALTER TABLE public.students ADD COLUMN archived_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='students' AND column_name='archive_reason'
    ) THEN
      ALTER TABLE public.students ADD COLUMN archive_reason TEXT;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.start_new_academic_year(
  p_new_year TEXT,
  p_archive_students BOOLEAN DEFAULT TRUE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_from TEXT;
  v_archived INT := 0;
  v_active_before INT := 0;
  v_viol INT := 0;
  v_merits INT := 0;
  v_has_report_settings BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT public.is_active_superadmin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_new_year IS NULL OR length(trim(p_new_year)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_year');
  END IF;

  p_new_year := trim(p_new_year);

  -- العام السابق من إعدادات التقارير إن وُجدت
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='report_settings'
  ) INTO v_has_report_settings;

  IF v_has_report_settings THEN
    BEGIN
      EXECUTE 'SELECT academic_year FROM public.report_settings LIMIT 1' INTO v_from;
    EXCEPTION WHEN OTHERS THEN
      v_from := NULL;
    END;
  END IF;

  IF v_from IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='students' AND column_name='academic_year'
  ) THEN
    SELECT academic_year INTO v_from
    FROM public.students
    WHERE academic_year IS NOT NULL AND length(academic_year) > 0
    GROUP BY academic_year
    ORDER BY count(*) DESC
    LIMIT 1;
  END IF;

  -- إحصاءات قبل التغيير
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='students') THEN
    SELECT count(*) INTO v_active_before
    FROM public.students
    WHERE COALESCE(is_active, true) = true;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='violation_records') THEN
    SELECT count(*) INTO v_viol FROM public.violation_records;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merits') THEN
    SELECT count(*) INTO v_merits FROM public.merits;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merit_records') THEN
    SELECT count(*) INTO v_merits FROM public.merit_records;
  END IF;

  -- أرشفة الطلاب النشطين (لا حذف — المخالفات تبقى مرتبطة)
  IF p_archive_students AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='students'
  ) THEN
    UPDATE public.students
    SET
      is_active = false,
      status = 'archived_year_end',
      archived_at = NOW(),
      archive_reason = 'year_end:' || COALESCE(v_from, 'unknown') || '->' || p_new_year
    WHERE COALESCE(is_active, true) = true;

    GET DIAGNOSTICS v_archived = ROW_COUNT;
  END IF;

  -- تحديث العام في إعدادات التقارير إن وُجد الجدول
  IF v_has_report_settings THEN
    BEGIN
      -- محاولة upsert بسيطة: إن وُجد صف حدّثه، وإلا أدرج
      IF EXISTS (SELECT 1 FROM public.report_settings LIMIT 1) THEN
        UPDATE public.report_settings SET academic_year = p_new_year;
      ELSE
        INSERT INTO public.report_settings (academic_year) VALUES (p_new_year);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- إن فشل بسبب أعمدة إلزامية أخرى نتجاهل ونكمل
      NULL;
    END;
  END IF;

  -- سجل الانتقال
  INSERT INTO public.academic_year_transitions (
    from_year, to_year, archived_students, active_students_before,
    violations_kept, merits_kept, archive_students, notes, performed_by
  ) VALUES (
    v_from, p_new_year, v_archived, v_active_before,
    v_viol, v_merits, COALESCE(p_archive_students, true), p_notes, v_uid
  );

  -- محاولة تسجيل في audit_logs إن وُجد
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') THEN
    BEGIN
      INSERT INTO public.audit_logs (actor_user_id, actor_role, action_key, entity_type, details)
      VALUES (
        v_uid,
        'superadmin',
        'start_new_academic_year',
        'system',
        jsonb_build_object(
          'from_year', v_from,
          'to_year', p_new_year,
          'archived_students', v_archived,
          'violations_kept', v_viol,
          'merits_kept', v_merits
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_year', v_from,
    'to_year', p_new_year,
    'archived_students', v_archived,
    'active_students_before', v_active_before,
    'violations_kept', v_viol,
    'merits_kept', v_merits,
    'message', 'academic_year_started'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_new_academic_year(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_new_academic_year(TEXT, BOOLEAN, TEXT) TO authenticated;

-- معاينة قبل التنفيذ
CREATE OR REPLACE FUNCTION public.preview_new_academic_year()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_from TEXT;
  v_active INT := 0;
  v_viol INT := 0;
  v_merits INT := 0;
  v_suggested TEXT;
  y INT;
  m INT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_superadmin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  m := EXTRACT(MONTH FROM NOW())::INT;
  y := EXTRACT(YEAR FROM NOW())::INT;
  -- العام الدراسي المصري الحالي تقريباً، ثم نقترح العام التالي
  IF m >= 8 THEN
    -- نحن في بداية/منتصف عام y/(y+1) → نقترح (y+1)/(y+2)
    v_suggested := (y + 1)::text || '/' || (y + 2)::text;
  ELSE
    -- نحن في بقية عام (y-1)/y → نقترح y/(y+1)
    v_suggested := y::text || '/' || (y + 1)::text;
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='report_settings') THEN
      EXECUTE 'SELECT academic_year FROM public.report_settings LIMIT 1' INTO v_from;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_from := NULL;
  END;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='students') THEN
    SELECT count(*) INTO v_active FROM public.students WHERE COALESCE(is_active, true) = true;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='violation_records') THEN
    SELECT count(*) INTO v_viol FROM public.violation_records;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merits') THEN
    SELECT count(*) INTO v_merits FROM public.merits;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merit_records') THEN
    SELECT count(*) INTO v_merits FROM public.merit_records;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'current_year', v_from,
    'suggested_next_year', v_suggested,
    'active_students', v_active,
    'violations_count', v_viol,
    'merits_count', v_merits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_new_academic_year() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_new_academic_year() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'STEP 64 SQL ready: start_new_academic_year + preview';
END $$;
