-- ============================================================
-- دالة التحقق من PIN (آمنة)
-- نفّذ هذا في SQL Editor بعد المرحلة 1
-- ============================================================

CREATE OR REPLACE FUNCTION verify_pin(p_user_id UUID, p_pin TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT pin_hash INTO stored_hash
  FROM profiles
  WHERE id = p_user_id
    AND is_active = TRUE;

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (stored_hash = crypt(p_pin, stored_hash));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- منح الصلاحية للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION verify_pin(UUID, TEXT) TO authenticated;
