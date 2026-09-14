# Solouki — Architecture

## الهدف
نظام إدارة السلوك والانضباط المدرسي وفق القرار الوزاري 150/2024، مع عزل بيانات صارم حسب المرحلة/الفصل وصلاحيات دقيقة.

## المبادئ
1. **Least Privilege** — كل إجراء عبر صلاحية أو دالة `SECURITY DEFINER`.
2. **مصدر واحد للإعدادات** — `js/config.js` فقط.
3. **فصل الطبقات** — UI / Modules / Core / Database.
4. **تراكمية التسليم** — كل STEP يبني على Baseline معتمد دون كسر السابق.
5. **العربية في الواجهة، الإنجليزية في الكود**.

## الطبقات

```
Presentation (HTML + CSS + page entry scripts)
        ↓
Application modules (students, roles, catalog, …)
        ↓
Core services (session, permissions, utils, supabase-client)
        ↓
Supabase client (anon) + Edge Functions (service role عند الحاجة)
        ↓
PostgreSQL (tables + RLS + RPC)
```

## Core الحالي (`js/core/`)

| ملف | المسؤولية |
|-----|-----------|
| `utils.js` | escape، أرقام قومية، هواتف، تسميات الأدوار |
| `supabase-client.js` | عميل Supabase موحّد (Singleton) |
| `session.js` | تحقق الجلسة + PIN + خروج |
| `permissions.js` | قراءة `my_permission` وتطبيقها على العناصر |

## المصادقة
1. Supabase Auth (بريد + كلمة مرور)
2. تحقق PIN (hash في `profiles`)
3. تخزين جلسة خفيفة في `sessionStorage` (ملف شخصي + علم PIN)

## الصلاحيات (من STEP 41)
- جدول `permission_catalog` + `role_permissions`
- أوضاع: `none` | `observer` | `active`
- `superadmin` دائمًا `active` ضمنيًا
- الواجهة تستدعي `SoloukiPerms.myPermission(key)` أو RPC مباشرة

## التخزين
- بيانات هيكلية: PostgreSQL
- ملفات Excel الأصلية: Storage bucket `student-files`
- لا تُخزَّن PIN بصيغة صريحة بعد STEP 40

## STEP 43 — كتالوج المخالفات والعقوبات
- `catalog.html` / `js/catalog.js` / `css/catalog.css`.
- يقرأ من جداول Schema v1.0 الموجودة أصلاً: `violation_degrees`،
  `violations_catalog`، `violation_locations`، `penalties`،
  `degree_penalty_matrix`. هذه الجداول كانت محمية بسياسات RLS لدور
  `anon` فقط؛ `sql/phase4-step43-catalog.sql` يضيف سياسات SELECT لدور
  `authenticated` (المطلوب فعليًا بعد التحول إلى Supabase Auth).
- الإدارة (إضافة/إيقاف) مقصورة على المخالفات المخصّصة والأماكن المخصّصة،
  عبر دوال `SECURITY DEFINER` (`admin_add_violation`,
  `admin_set_violation_active`, `admin_add_location`,
  `admin_set_location_active`) — المسؤول العام فقط، ومسجّلة في
  `audit_events`. الدرجات والعقوبات والمصفوفة ثابتة ولا تُدار.

## التوسع المستقبلي
- صفحات تحت `pages/` عند الحاجة
- تقسيم `students.js` / `roles.js` إلى وحدات أصغر تدريجيًا (Strangler)
- لا يُنقل Service Role إلى المتصفح أبدًا
