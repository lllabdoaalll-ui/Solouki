-- STEP 70 — Security hardening for violation/merit reads + teacher recording switches
-- Run this in Supabase SQL editor after STEP 69.
-- Safe to re-run (idempotent).

-- ============================================================
-- 1) Tighten SELECT on violation_records (was: USING (true))
-- ============================================================
-- Roles:
--   superadmin     → all rows in their school
--   it_officer     → all rows in their school (ops / support)
--   stage_manager  → stages assigned via stage_assignments
--   counselor      → classes assigned via counselor_class_assignments
-- Everyone else    → no rows
-- Teachers never use Auth; the future bridge uses service role.

DROP POLICY IF EXISTS violations_read_auth ON public.violation_records;
DROP POLICY IF EXISTS "violations_read_auth" ON public.violation_records;
DROP POLICY IF EXISTS violation_records_select ON public.violation_records;
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
              AND lower(trim(cca.grade)) = lower(trim(s.grade))
              AND lower(trim(cca.class_name)) = lower(trim(s.class_name))
          )
        )
      )
  )
);

-- ============================================================
-- 2) Same scoping for merit_records (if table exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merit_records'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS merits_read_auth ON public.merit_records';
    EXECUTE 'DROP POLICY IF EXISTS "merits_read_auth" ON public.merit_records';
    EXECUTE 'DROP POLICY IF EXISTS merit_records_select ON public.merit_records';
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
                    AND lower(trim(cca.grade)) = lower(trim(s.grade))
                    AND lower(trim(cca.class_name)) = lower(trim(s.class_name))
                )
              )
            )
        )
      )
    $pol$;
  END IF;
END $$;

-- ============================================================
-- 3) Teacher behavior switches (per stage + section)
-- ============================================================
-- Human intervention is limited to flipping these switches.
-- Default: recording OFF until an admin enables it for a stage/section.

CREATE TABLE IF NOT EXISTS public.teacher_behavior_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  stage_id text NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'arabic'
    CHECK (section IN ('arabic', 'languages')),
  recording_enabled boolean NOT NULL DEFAULT false,
  merits_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, stage_id, section)
);

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

-- Server-side helper used by the future recording bridge (service role / Edge Function).
CREATE OR REPLACE FUNCTION public.teacher_recording_enabled(
  p_school_id uuid,
  p_stage_id text,
  p_section text DEFAULT 'arabic',
  p_kind text DEFAULT 'violation'  -- 'violation' | 'merit'
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
        AND s.stage_id = p_stage_id
        AND s.section = COALESCE(NULLIF(trim(p_section), ''), 'arabic')
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_recording_enabled(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_recording_enabled(uuid, text, text, text) TO service_role;

-- Optional: ensure a switch row exists for every active stage × section (defaults OFF).
-- Admins can flip them from the UI; missing row = OFF (safe default).
INSERT INTO public.teacher_behavior_switches (school_id, stage_id, section, recording_enabled, merits_enabled)
SELECT st.school_id, st.id, sec.section, false, false
FROM public.stages st
CROSS JOIN (VALUES ('arabic'), ('languages')) AS sec(section)
WHERE st.is_active = true
ON CONFLICT (school_id, stage_id, section) DO NOTHING;

NOTIFY pgrst, 'reload schema';
