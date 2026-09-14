-- ============================================================
--  Solouki — رقم واتساب الشخصي للعاملين (للأخصائي أساسًا)
--  يُستخدم مع مسار الإشعار اليدوي wa.me — بدون Cloud API
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_whatsapp text;

COMMENT ON COLUMN public.profiles.personal_whatsapp IS
  'رقم واتساب الشخصي للعامل (أخصائي/مدير...). يُستخدم كمرجع عند فتح محادثات أولياء الأمور من جهازه عبر wa.me';

-- سجل مبسّط لعمليات فتح واتساب (اختياري للتتبع المحلي/السحابي)
CREATE TABLE IF NOT EXISTS public.whatsapp_manual_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_national_id text,
  student_name text,
  recipient_phone text NOT NULL,
  parent_type text,
  message text,
  counselor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  counselor_name text,
  counselor_whatsapp text,
  status text NOT NULL DEFAULT 'opened' CHECK (status IN ('opened','sent_claimed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_manual_log_created_idx
  ON public.whatsapp_manual_log (created_at DESC);

ALTER TABLE public.whatsapp_manual_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_manual_all ON public.whatsapp_manual_log;
CREATE POLICY wa_manual_all ON public.whatsapp_manual_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
