-- ============================================================
-- Solouki STEP 42.1 — أعمدة الطلاب الناقصة (ترحيل آمن)
-- نفّذ هذا الملف كاملاً مرة واحدة في: Supabase → SQL Editor → Run
-- ============================================================

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS stage_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS source_file text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS source_storage text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- نسخ من الأعمدة القديمة إن وُجدت
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='students' AND column_name='seat_number'
  ) THEN
    UPDATE public.students
    SET student_code = seat_number
    WHERE COALESCE(student_code, '') = '' AND COALESCE(seat_number, '') <> '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='students' AND column_name='guardian_phone'
  ) THEN
    UPDATE public.students
    SET father_phone = guardian_phone
    WHERE COALESCE(father_phone, '') = '' AND COALESCE(guardian_phone, '') <> '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS students_code_idx ON public.students (student_code);
CREATE INDEX IF NOT EXISTS students_national_idx ON public.students (national_id);

-- إعادة تحميل كاش PostgREST حتى يتعرّف التطبيق على الأعمدة فورًا
NOTIFY pgrst, 'reload schema';

-- تحقق: يجب أن تظهر father_phone و student_code في النتيجة
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students'
ORDER BY ordinal_position;

-- قيد فريد اختياري على الرقم القومي (إن لم يكن موجودًا) لدعم upsert لاحقًا
-- إن فشل بسبب تكرار بيانات قديمة، تجاهل هذا السطر — الحفظ صفًا صفًا يكفي.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%national_id%'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'students'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%national_id%'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX students_national_id_uidx ON public.students (national_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'تعذر إنشاء فهرس فريد على national_id بسبب تكرار بيانات موجودة — الحفظ اليدوي في الواجهة كافٍ.';
    WHEN OTHERS THEN
      RAISE NOTICE 'تخطي فهرس national_id: %', SQLERRM;
    END;
  END IF;
END $$;
