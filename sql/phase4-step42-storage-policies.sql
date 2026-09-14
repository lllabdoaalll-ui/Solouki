-- ============================================================
-- صلاحيات رفع ملفات Excel على bucket: student-files
-- نفّذ في SQL Editor بعد إنشاء الـ Bucket من Storage
-- ============================================================

-- تأكد من وجود الـ bucket (إن لم يكن موجودًا أنشئه من الواجهة: Storage → New bucket → student-files → Private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-files', 'student-files', false)
ON CONFLICT (id) DO NOTHING;

-- إزالة سياسات قديمة متعارضة (اختياري وآمن إن لم توجد)
DROP POLICY IF EXISTS "student_files_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "student_files_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "student_files_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "student_files_authenticated_delete" ON storage.objects;

CREATE POLICY "student_files_authenticated_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'student-files');

CREATE POLICY "student_files_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-files');

CREATE POLICY "student_files_authenticated_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'student-files')
WITH CHECK (bucket_id = 'student-files');

CREATE POLICY "student_files_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-files');

NOTIFY pgrst, 'reload schema';
