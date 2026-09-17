# Solouki Baseline 4.62.5

Cumulative on 4.62.4.

## Change — إرسال واتساب يدوي جماعي
- مسار أساسي: **من رقم الأخصائي الشخصي** عبر `wa.me` (بدون Cloud API حالياً).
- زر **بدء الإرسال اليدوي**: يفتح الإشعارات المعلّقة واحداً تلو الآخر في **نفس نافذة واتساب** (`window` name ثابت).
- أزرار السابق / التالي / إنهاء أثناء المسار الجماعي.
- لكل إشعار: «فتح واتساب» + «نسخ الرسالة».
- إخفاء زر «إرسال عبر API» من الواجهة حتى يُجهَّز Cloud API لاحقاً.
- الإرسال اليدوي **لا** يُعلَّم كنجاح API في قاعدة البيانات.

## DB note (من الجلسة السابقة)
- يلزم `UNIQUE` على `whatsapp_notifications.notification_key` لعمل `ON CONFLICT` في دالة التجهيز.
- `CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_notifications_notification_key_uidx ON public.whatsapp_notifications (notification_key);`

## Files
- `notifications.html`
- `js/notifications.js`
