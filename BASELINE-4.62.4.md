# Solouki Baseline 4.62.4

Cumulative on 4.62.3.

## Fix
- **notifications.html**: كان يحمّل `js/notifications.js` دون `js/core/session.js` (وبدون utils / supabase-client / permissions)، فيظهر الخطأ **SoloukiSession is not defined**.
- إضافة سكربتات النواة بنفس ترتيب الصفحات الأخرى (violations / merits / dashboard).

## Files changed
- `notifications.html`

## No SQL changes
