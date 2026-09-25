-- ============================================================
-- STEP 72 — جسر تسجيل المعلم (رصد → سلوكي)
-- حسابات منفصلة: رصد يستدعي Edge Function على مشروع Supabase الخاص بسلوكي فقط.
-- لا تُشارك Service Role Key مع مشروع رصد.
-- ============================================================

-- أعمدة تتبّع مصدر التسجيل من الجسر (اختيارية وآمنة)
ALTER TABLE public.violation_records
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'staff';
ALTER TABLE public.violation_records
  ADD COLUMN IF NOT EXISTS external_teacher_id text;
ALTER TABLE public.violation_records
  ADD COLUMN IF NOT EXISTS external_teacher_name text;

ALTER TABLE public.merit_records
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'staff';
ALTER TABLE public.merit_records
  ADD COLUMN IF NOT EXISTS external_teacher_id text;
ALTER TABLE public.merit_records
  ADD COLUMN IF NOT EXISTS external_teacher_name text;

COMMENT ON COLUMN public.violation_records.source IS 'staff | teacher_bridge';
COMMENT ON COLUMN public.merit_records.source IS 'staff | teacher_bridge';

-- السماح لـ service_role باستدعاء دوال التحقق
GRANT EXECUTE ON FUNCTION public.teacher_is_assigned_to_class(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.teacher_recording_enabled(uuid, text, text, text) TO service_role;

-- recorded_by / awarded_by قد يكونان NOT NULL في بعض التثبيتات.
-- الجسر يكتب عبر service_role؛ إن كان العمود إلزامياً استخدم profile نظامي (اختياري).
-- لا نغيّر قيود NOT NULL هنا حتى لا نكسر التسجيل الداخلي.

NOTIFY pgrst, 'reload schema';
