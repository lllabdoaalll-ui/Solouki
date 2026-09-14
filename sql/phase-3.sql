-- Solouki Phase 3: students import, parent contacts, WhatsApp stage settings, import audit.
-- Safe migration: does not delete existing data. Review existing schema before applying in production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_id text NOT NULL UNIQUE,
  student_code text NOT NULL,
  full_name text NOT NULL,
  gender text NOT NULL,
  academic_year text DEFAULT NULL,
  grade text NOT NULL,
  section text NOT NULL,
  class_name text NOT NULL,
  stage_id uuid NULL,
  stage_name text NULL,
  father_phone text NULL,
  mother_phone text NULL,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS stage_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.student_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  sheet_name text,
  total_rows integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  withdrawn_count integer NOT NULL DEFAULT 0,
  same_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'previewed',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.student_import_batches(id) ON DELETE CASCADE,
  row_number integer,
  national_id text,
  action text,
  old_data jsonb,
  new_data jsonb,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stage_whatsapp_settings (
  stage_id uuid PRIMARY KEY,
  business_number text,
  phone_number_id text,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  stage_id uuid NULL,
  stage_name text NULL,
  parent_type text CHECK (parent_type IN ('father','mother','both')),
  recipient_phone text NOT NULL,
  message text NOT NULL,
  violation_count integer NOT NULL DEFAULT 0,
  provider text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued',
  error_text text,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  viewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS students_active_idx ON public.students(is_active);
CREATE INDEX IF NOT EXISTS students_stage_idx ON public.students(stage_id);
CREATE INDEX IF NOT EXISTS students_code_idx ON public.students(student_code);
CREATE INDEX IF NOT EXISTS whatsapp_notifications_student_idx ON public.whatsapp_notifications(student_id,created_at DESC);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Helper: current profile role.
CREATE OR REPLACE FUNCTION public.solouki_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role_type FROM profiles WHERE id=auth.uid() AND is_active=true LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.solouki_my_role() TO authenticated;

-- Initial safe policies. Tighten stage-scoped policies further if your existing stage assignment tables use different names.
DROP POLICY IF EXISTS students_admin_read ON public.students;
CREATE POLICY students_admin_read ON public.students FOR SELECT TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer','counselor'));
DROP POLICY IF EXISTS students_admin_write ON public.students;
CREATE POLICY students_admin_write ON public.students FOR ALL TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer')) WITH CHECK (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer'));

DROP POLICY IF EXISTS import_batch_admin ON public.student_import_batches;
CREATE POLICY import_batch_admin ON public.student_import_batches FOR ALL TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer')) WITH CHECK (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer'));
DROP POLICY IF EXISTS import_rows_admin ON public.student_import_rows;
CREATE POLICY import_rows_admin ON public.student_import_rows FOR ALL TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer')) WITH CHECK (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer'));

DROP POLICY IF EXISTS wa_settings_read ON public.stage_whatsapp_settings;
CREATE POLICY wa_settings_read ON public.stage_whatsapp_settings FOR SELECT TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer','counselor'));
DROP POLICY IF EXISTS wa_settings_write ON public.stage_whatsapp_settings;
CREATE POLICY wa_settings_write ON public.stage_whatsapp_settings FOR INSERT TO authenticated WITH CHECK (public.solouki_my_role() IN ('superadmin','it_officer'));
DROP POLICY IF EXISTS wa_settings_update ON public.stage_whatsapp_settings;
CREATE POLICY wa_settings_update ON public.stage_whatsapp_settings FOR UPDATE TO authenticated USING (public.solouki_my_role() IN ('superadmin','it_officer')) WITH CHECK (public.solouki_my_role() IN ('superadmin','it_officer'));

DROP POLICY IF EXISTS wa_notifications_read ON public.whatsapp_notifications;
CREATE POLICY wa_notifications_read ON public.whatsapp_notifications FOR SELECT TO authenticated USING (public.solouki_my_role() IN ('superadmin','stage_manager','it_officer','counselor'));
DROP POLICY IF EXISTS wa_notifications_insert ON public.whatsapp_notifications;
CREATE POLICY wa_notifications_insert ON public.whatsapp_notifications FOR INSERT TO authenticated WITH CHECK (public.solouki_my_role() IN ('superadmin','stage_manager','counselor'));

-- Stage IT officer may update the visible business number; provider token is never stored here.
COMMENT ON COLUMN public.stage_whatsapp_settings.business_number IS 'Visible WhatsApp Business number for the stage. Not an API credential.';
COMMENT ON COLUMN public.stage_whatsapp_settings.phone_number_id IS 'Meta/official provider phone number ID. Token must remain in Edge Function secrets.';
