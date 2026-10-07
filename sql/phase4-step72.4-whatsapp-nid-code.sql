-- ============================================================
-- Solouki STEP 72.4: إرجاع الرقم القومي وكود الطالب في إشعارات واتساب
-- السبب: رسالة ولي الأمر كانت تظهر «—» لأن list_my_whatsapp_notifications
--        لم تكن تُرجع national_id و student_code
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_my_whatsapp_notifications(
  p_date date DEFAULT current_date,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  student_id uuid,
  student_name text,
  national_id text,
  student_code text,
  grade text,
  class_name text,
  parent_type text,
  recipient_phone text,
  message text,
  violation_count int,
  status text,
  provider_message_id text,
  provider_status text,
  provider_status_at timestamptz,
  provider_error_code text,
  error_text text,
  attempts int,
  created_at timestamptz,
  sent_at timestamptz,
  last_attempt_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.student_id,
    s.full_name,
    s.national_id,
    s.student_code,
    s.grade,
    s.class_name,
    n.parent_type,
    n.recipient_phone,
    n.message,
    n.violation_count,
    n.status,
    n.provider_message_id,
    n.provider_status,
    n.provider_status_at,
    n.provider_error_code,
    n.error_text,
    n.attempts,
    n.created_at,
    n.sent_at,
    n.last_attempt_at
  FROM public.whatsapp_notifications n
  LEFT JOIN public.students s ON s.id = n.student_id
  WHERE n.created_at::date = coalesce(p_date, current_date)
    AND (p_status IS NULL OR n.status = p_status)
    AND public.solouki_my_role() IN ('superadmin','stage_manager','it_officer','counselor')
  ORDER BY n.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_my_whatsapp_notifications(date, text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
