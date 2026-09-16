# STEP 60 — تتبع تسليم إشعارات WhatsApp

تضيف هذه الخطوة طبقة متابعة بعد نجاح طلب الإرسال: استقبال حالات مزود WhatsApp (sent / delivered / read / failed)، ربطها بالإشعار، وحفظ سجل للأحداث الواردة.

## SQL
نفّذ `sql/phase4-step60-whatsapp-delivery-tracking.sql` بعد STEP 59.

## Edge Function
انشر `supabase/functions/whatsapp-webhook` واضبط Secret باسم `WHATSAPP_VERIFY_TOKEN`.
استخدم رابط الـ Edge Function في إعداد Webhook لدى Meta/WhatsApp، ثم نفّذ التحقق باستخدام نفس الـ verify token.

## النتيجة
- `whatsapp_notifications.provider_status` يعرض آخر حالة معروفة.
- `whatsapp_webhook_events` يحتفظ بالأحداث الواردة للرجوع إليها.
- حالة `sent` تعني قبول الرسالة من المزود، بينما `delivered` و`read` تعكسان حالات التسليم/القراءة عندما يرسلها المزود.
- عند `failed` يتم حفظ سبب الخطأ المتاح وتسجيل حدث تدقيق.

لا يتم تخزين Access Token في قاعدة البيانات.
