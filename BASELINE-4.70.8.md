# Solouki Baseline 4.70.8

## إصلاح Multiple GoTrueClient في دليل المعلمين
- `teachers.html`: تحميل `js/core/supabase-client.js` (Singleton) بدل `auth.js`.
- `js/teachers.js`: استخدام `SoloukiDB.getClient()` بدل إنشاء عميل جديد.
- يمنع تحذير: Multiple GoTrueClient instances detected in the same browser context.

## السابق
4.70.7 إصلاح تكرار المراحل في مفاتيح التفعيل، 4.70.6 دليل معلمين + STEP 70
