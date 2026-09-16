-- ============================================================
-- STEP 54.4: ضمان صلاحيات الأدوار الافتراضية (مدير مرحلة / حاسب / أخصائي)
-- نفّذ مرة في SQL Editor إن كانت التبويبات لا تظهر لغير المسؤول العام
-- ============================================================

INSERT INTO public.permission_catalog (key, label_ar, category, sort_order) VALUES
  ('edit_students',        'تعديل بيانات الطالب يدويًا',                    'students',   10),
  ('import_students',      'استيراد طلاب من Excel',                         'students',   20),
  ('view_students',        'عرض قائمة الطلاب وبياناتهم',                    'students',   30),
  ('delete_students',      'حذف / انسحاب طالب من القائمة النشطة',           'students',   35),
  ('record_violations',    'تسجيل ملاحظات / مخالفات سلوكية',                 'behaviour',  40),
  ('record_merits',        'تسجيل تحفيز / تكريمات إيجابية',                   'behaviour',  50),
  ('manage_followups',     'متابعة الحالات السلوكية',                       'behaviour',  60),
  ('send_whatsapp',        'إرسال إشعارات واتساب لأولياء الأمور',            'comms',      70),
  ('view_reports',         'عرض التقارير والإحصائيات',                      'reports',    80),
  ('print_cards',          'طباعة بطاقات الدخول / الأكواد',                  'admin',      90),
  ('manage_staff',         'إدارة مديري المراحل ومسؤولي الحاسب والأخصائيين','admin',     100),
  ('manage_permissions',   'ضبط صلاحيات الأدوار',                            'admin',     110),
  ('view_audit',           'عرض سجل التدقيق',                               'admin',     120)
ON CONFLICT (key) DO UPDATE
  SET label_ar = EXCLUDED.label_ar,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- مدير مرحلة
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('stage_manager','edit_students','active'),
  ('stage_manager','import_students','active'),
  ('stage_manager','view_students','active'),
  ('stage_manager','delete_students','none'),
  ('stage_manager','record_violations','active'),
  ('stage_manager','record_merits','active'),
  ('stage_manager','manage_followups','active'),
  ('stage_manager','send_whatsapp','active'),
  ('stage_manager','view_reports','active'),
  ('stage_manager','print_cards','observer'),
  ('stage_manager','manage_staff','none'),
  ('stage_manager','manage_permissions','none'),
  ('stage_manager','view_audit','observer')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

-- مسؤول حاسب
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('it_officer','edit_students','none'),
  ('it_officer','import_students','active'),
  ('it_officer','view_students','active'),
  ('it_officer','delete_students','active'),
  ('it_officer','record_violations','none'),
  ('it_officer','record_merits','none'),
  ('it_officer','manage_followups','none'),
  ('it_officer','send_whatsapp','none'),
  ('it_officer','view_reports','observer'),
  ('it_officer','print_cards','active'),
  ('it_officer','manage_staff','none'),
  ('it_officer','manage_permissions','none'),
  ('it_officer','view_audit','none')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

-- أخصائي
INSERT INTO public.role_permissions (role_type, permission_key, mode) VALUES
  ('counselor','edit_students','none'),
  ('counselor','import_students','none'),
  ('counselor','view_students','active'),
  ('counselor','delete_students','none'),
  ('counselor','record_violations','active'),
  ('counselor','record_merits','active'),
  ('counselor','manage_followups','active'),
  ('counselor','send_whatsapp','active'),
  ('counselor','view_reports','active'),
  ('counselor','print_cards','none'),
  ('counselor','manage_staff','none'),
  ('counselor','manage_permissions','none'),
  ('counselor','view_audit','none')
ON CONFLICT (role_type, permission_key) DO UPDATE SET mode = EXCLUDED.mode;

NOTIFY pgrst, 'reload schema';

SELECT role_type, permission_key, mode
FROM public.role_permissions
ORDER BY role_type, permission_key;
