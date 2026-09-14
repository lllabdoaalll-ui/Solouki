# Solouki — Coding Standards

## تسمية
- ملفات JS/CSS: `kebab-case` أو اسم وحدة واضح (`students.js`)
- دوال ومتغيرات: `camelCase`
- ثوابت: `UPPER_SNAKE_CASE`
- جداول وأعمدة SQL: `snake_case`
- واجهة المستخدم: نصوص عربية

## JavaScript
- لا تعتمد على متغيرات عامة عشوائية؛ استخدم `window.Solouki*` للـ Core فقط.
- عالج `error` من كل استعلام Supabase.
- لا تضع HTML من مدخلات مستخدم دون `SoloukiUtils.esc`.
- فضّل دوال قصيرة وواضحة على ملفات ضخمة غير مقسّمة.
- علّق على النية غير الواضحة فقط.

## تحميل السكربتات (ترتيب ثابت)
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js"></script>
<script src="js/core/utils.js"></script>
<script src="js/core/supabase-client.js"></script>
<script src="js/core/session.js"></script>
<script src="js/core/permissions.js"></script>
<!-- ثم سكربت الصفحة -->
```

## SQL
- الدوال الحساسة: `SECURITY DEFINER` + `SET search_path = public`
- التحقق من الدور داخل الدالة
- ترحيلات مرقّمة؛ تجنّب `DROP TABLE` في الإنتاج
- لا تعتمد على الواجهة وحدها لفرض الصلاحيات

## الأمان
- مفتاح **anon** فقط في المتصفح
- **Service Role** في Edge Functions فقط
- لا تخزين PIN صريح بعد STEP 40
- Rate limiting على محاولات الدخول والبوابات العامة

## التسليم
- كل تغيير يمر عبر STEP مسمّى
- تحديث `CHANGELOG.md`
- ZIP تراكمي قابل للتشغيل دون دمج يدوي
