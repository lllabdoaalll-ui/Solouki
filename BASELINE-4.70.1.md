# Solouki Baseline 4.70.1

نقطة انطلاق رسمية فوق 4.70.0 وتشمل إصلاحات التشغيل التالية.

## 1) واتساب — الأخصائي + digest
- ملف SQL: `sql/phase4-step70.1-whatsapp-counselor-digest-fix.sql`
- تفعيل `pgcrypto` في مخطط `extensions`
- مطابقة مرنة لصف/فصل الأخصائي (`lower(trim(...))`) والقسم اختياري
- `queue_daily_whatsapp_notifications` يصفّي حسب نطاق الدور ويعرض آخر خطأ عند التخطي
- **يجب تنفيذ ملف SQL مرة واحدة في Supabase** إن لم يكن منفّذًا على البيئة

## 2) موبايل RTL — سجل التدقيق والجداول
- `css/app-shell.css`: بطاقات الجداول على الموبايل بمحاذاة يمين و`direction: rtl`
- `css/audit.css`: فلاتر عمودية على الموبايل + محاذاة عربية
- `js/audit.js`: `data-label` عربي + `card-row` لعرض البطاقات

## 3) ما يبقى من 4.70.0
- STEP 70: سياسات قراءة المخالفات حسب النطاق
- مفاتيح تسجيل المعلم + استيراد الفصول من Excel في دليل المعلمين

## بعد فك الضغط
1. ارفع محتويات `Solouki-main` إلى الاستضافة (Vercel/GitHub).
2. إن لزم: نفّذ `sql/phase4-step70.1-whatsapp-counselor-digest-fix.sql` في Supabase.
3. تحديث قوي للمتصفح على الموبايل.
