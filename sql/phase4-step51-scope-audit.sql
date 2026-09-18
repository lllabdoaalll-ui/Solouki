-- Solouki 4.62.19 — Safe scope audit for behavioral analytics
-- Returns aggregate diagnostics only; never exposes students outside the user's scope.
DROP FUNCTION IF EXISTS public.get_behavior_scope_audit_v1(date,date,text);

CREATE OR REPLACE FUNCTION public.get_behavior_scope_audit_v1(
  p_from date,
  p_to date,
  p_stage_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_profile FROM profiles WHERE id=v_uid AND is_active=TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF v_profile.role_type NOT IN ('superadmin','stage_manager','it_officer','counselor') THEN
    RAISE EXCEPTION 'ANALYTICS_NOT_ALLOWED';
  END IF;

  WITH
  allowed_stages AS (
    SELECT s.id
    FROM stages s
    WHERE s.school_id=v_profile.school_id
      AND s.is_active=TRUE
      AND (p_stage_id IS NULL OR s.id=p_stage_id)
      AND (
        v_profile.role_type='superadmin'
        OR EXISTS (SELECT 1 FROM stage_assignments sa WHERE sa.profile_id=v_uid AND sa.stage_id=s.id)
        OR (v_profile.role_type='counselor' AND EXISTS (
          SELECT 1 FROM counselor_class_assignments cca
          WHERE cca.counselor_id=v_uid AND cca.stage_id=s.id
        ))
      )
  ),
  allowed_classes AS (
    SELECT DISTINCT cca.stage_id,cca.grade,cca.class_name
    FROM counselor_class_assignments cca
    WHERE cca.counselor_id=v_uid
  ),
  period AS (
    SELECT vr.*,s.grade,s.class_name
    FROM violation_records vr
    JOIN students s ON s.id=vr.student_id
    WHERE vr.school_id=v_profile.school_id
      AND vr.violation_date BETWEEN p_from AND p_to
      AND (p_stage_id IS NULL OR vr.stage_id=p_stage_id)
  ),
  classified AS (
    SELECT p.*,
      EXISTS (SELECT 1 FROM allowed_stages a WHERE a.id=p.stage_id) AS stage_allowed,
      EXISTS (
        SELECT 1 FROM allowed_classes c
        WHERE c.stage_id=p.stage_id AND c.grade=p.grade AND c.class_name=p.class_name
      ) AS class_allowed
    FROM period p
  )
  SELECT jsonb_build_object(
    'role_type',v_profile.role_type,
    'period_from',p_from,
    'period_to',p_to,
    'stage_filter',p_stage_id,
    'raw_period_violations',(SELECT count(*)::int FROM period),
    'stage_in_scope',(SELECT count(*)::int FROM classified WHERE stage_allowed),
    'final_in_scope',(SELECT count(*)::int FROM classified WHERE stage_allowed AND (v_profile.role_type<>'counselor' OR class_allowed)),
    'excluded_by_stage',(SELECT count(*)::int FROM classified WHERE NOT stage_allowed),
    'excluded_by_class',(SELECT count(*)::int FROM classified WHERE stage_allowed AND v_profile.role_type='counselor' AND NOT class_allowed),
    'allowed_stage_count',(SELECT count(*)::int FROM allowed_stages),
    'allowed_class_count',CASE WHEN v_profile.role_type='counselor' THEN (SELECT count(*)::int FROM allowed_classes) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_behavior_scope_audit_v1(date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_behavior_scope_audit_v1(date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
