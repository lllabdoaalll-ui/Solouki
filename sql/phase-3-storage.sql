-- ============================================================
-- Solouki Phase 3.7 — تخزين ملفات Excel السحابي + ربط المراحل
-- نفّذ في Supabase SQL Editor بعد phase-3.sql
-- ثم أنشئ Bucket من Storage:
--   Name: student-files
--   Public: false
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_storage text;

ALTER TABLE public.student_import_batches
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS stage_id text,
  ADD COLUMN IF NOT EXISTS stage_name text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS grade text;

COMMENT ON COLUMN public.students.source_storage IS 'مسار ملف Excel الأصلي في Supabase Storage';
COMMENT ON COLUMN public.student_import_batches.storage_path IS 'مسار الملف المرفوع في bucket student-files';

-- سياسات تخزين مبسطة عبر SQL (إن دعم المشروع storage policies هنا)
-- يُفضّل ضبطها من واجهة Storage → Policies:
-- authenticated: INSERT/SELECT على bucket student-files
