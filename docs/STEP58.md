# STEP 58 — إعداد WhatsApp Business لكل مرحلة

الإصدار: **4.58.0**

## الهدف
توفير شاشة تشغيلية لمسؤول الحاسب لضبط رقم WhatsApp Business وPhone Number ID لكل مرحلة، مع تقييد مسؤول الحاسب بالمراحل المسندة إليه.

## ما تم
- صفحة `whatsapp-settings.html`.
- مسؤول الحاسب يرى المراحل النشطة المسندة إليه فقط.
- المسؤول العام يرى كل المراحل النشطة.
- حفظ الإعدادات عبر RPC آمن `save_stage_whatsapp_settings`.
- منع الكتابة المباشرة على `stage_whatsapp_settings` من المتصفح.
- لا يتم تخزين Access Token أو أي سر API في قاعدة البيانات.
- زر اختبار يجهز محادثة WhatsApp، مع توضيح أنه لا يثبت الإرسال الآلي عبر Meta API.
- إضافة صلاحية `whatsapp_settings` لمسؤول الحاسب.
- تحديث الإصدار إلى 4.58.0.

## التنفيذ في Supabase
شغّل:
`sql/phase4-step58-whatsapp-settings.sql`

ويجب التأكد من تشغيل/تطبيق تعريف الصلاحية الموجود في:
`sql/phase4-step54.4-seed-role-permissions.sql`
إذا لم تكن صلاحية `whatsapp_settings` موجودة بالفعل.

## حدود المرحلة
رقم WhatsApp Business وPhone Number ID لا يكفيان وحدهما للإرسال الآلي. الربط الفعلي مع Meta WhatsApp Cloud API يحتاج Edge Function Secrets وتهيئة مزود رسمي.
