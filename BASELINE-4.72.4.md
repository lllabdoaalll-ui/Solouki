# BASELINE 4.72.4 — رقم قومي وكود في رسالة واتساب

## المشكلة
رسالة ولي الأمر كانت تظهر:
- الرقم القومي: —
- كود الطالب: —

لأن `list_my_whatsapp_notifications` لا تُرجع `national_id` و `student_code`.

## الإصلاح
1. SQL: `sql/phase4-step72.4-whatsapp-nid-code.sql` — تضيف الحقلين للدالة
2. JS: `js/notifications.js` — يملأ الرقم والكود من جدول students إن غابا (يعمل حتى قبل تشغيل SQL)

## مطلوب على الإنتاج
- نشر الواجهة (notifications.js v4.72.4)
- تشغيل SQL في Supabase SQL Editor (مستحسن)
