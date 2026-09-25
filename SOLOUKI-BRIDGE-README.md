# جسر سلوكي داخل رصد — تعليمات التشغيل

## ما تغيّر في `index.html`
1. **تصدير دليل الحسابات** يضيف عمود `الفصول (لسلوكي)` بصيغة:
   `المرحلة|الصف|الفصل|القسم;...`
   وورقة ثانية جاهزة للاستيراد في سلوكي: `Teacher ID | اسم المعلم | الفصول`.
2. في تبويب **الغياب والمواظبة**: بطاقة «مواظبة وسلوك — رصد مخالفة» + نافذة اختيار طالب/بند.
3. الواجهة تستدعي **`/api/solouki-bridge`** فقط (السر لا يُوضع في المتصفح).

## ما يجب نشره على Vercel (مشروع رصد)
- انسخ `api/solouki-bridge.js` إلى جذر مشروع رصد تحت مجلد `api/`.
- في Vercel → Settings → Environment Variables:
  - `SOLOUKI_BRIDGE_SECRET` = نفس قيمة `TEACHER_BEHAVIOR_BRIDGE_SECRET` في سلوكي
  - `SOLOUKI_RECORD_URL` = `https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-record`
  - `SOLOUKI_CATALOG_URL` = `https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-catalog`

## ترتيب التشغيل
1. سلوكي: SQL 69→70→72 + نشر الدالتين + السر.
2. سلوكي: استيراد ورقة «للاستيراد في سلوكي» من تصدير رصد + تفعيل مفاتيح المرحلة/القسم.
3. رصد: نشر `api/solouki-bridge.js` + المتغيرات أعلاه.
4. رصد (رئيس الكنترول): تبويب المواظبة → إعدادات الجسر (اختياري: العناوين تظهر للحالة؛ الوكيل هو الأساس).
5. معلم: يختار فصلاً في المواظبة → «رصد مخالفة» → طالب + بند → تسجيل.

## أخطاء شائعة من سلوكي
| error | المعنى |
|-------|--------|
| invalid_bridge_secret | السر غير متطابق |
| teacher_not_found_or_inactive | Teacher ID غير موجود في دليل سلوكي |
| student_not_found | الرقم القومي غير موجود في طلاب سلوكي |
| recording_disabled_for_stage_section | مفتاح المرحلة/القسم موقوف |
| teacher_not_assigned_to_student_class | المعلم غير مسند لفصل هذا الطالب |
