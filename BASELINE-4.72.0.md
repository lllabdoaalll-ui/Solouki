# BASELINE 4.72.0 — حذف جماعي للطلاب

تاريخ: 2026-10-07

## ما الجديد

### حذف / استعادة جماعي في قائمة الطلاب
- شريط أدوات `bulk-bar` فوق جدول/بطاقات الطلاب
- checkbox بجانب كل طالب + «تحديد الكل المعروض»
- زر **حذف المحددين** (انسحاب ناعم للنشطين)
- زر **استعادة المحددين** (للمنسحبين)
- يعمل مع صلاحية `delete_students` فقط (superadmin / it_officer)
- يستخدم RPC الموجود: `admin_withdraw_student` / `admin_restore_student`
- يدعم الوضع المحلي (Demo) والسحابة (Supabase)

## الملفات المتأثرة
- `students.html` — شريط bulk-bar + cache-bust `?v=4.72.0`
- `js/students.js` — selectedKeys, bulkWithdrawSelected, bulkRestoreSelected, checkboxes في renderRoster
- `css/students.css` — تنسيق الشريط والصفوف المحددة

## نقطة انطلاق للتعديلات اللاحقة
هذا الأرشيف يحتوي المشروع كاملاً بعد كل التعديلات حتى 4.72.0.
ابدأ منه لأي ميزة جديدة واذكر رقم النسخة التالية في BASELINE وquery string للكاش.
