-- ============================================================
-- STEP 70 — Security hardening for violation/merit reads
--            + teacher recording switches
-- ============================================================
-- Run in Supabase SQL Editor after STEP 69.
-- Idempotent and defensive: verifies table/column existence
-- before creating policies that depend on them.
-- ============================================================

-- ============================================================
-- 0) Pre-flight: ensure required helper tables/columns exist
-- ============================================================
DO $$
BEGIN
  -- Required: profiles.school_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='school_id'
  ) THEN
    RAISE EXCEPTION 'profiles.school_id is required for STEP 70';
  END IF;

  -- Required: violation_records.stage_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='violation_records' AND column_name='stage_id'
  ) THEN
    RAISE EXCEPTION 'violation_records.stage_id is required for STEP 70';
  END IF;

  -- Required: violation_records.school_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='violation_records' AND column_name='school_id'
  ) THEN
    RAISE EXCEPTION 'violation_records.school_id is required for STEP 70';
  END IF;

  RAISE NOTICE 'STEP 70 preflight OK';
END $$;

-- ============================================================
-- 1) Tighten SELECT on violation_records
-- ============================================================
-- Roles:
--   superadmin / it_officer → all rows in their school
--   stage_manager           → stages assigned via stage_assignments
--   counselor               → classes assigned via counselor_class_assignments
-- ============================================================
DROP POLICY IF EXISTS violations_read_auth            ON public.violation_records;
DROP POLICY IF EXISTS "violations_read_auth"          ON public.violation_records;
DROP POLICY IF EXISTS violation_records_select        ON public.violation_records;
DROP POLICY IF EXISTS violation_records_select_scoped ON public.violation_records;

CREATE POLICY violation_records_select_scoped
ON public.violation_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.school_id = violation_records.school_id
      AND (
        p.role_type IN ('superadmin', 'it_officer')
        OR (
          p.role_type = 'stage_manager'
          AND EXISTS (
            SELECT 1
            FROM public.stage_assignments sa
            WHERE sa.profile_id = p.id
              AND sa.stage_id = violation_records.stage_id
          )
        )
        OR (
          p.role_type = 'counselor'
          AND EXISTS (
            SELECT 1
            FROM public.counselor_class_assignments cca
            JOIN public.students s ON s.id = violation_records.student_id
            WHERE cca.counselor_id = p.id
              AND cca.stage_id = s.stage_id
              AND lower(trim(cca.grade))      = lower(trim(s.grade))
              AND lower(trim(cca.class_name)) = lower(trim(s.class_name))
          )
        )
      )
  )
);

-- ============================================================
-- 2) Same scoping for merit_records (only if table + columns exist)
-- ============================================================
DO $$
DECLARE
  has_merits       boolean;
  has_school_id    boolean;
  has_stage_id     boolean;
  has_student_id   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='merit_records'
  ) INTO has_merits;

  IF NOT has_merits THEN
    RAISE NOTICE 'merit_records not present — skipping section 2';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='merit_records' AND column_name='school_id'
  ) INTO has_school_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='merit_records' AND column_name='stage_id'
  ) INTO has_stage_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='merit_records' AND column_name='student_id'
  ) INTO has_student_id;

  IF NOT (has_school_id AND has_stage_id AND has_student_id) THEN
    RAISE NOTICE 'merit_records missing required columns (school_id/stage_id/student_id) — skipping';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS merits_read_auth            ON public.merit_records';
  EXECUTE 'DROP POLICY IF EXISTS "merits_read_auth"          ON public.merit_records';
  EXECUTE 'DROP POLICY IF EXISTS merit_records_select        ON public.merit_records';
  EXECUTE 'DROP POLICY IF EXISTS merit_records_select_scoped ON public.merit_records';

  EXECUTE $pol$
    CREATE POLICY merit_records_select_scoped
    ON public.merit_records
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active = true
          AND p.school_id = merit_records.school_id
          AND (
            p.role_type IN ('superadmin', 'it_officer')
            OR (
              p.role_type = 'stage_manager'
              AND EXISTS (
                SELECT 1
                FROM public.stage_assignments sa
                WHERE sa.profile_id = p.id
                  AND sa.stage_id = merit_records.stage_id
              )
            )
            OR (
              p.role_type = 'counselor'
              AND EXISTS (
                SELECT 1
                FROM public.counselor_class_assignments cca
                JOIN public.students s ON s.id = merit_records.student_id
                WHERE cca.counselor_id = p.id
                  AND cca.stage_id = s.stage_id
                  AND lower(trim(cca.grade))      = lower(trim(s.grade))
                  AND lower(trim(cca.class_name)) = lower(trim(s.class_name))
              )
            )
          )
      )
    )
  $pol$;

  RAISE NOTICE 'merit_records_select_scoped created';
END $$;

-- ============================================================
-- 3) Teacher behavior switches (per stage + section)
-- ============================================================
DO $$
DECLARE
  has_schools       boolean;
  school_col_clause text := 'school_id uuid NOT NULL';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='schools'
  ) INTO has_schools;

  IF has_schools THEN
    school_col_clause := 'school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE';
  ELSE
    RAISE NOTICE 'schools table not found — teacher_behavior_switches.school_id will have no FK';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='teacher_behavior_switches'
  ) THEN
    EXECUTE format($fmt$
      CREATE TABLE public.teacher_behavior_switches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        %s,
        stage_id text NOT NULL,
        section text NOT NULL DEFAULT 'arabic'
          CHECK (section IN ('arabic', 'languages')),
        recording_enabled boolean NOT NULL DEFAULT false,
        merits_enabled    boolean NOT NULL DEFAULT false,
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (school_id, stage_id, section)
      )
    $fmt$, school_col_clause);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teacher_behavior_switches_school
  ON public.teacher_behavior_switches(school_id, stage_id);

ALTER TABLE public.teacher_behavior_switches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tbs_admin_select ON public.teacher_behavior_switches;
CREATE POLICY tbs_admin_select
ON public.teacher_behavior_switches
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.school_id = teacher_behavior_switches.school_id
      AND p.role_type IN ('superadmin', 'it_officer', 'stage_manager')
  )
);

DROP POLICY IF EXISTS tbs_admin_write ON public.teacher_behavior_switches;
CREATE POLICY tbs_admin_write
ON public.teacher_behavior_switches
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.school_id = teacher_behavior_switches.school_id
      AND p.role_type IN ('superadmin', 'it_officer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.school_id = teacher_behavior_switches.school_id
      AND p.role_type IN ('superadmin', 'it_officer')
  )
);

-- ============================================================
-- 4) Server-side helper for the future recording bridge
-- ============================================================
CREATE OR REPLACE FUNCTION public.teacher_recording_enabled(
  p_school_id uuid,
  p_stage_id  text,
  p_section  text DEFAULT 'arabic',
  p_kind     text DEFAULT 'violation'   -- 'violation' | 'merit'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN lower(coalesce(p_kind, 'violation')) = 'merit'
          THEN s.merits_enabled
        ELSE s.recording_enabled
      END
      FROM public.teacher_behavior_switches s
      WHERE s.school_id = p_school_id
        AND s.stage_id  = p_stage_id
        AND s.section   = COALESCE(NULLIF(trim(p_section), ''), 'arabic')
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_recording_enabled(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_recording_enabled(uuid, text, text, text) TO service_role;

-- ============================================================
-- 5) Seed switch rows for every active stage (using its own section)
-- ============================================================
-- كل مرحلة في stages مرتبطة بقسم واحد (arabic أو languages).
-- لا نستخدم CROSS JOIN على القسمين — ذلك يُنشئ صفوفاً غير منطقية
-- (مثل stage_kg_ar + languages) ويسبب تكراراً في واجهة التفعيل.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='stages'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stages' AND column_name='school_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stages' AND column_name='is_active'
  ) THEN
    INSERT INTO public.teacher_behavior_switches
      (school_id, stage_id, section, recording_enabled, merits_enabled)
    SELECT
      st.school_id,
      st.id::text,
      CASE
        WHEN lower(coalesce(st.section, '')) IN ('languages', 'lang', 'لغة', 'لغات') THEN 'languages'
        ELSE 'arabic'
      END,
      false,
      false
    FROM public.stages st
    WHERE st.is_active = true
    ON CONFLICT (school_id, stage_id, section) DO NOTHING;

    RAISE NOTICE 'Seeded teacher_behavior_switches for active stages (one row per stage)';
  ELSE
    RAISE NOTICE 'Skipped seeding — stages table/columns not available';
  END IF;
END $$;

-- ============================================================
-- 6) Refresh PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END OF STEP 70
-- ============================================================
