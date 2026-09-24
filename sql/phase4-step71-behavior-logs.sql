-- ============================================================
-- STEP 71 — صلاحية «سجلات الرصد» (يومي / أسبوعي / شهري / من–إلى)
-- قسم مستقل عن ملف السلوك والتحليلات.
-- نفّذ في Supabase SQL Editor مرة واحدة.
-- ============================================================

INSERT INTO public.permission_catalog (key, label_ar, category, sort_order) VALUES
  ('view_behavior_logs', 'عرض وطباعة سجلات الرصد (يومي/أسبوعي/شهري)', 'reports', 85)
ON CONFLICT (key) DO UPDATE
  SET label_ar = EXCLUDED.label_ar,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- أخصائي اجتماعي / نفسي: كامل
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('counselor', 'view_behavior_logs', 'active')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

-- مدير مرحلة: كامل
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('stage_manager', 'view_behavior_logs', 'active')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

-- مسؤول حاسب: مشاهدة فقط (اختياري للتشخيص)
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('it_officer', 'view_behavior_logs', 'observer')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

-- ملاحظة: superadmin يتجاوز الصلاحيات عبر منطق الواجهة عادةً.

NOTIFY pgrst, 'reload schema';

SELECT role_type, permission_key, mode
FROM public.role_permissions
WHERE permission_key = 'view_behavior_logs'
ORDER BY role_type;
