# Solouki (سلوكي) — STEP 43

نظام إدارة السلوك والانضباط المدرسي وفق القرار الوزاري 150/2024.

## الإصدار
**4.43.1** — تحسين واجهة كتالوج المخالفات والعقوبات

## ما يشمله هذا الإصدار
- كل ما سبق من Phase 0 → 3 + STEP 40 (PIN) + STEP 41 (صلاحيات) + STEP 42 (Core)
- صفحة كتالوج احترافية: الدرجات + المخالفات + العقوبات + المصفوفة + الأماكن
- تحسين تجربة الاستخدام: بطاقات ملخص، تبويبات واضحة، بحث فوري، تصميم RTL متجاوب، وحالات قراءة فقط/إدارة أكثر وضوحًا
- سياسات RLS جديدة لدور authenticated على جداول الكتالوج (`sql/phase4-step43-catalog.sql`)
- طبقة Core مشتركة تحت `js/core/`
- إعدادات موحّدة في `js/config.js`
- توثيق: `docs/ARCHITECTURE.md` · `docs/ROADMAP.md` · `docs/CODING_STANDARDS.md`

## التشغيل السريع
1. نفّذ سكربتات SQL بالترتيب عند الحاجة (آخرها `sql/phase4-step43-catalog.sql` إن لم تُنفَّذ).
2. تأكد أن `js/config.js` يحتوي URL ومفتاح anon الصحيحين.
3. افتح `index.html` عبر استضافة ثابتة أو خادم محلي (لا تعتمد على `file://` مع Auth).

## الصفحات
| الصفحة | الغرض |
|--------|--------|
| `index.html` | تسجيل الدخول + PIN |
| `dashboard.html` | لوحة ترحيب حسب الدور |
| `students.html` | استيراد Excel + قائمة/تعديل الطلاب |
| `catalog.html` | كتالوج المخالفات والعقوبات (STEP 43) |
| `roles.html` | الأدوار + بطاقات + الصلاحيات |
| `notifications.html` | إشعارات واتساب اليدوية |

## هيكل مهم
```
js/config.js
js/core/utils.js
js/core/supabase-client.js
js/core/session.js
js/core/permissions.js
js/catalog.js
docs/
sql/
supabase/functions/
```

## الخطوة التالية
**STEP 44 — تسجيل المخالفة (نطاق الفصول)** (انظر `docs/ROADMAP.md`)

## الأمان
- لا تضع Service Role Key في المتصفح.
- PIN يُخزَّن كـ hash فقط (STEP 40).
- الصلاحيات الحساسة تُفرض عبر RPC/SQL وليس الواجهة وحدها.
