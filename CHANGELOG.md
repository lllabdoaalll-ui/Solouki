# CHANGELOG

## Phase 4 — STEP 53-A: توحيد قاعدة البيانات (بريد + كلمة مرور)
- اعتماد SQL النهائي للتحول من PIN إلى Email/Password
- أعمدة جديدة في `profiles`:
  - `must_change_password` (DEFAULT TRUE)
  - `password_changed_at`
  - `last_login_at`
- إعادة تسمية أعمدة PIN إلى `pin_hash_deprecated` / `pin_plain_deprecated` (حماية مؤقتة بدل الحذف)
- حذف جميع دوال PIN القديمة
- Trigger `on_auth_user_created` → `handle_new_auth_user()` لإنشاء profile تلقائياً
- دوال: `mark_password_changed()` + `record_last_login()`
- ملف: `sql/phase4-step53-auth-email-password.sql`
- **ملاحظة:** هذه الخطوة قاعدة بيانات فقط — الواجهة ستُستكمل في الخطوات التالية

## Phase 4 — STEP 50.3: دخول الطاقم بالاسم + PIN (مثل نظام رصد الدرجات)
- شاشة الدخول الافتراضية: اختيار الاسم + الرقم السري (بطاقة الدخول)
- دخول البريد/كلمة المرور يبقى متاحاً تحت «خيارات متقدمة» للمسؤول العام
- SQL: `list_staff_for_login` + `verify_pin_service`
- Edge Function: `pin-login` (تتحقق من PIN ثم تنشئ جلسة Auth فورية)
- لا حاجة لاستعادة كلمة مرور Auth لمديري المراحل والأخصائيين يومياً

## Phase 4 — STEP 50.2: حذف / انسحاب طالب
- SQL: `admin_withdraw_student` + `admin_restore_student` + صلاحية `delete_students`
- الأدوار: **المسؤول العام** و **مسؤول الحاسب** فقط (ضمن نطاق المرحلة لمسؤول الحاسب)
- حذف ناعم: `is_active=false` + `status=withdrawn` — المخالفات والتكريمات تُحفظ
- واجهة: زر «حذف» في قائمة الطلاب + في نافذة التعديل، وزر «استعادة» للمنسحبين
- ملف: `sql/phase4-step50.2-withdraw-student.sql`

## Phase 4 — STEP 50.1: إصلاح أعمدة merit_records
- السبب: جدول `merit_records` القديم من Schema قديم بدون عمود `category`
- الحل: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` لـ category / notes / school_id / updated_at
- ملف: `sql/phase4-step50.1-fix-merit-columns.sql`
- يصلح خطأ: `column mr.category does not exist` عند طباعة التقارير

## Phase 4 — STEP 50: التكريمات + نظام النقاط (التحفيز التربوي)
- SQL: جدول `merit_records` + `merit_categories` + `behaviour_point_settings`
- دوال: `record_merit` · `list_student_merits` · `get_student_points` · `list_merit_categories`
- توسيع `get_student_behavior_report` و `guardian_get_behavior_report` ليشملا التكريمات والرصيد
- صفحة `merits.html` + `js/merits.js` لتسجيل تكريم (بحث طالب · تصنيف · نقاط · تاريخ)
- ملف سلوك الطالب: شريط نقاط + جدول تكريمات
- بوابة ولي الأمر: رصيد السلوك + قائمة التكريمات
- صلاحية `record_merits` موجودة مسبقاً (أخصائي + مدير مرحلة + مسؤول عام)
- الإصدار: `4.50.0`


## Phase 4 — STEP 49: متابعات + تصعيد + تنبيه كتابي
- SQL: جدول `behavior_followups` + `suggest_student_escalation` + `issue_written_warning` + `list_student_followups`
- قواعد تصعيد عملية حسب التراكم والدرجات والتنبيهات السابقة
- في ملف السلوك: بطاقة اقتراح التصعيد + طباعة نموذج «تنبيه كتابي» رسمي + تسجيل صدوره
- الإصدار: `4.49.0`

## Phase 4 — STEP 48: بوابة ولي الأمر
- SQL: `guardian_lookup_student` + `guardian_get_behavior_report` (SECURITY DEFINER، متاح لـ anon)
- دخول ولي الأمر: رقم قومي 14 + كود/رقم جلوس عبر RPC آمن (بدل فتح جدول students)
- صفحة `guardian.html` + `js/guardian.js` + `css/guardian.css`
  - بطاقة الطالب، إحصائيات الدرجات، جدول المخالفات (قراءة فقط)
- تخزين جلسة خفيفة: `solouki_guardian_student` + `solouki_guardian_creds`
- الإصدار: `4.48.0`

## Phase 4 — STEP 47.1: متابعة التراكم + طباعة دفعة + تعدد صفحات
- SQL: `list_students_needing_attention` — عتبات: إجمالي≥3 أو درجة2≥2 أو درجة3/4
- قائمة «طلاب يستحقون طباعة التقرير» في ملف السلوك (عاجل / متابعة)
- طباعة دفعة حتى 15 تقريراً في أمر طباعة واحد (فاصل صفحات بين الطلاب)
- تحسين CSS للطباعة متعددة الصفحات: تكرار رأس الجدول، عدم قطع الصف، التوقيعات متماسكة
- الإصدار: `4.47.1`

## Phase 4 — STEP 47: هوية التقارير المطبوعة الرسمية
- CSS: `css/print-official.css` — ترويسة مدرسية، أوزان خطوط متدرجة، جدول رسمي، توقيعات، تذييل Solouki
- SQL: `sql/phase4-step47-report-branding.sql` — جدول `school_report_settings` + get/upsert
- صفحة `report-settings.html`: محافظة، مديرية، إدارة، مدرسة، عام دراسي، 3 شعارات (أيمن + عربي + لغات)، نصوص الإحاطة/التنويه/الختام، مناصب التوقيع
- طباعة `student-report`: قالب A4 رسمي يختار شعار القسم تلقائياً (عربي/لغات)
- الإصدار: `4.47.0`

## Phase 4 — STEP 46: ملف سلوك الطالب + إشعار ولي الأمر
- صفحة `student-report.html` + `js/student-report.js` + `css/student-report.css`
- SQL: `sql/phase4-step46-student-behavior-report.sql`
  - `get_student_behavior_report` — بيانات الطالب + إحصائيات الدرجات + السجل الكامل (ضمن الصلاحية)
- بحث طالب (نفس تطبيع الأسماء) → بطاقة ملخص + جدول زمني + طباعة
- تجهيز رسالة واتساب لولي الأمر (أب/أم) عبر wa.me + نسخ النص
- رابط من لوحة التحكم وصفحة المخالفات + رابط سريع بعد التسجيل الفردي
- الإصدار: `4.46.0`

## Phase 4 — STEP 45: تسجيل مخالفة جماعي
- واجهة: تبويبان في `violations.html` — فردي | جماعي
- سلة طلاب متعددة الفصول + تشيك بوكس + بحث داخل القائمة + تحديد الكل
- مكان الواقعة اختياري في التسجيل الجماعي
- تأكيد قبل الحفظ + حد أقصى 50 طالباً
- SQL: `sql/phase4-step45-bulk-violation.sql`
  - `list_bulk_class_options` — المراحل/الصفوف/الفصول ضمن نطاق الدور
  - `list_students_for_bulk` — طلاب فصل معيّن مع التحقق من الصلاحية
  - `record_violation_bulk` — إدراج دفعة + Audit
- الإصدار: `4.45.0`

## Phase 4 — STEP 44.1: تطبيع الأسماء العربية في بحث المخالفات
- SQL: `sql/phase4-step44.1-arabic-name-search.sql`
  - دالة `normalize_arabic_name` (نفس قواعد Financial_Filter.html):
    إزالة التشكيل، توحيد إأآا/ى/ة/ؤ/ئ، معالجة عبد وأبو، فصل مركّبات الدين/الاسلام/الله
  - تحديث `search_students_for_violation` لاستخدام التطبيع على الاسم + ترتيب أفضل للتطابقات
  - دعم البحث بـ student_code و seat_number معاً
- أداة مساعدة: `tools/Financial_Filter.html` (نسخة من أداة مطابقة النتائج المالية)
- الإصدار: `4.44.1`

## Phase 4 — STEP 44: تسجيل المخالفة
- صفحة `violations.html` + `js/violations.js` + `css/violations.css`
- SQL: `sql/phase4-step44-record-violation.sql`
  - `search_students_for_violation` — بحث ضمن نطاق الدور
  - `record_violation` — حفظ آمن مع التحقق من الدرجة/العقوبة/النطاق
  - `list_recent_violations` — آخر السجلات حسب الصلاحية
  - `admin_delete_violation_record` — حذف لـ superadmin / stage_manager
- ربط من لوحة التحكم
- الإصدار: `4.44.0`

## Phase 4 — STEP 43.3: تعديل / حذف الأماكن المخصصة + صلاحيات إدارة أوسع للكتالوج
- SQL: `sql/phase4-step43.3-location-edit-delete.sql`
  - `admin_update_location` / `admin_delete_location` (مخصص فقط)
- واجهة الأماكن: أزرار تعديل وحذف للمخصصة
- إصلاح دوال تعديل/حذف المخالفات (تدقيق غير مُفشل + رسائل أوضح)
- مبدأ موحد للمسؤول العام في الكتالوج: إضافة + تعديل + حذف للمخصص، وإيقاف/تفعيل للكل
- الإصدار: `4.43.3`

## Phase 4 — STEP 43.2: تعديل / نقل درجة / حذف مخالفة مخصصة
- SQL: `sql/phase4-step43.2-violation-edit-delete.sql`
  - `admin_update_violation` — تعديل الوصف ونقل الدرجة (1–3) مع إعادة توليد الكود
  - `admin_delete_violation` — حذف نهائي للمخصصة فقط
- واجهة: أزرار تعديل وحذف بجانب المخالفات المخصصة + نافذة تعديل موحّدة
- مخالفات اللائحة الرسمية تبقى بدون تعديل/حذف (إيقاف/تفعيل فقط)
- الإصدار: `4.43.2`

## Phase 4 — STEP 43.1: صقل واجهة الكتالوج (Responsive + Professional)
- تحسين `css/catalog.css` ليكون احترافيًا ومتجاوبًا بالكامل:
  - بطاقات إحصائيات قابلة للنقر مع تأثيرات hover
  - شبكة درجات/إحصائيات تتكيّف: 4 أعمدة (حاسوب) → 2 (تابلت) → 1 (موبايل)
  - تبويبات قابلة للتمرير الأفقي على الشاشات الصغيرة مع أهداف لمس ≥40px
  - جداول بـ sticky header وتمرير أفقي سلس على الموبايل
  - أزرار Primary/Outline متوافقة مع ثيم الكتالوج الأخضر
  - نوافذ منبثقة مريحة على الشاشات الصغيرة + دعم طباعة
- الإصدار: `4.43.1`

## Phase 4 — STEP 43: كتالوج المخالفات والعقوبات
- صفحة جديدة `catalog.html` (+ `js/catalog.js` + `css/catalog.css`) بخمسة تبويبات:
  الدرجات، المخالفات، العقوبات، مصفوفة الدرجة × العقوبة، الأماكن.
- الجداول الخمسة (`violation_degrees`, `violations_catalog`, `violation_locations`,
  `penalties`, `degree_penalty_matrix`) كانت موجودة أصلاً في Schema v1.0 لكن
  سياسات RLS عليها كانت لدور `anon` فقط؛ بعد تحوّل الدخول إلى Supabase Auth
  (STEP 40/41) كانت هذه الجداول غير مقروءة فعليًا للمستخدم المسجّل دخوله.
  `sql/phase4-step43-catalog.sql` يضيف سياسات SELECT لدور `authenticated`
  دون حذف سياسات anon القديمة.
- إدارة محدودة للمسؤول العام فقط (بقية الأدوار قراءة فقط):
  - إضافة مخالفة مخصصة ضمن الدرجة 1، 2 أو 3 (الدرجة الرابعة مستبعدة لأنها
    جرائم جنائية تُحال تلقائيًا وفق اللائحة) — كود المخالفة يُولَّد تلقائيًا
    (مثل `1.12` بعد `1.11`).
  - إيقاف/تفعيل مخالفة قائمة (بدون حذف، حفاظًا على أي سجلات مرتبطة لاحقًا).
  - إضافة مكان مخصص لوقوع المخالفة، وإيقاف/تفعيل مكان قائم.
  - كل عملية إدارة تمر عبر دالة `SECURITY DEFINER` مخصصة وتُسجَّل في `audit_events`.
- الدرجات الأربع، العقوبات الثلاث عشرة (المادة 13)، ومصفوفة الدرجة × العقوبة:
  عرض فقط — ثابتة بنص اللائحة ولا تُدار من الواجهة.
- رابط "كتالوج المخالفات" جديد في `dashboard.html`.
- يستخدم طبقة Core كاملة (`config` / `utils` / `supabase-client` / `session` /
  `permissions`) من البداية، حسب `docs/ROADMAP.md`.
- **لا كسر للوظائف السابقة** (الطلاب، الأدوار، الصلاحيات، الإشعارات كما هي).
- الإصدار: `4.43.0`

## Phase 4 — STEP 42.1: إصلاح تحميل الطلاب + وضوح القسم
- خطأ `column students.student_code does not exist`: إضافة ترحيل آمن `sql/phase4-step42-students-columns.sql` (ADD COLUMN IF NOT EXISTS + نسخ من seat_number/guardian_phone إن وُجدت).
- `students.js`: تحميل مرن (preferred columns ثم fallback إلى `*`) مع رسالة توجّه لتشغيل الترحيل.
- ربط أوضح للقسم عربي/لغات عند اختيار المرحلة السحابية (تعبئة تلقائية + تعطيل القائمة عند الارتباط بالمرحلة + تلميح مرئي).
- احتياطي لقراءة `data-section` من المرحلة عند حساب نطاق الاستيراد.

## Phase 4 — STEP 42: Foundation Hardening (تنظيم هندسي)
- توحيد مصدر الإعدادات في `js/config.js` (URL + anon + إصدار التطبيق).
- إزالة المفاتيح المضمّنة المكررة من `index.html` و`dashboard.html`.
- إضافة طبقة Core مشتركة:
  - `js/core/utils.js` — أدوات مشتركة (escape، هاتف، رقم قومي، تسميات الأدوار)
  - `js/core/supabase-client.js` — عميل Supabase موحّد
  - `js/core/session.js` — تحقق الجلسة + PIN + خروج
  - `js/core/permissions.js` — واجهة لـ `my_permission` مع تخزين مؤقت
- `dashboard.html` يعتمد على Core بدل سكربت مضمّن.
- `auth.js` يقرأ الإعدادات من `SOLOUKI_CONFIG` فقط.
- توثيق هندسي:
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
  - `docs/CODING_STANDARDS.md`
- **لا كسر للوظائف السابقة** (STEP 40/41 والطلاب والأدوار والإشعارات كما هي).
- الإصدار: `4.42.0`


## Phase 4 — STEP 41: نظام صلاحيات مرن + تعديل بيانات الطالب يدويًا
- إضافة `sql/phase4-step41-permissions.sql`:
  - جدولا `permission_catalog` (كتالوج قابل للتوسع) و`role_permissions` (الحالة لكل دور: `none` / `observer` / `active`). المسؤول العام دائمًا "فعّال" ضمنيًا ولا يظهر في الجدول.
  - أول صلاحية مُدارة: `edit_students` — تعديل بيانات الطالب يدويًا.
  - دالة `my_permission(key)` تُعيد صلاحية المستخدم الحالي (تُستخدم من الواجهة لإظهار/إخفاء الأزرار).
  - دالة `set_role_permission(role, key, mode)` (مسؤول عام فقط) — تستخدمها شاشة "الصلاحيات" الجديدة.
  - دالة `admin_update_student(...)` تفرض القاعدة: مسؤول عام دائمًا مسموح؛ غيره يحتاج "فعّال" في `edit_students`. القيم الافتراضية تحافظ على السلوك الحالي: **مدير المرحلة = فعّال** (كان يملك هذه القدرة أصلًا عبر RLS)، **مسؤول الحاسب = غير مفعّل** (صلاحية جديدة يفعّلها المسؤول العام يدويًا)، **الأخصائي = غير مفعّل**.
- `roles.html` / `roles.js`: تبويب جديد **"الصلاحيات"** — جدول: صف لكل صلاحية × عمود لكل دور، وقائمة منسدلة (غير مفعّل / مراقب / فعّال) لكل خلية، تُحفظ فور التغيير.
- `students.html` / `students.js`: ميزة "تعديل بيانات الطالب" كانت موجودة بالفعل في الواجهة لكنها كانت تعتمد على تحديث مباشر للجدول عبر RLS العامة فقط. الآن:
  - الحفظ يمر حصرًا عبر `admin_update_student` (قفل صريح على مستوى الإجراء، وليس RLS وحدها).
  - من لديه صلاحية "مراقب" فقط يرى زر "عرض" ونموذجًا للقراءة فقط (الحقول معطّلة، بلا زر حفظ)؛ من ليس لديه أي صلاحية لا يرى الزر إطلاقًا.
  - إصلاح: إزالة ربط غير مقصود كان يكتب قيمة "الصف" داخل حقل `stage_name` عند الحفظ اليدوي (الحقل الصحيح لتحديد المرحلة يبقى عبر استيراد Excel).

## Phase 4 — STEP 40: PIN Security Hardening
- توقف كامل عن تخزين الرقم السري (PIN) بصورته الصريحة في قاعدة البيانات؛ `pin_hash` (bcrypt) هو المرجع الوحيد للتحقق.
- إضافة `sql/phase4-step40-pin-security.sql`:
  - دالة `admin_set_profile_pin(profile_id, pin?)` (لمسؤول عام فقط) تُصدر/تُجدد PIN وتُعيده صريحًا مرة واحدة فقط في نتيجة الاستدعاء، دون حفظه.
  - تحديث `set_profile_pin` (المستخدمة من الاستيراد الجماعي) بحيث تتوقف أيضًا عن حفظ النص الصريح.
  - ترحيل تنظيفي يمسح القيم القديمة في `pin_plain` لكل من لديه `pin_hash` بالفعل (لا يمس تسجيل الدخول لأحد).
  - عمود `pin_last_reset_at` لتتبّع تاريخ آخر إصدار.
- `bulk-user-import`: توقف عن كتابة `pin_plain` في `profiles`؛ أصبح PIN اختياريًا عند تحديث مستخدم قائم (يُحتفظ بالرقم الحالي)، ومطلوبًا فقط عند إنشاء حساب جديد.
- `roles.js` / `roles.html`:
  - بطاقات الدخول لم تعد تعرض PIN بشكل دائم؛ يظهر فقط بعد إصداره أو تجديده (زر "تجديد الرقم السري" على كل بطاقة)، ويُطبع فورًا قبل مغادرة الصفحة.
  - إصلاح ثغرة سابقة: تعديل مستخدم من النموذج كان يغيّر `pin_plain` مباشرة دون تحديث `pin_hash` الفعلي (فلا يغيّر PIN الحقيقي للدخول)؛ الآن يمر تغيير PIN عبر `admin_set_profile_pin` دائمًا.
  - تصدير Excel للمستخدمين لم يعد يُخرج أي PIN حقيقي.
- لم يُحذف عمود `pin_plain` من الجدول بعد (تم تفريغه فقط)؛ الحذف النهائي مؤجَّل لخطوة لاحقة بعد فترة تشغيل مستقرة.

## Phase 2
- Added roles.html.
- Added roles.js.
- Added roles.css.
- Added phase-2.sql.
- Added printable access cards.
- Added activation/deactivation flow.
- Preserved the complete Phase-1 baseline.

## Phase 2.1 — Excel bulk users
- إضافة تحميل نموذج Excel.
- إضافة تصدير المستخدمين إلى Excel بدون كلمات مرور.
- إضافة رفع Excel ومعاينة الأخطاء والتكرارات.
- إضافة Edge Function للاستيراد الجماعي وإنشاء/تحديث Supabase Auth والحسابات والصلاحيات.
- إضافة `profiles.sections` لمسؤولي الحاسب.

## Phase 3 — Students & WhatsApp
- Added `students.html` and `js/students.js` for Excel student import, validation and diff preview.
- Added official 9-column student template download.
- Added withdrawn/changed/new classification and import audit tables.
- Added stage-level WhatsApp Business settings and provider-ready Edge Function.
- Added `sql/phase-3.sql`.

## Phase 3.1 — إصلاح التحقق من أرقام التليفون (12 سبتمبر 2026)
- إصلاح خطأ جسيم في دالة `phone()`: كانت تضيف `2` بدلًا من `20` عند تحويل الأرقام التي تبدأ بـ `0`.
- النتيجة السابقة: كل أرقام الموبايل المصرية (010/011/012/015) كانت تُرفض كـ "غير صحيحة".
- الآن التحويل الصحيح: `01113677693` → `201113677693`.
- تحسين دالة `validPhone()` مع تعليقات واضحة.
- الأرقام الفارغة ما زالت مسموحة (يُفرض وجود رقم أب أو أم على الأقل في `validate`).

## Phase 3.2 — زر المعالجة + دمج ذكي للخانات الفارغة (12 سبتمبر 2026)
- بعد اختيار/سحب ملف Excel يظهر زر **«معالجة الملف»** (لا تُعالج تلقائيًا فورًا).
- عند المعالجة:
  - **خانة Excel فارغة** → لا تُستبدل البيانات الموجودة في النظام.
  - **خانة Excel بها بيانات** → تُستبدل القيمة القديمة وتُسجَّل في التقرير.
- تقرير تفصيلي بعد المعالجة:
  - طلاب جدد
  - تغييرات حقل بحقل (من → إلى) للطلاب الموجودين
  - منسحبون (غير موجودين في الملف)
- التحقق من الحقول الإلزامية يُطبَّق بصرامة على الطلاب **الجدد** فقط.

## Phase 3.3 — إشعارات واتساب بالرقم الشخصي (wa.me)
- إضافة حقل **رقم واتساب الشخصي** في إدارة الأدوار (للأخصائي وغيره).
- يمكن تسجيله بواسطة: المسؤول العام / مسؤول الحاسب / الأخصائي نفسه.
- صفحة جديدة `notifications.html`:
  - إشعارات اليوم مجمّعة لكل طالب (عدة ملاحظات = رسالة واحدة).
  - زر **فتح واتساب** يفتح `wa.me` برقم ولي الأمر + النص جاهز.
  - يعمل من الموبايل أو الكمبيوتر (واتساب ويب / ديسكتوب).
  - تعليم «تم فتح واتساب» + إعادة للانتظار.
  - وضع تجريبي بمخالفات اليوم لاختبار المسار قبل اكتمال تسجيل المخالفات.
- SQL: `sql/phase-3-wa-personal.sql` (عمود `personal_whatsapp` + سجل يدوي).
- لا Meta Cloud API — تكلفة صفر — الإرسال من رقم الأخصائي الشخصي.

## Phase 3.4 — تعديل بيانات الطالب من داخل النظام
- تبويب جديد **«قائمة الطلاب»** في صفحة الطلاب.
- بحث بالاسم / الرقم القومي / الفصل + تصفية (نشط / منسحب / الكل).
- زر **تعديل** لكل طالب يفتح نموذجًا لتعديل:
  الرقم القومي، الكود، الاسم، النوع، الصف، القسم، الفصل، هاتف الأب/الأم، حالة النشاط.
- الحفظ يحدّث Demo محليًا أو Supabase (upsert/update).
- يفيد لمعالجة أخطاء الرفع من Excel دون إعادة الملف كاملًا.

## Phase 3.5 — مواءمة منطق الاستيراد مع نظام الرصد المرجعي
- تأكيد اعتماد صريح برسالة تفصيلية (جديد / تعديلات حقول / منسحبون) بنفس أسلوب `buildStudentRosterDiffConfirmMessage`.
- معالجة Scientific Notation للرقم القومي (مثل `2.73011E+13`) كما في أنظمة Excel المدرسية.
- الإبقاء على: upsert وليس replace، خانة فارغة = لا استبدال، تقرير حقل بحقل، تعديل يدوي من القائمة.

## Phase 3.6 — اختيار المرحلة والقسم والصف قبل الاستيراد
- حقول إلزامية: **المرحلة** / **القسم (عربي|لغات)** / **الصف** قبل معالجة Excel.
- المقارنة والانسحاب والإضافة تُحسب داخل هذا النطاق فقط (مثل نظام الرصد).
- الصفوف المستوردة تُوسم بالمرحلة والصف المختارين عند الاعتماد.

## Phase 3.7 — ربط المراحل والملفات بالسحابة (Supabase)
- تحميل قائمة **المراحل** من جدول `stages` عند توفر Supabase، مع احتياطي محلي.
- عند اختيار مرحلة سحابية يُضبط القسم تلقائياً ويُملأ الصف حسب `stage_type`.
- رفع ملف Excel الأصلي إلى Storage bucket **`student-files`** عند الاعتماد.
- حفظ `source_storage` / `storage_path` في الطلاب وسجل الاستيراد.
- SQL: `sql/phase-3-storage.sql`

## Phase 3.8 — واجهة عصرية + مسار استيراد بمراحل
- تصميم ثلاثي الأبعاد خفيف (ظلال، تدرجات، أزرار مرتفعة، بطاقات).
- مسار استيراد بـ 4 خطوات مرئية: نطاق → رفع → معالجة → اعتماد.
- بطاقة نطاق الاستيراد (مرحلة / قسم / صف) بنفس روح نظام الرصد.
- رأس صفحة متدرّج وبطاقات إحصائيات مرتفعة.

## Phase 3.9 — توضيح واتساب الشخصي
- استبدال تبويب WhatsApp Business بنص واضح: إرسال يدوي من الرقم الشخصي عبر wa.me.
- إزالة حقول Phone Number ID / Meta Cloud API من الواجهة.
- رابط مباشر لصفحة إشعارات اليوم.

## Fix — تعطّل التبويبات والقوائم
- سبب العطل: الإشارة إلى زر `testWa` المحذوف كانت توقف السكربت قبل ربط التبويبات وملء القوائم.
- حماية كل ربطات الأحداث من العناصر غير الموجودة.
- احتياطي إلزامي لملء قوائم المرحلة/الصف محليًا عند فشل السحابة.


## Step 51 — PIN Login Repair
- Updated `supabase/functions/pin-login/index.ts` to use `verify_pin_service` first, avoiding stale versions of `verify_pin`.
- Added explicit detection of non-bcrypt PIN hashes and a clear reset message.
- Added clearer frontend handling for PIN login HTTP errors in `js/auth.js`.
- Added `sql/phase4-step51-pin-login-repair.sql` to recreate the required verification/list functions and grants.
- No plaintext PINs or service-role secrets were added to client-side files.
