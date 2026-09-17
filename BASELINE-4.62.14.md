# Solouki Baseline 4.62.14

Bug-fix baseline based on 4.62.12.

## Fixes
- Fixed the preview modal close behavior by explicitly honoring the HTML `hidden` state despite `.preview-modal` using `display:flex`.
- Added Escape-key closing for the preview dialog.
- Preserved all WhatsApp notification, synchronization, manual sending, and message-template functionality from 4.62.12.

## Important
The database remains the shared source of manual WhatsApp confirmations when the 4.62.12 SQL migration has been applied.


## 4.62.14 — إصلاح قاطع لنافذة المعاينة
- تم تحويل فتح/إغلاق نافذة المعاينة إلى حالة CSS صريحة `is-open` بدل الاعتماد على `hidden` وحده.
- تحديث cache-busting إلى 4.62.14 في صفحة الإشعارات.
- إغلاق النافذة من زر إغلاق، والنقر على الخلفية، ومفتاح Escape.
- إغلاق النافذة يعيدها إلى حالة مخفية ويزيل حالة منع تمرير الصفحة.
