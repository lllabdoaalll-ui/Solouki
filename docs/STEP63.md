# STEP 63 — System Factory Reset

## الهدف
تمكين المسؤول العام من مسح كل بيانات التدريب/التشغيل بعد الجلسات التدريبية، مع الإبقاء على حسابه وكتالوج المخالفات، استعداداً للتشغيل الفعلي أو لمدرسة أخرى على نفس المشروع.

## ما يُمسح
- students, violation_records, merits/merit_records
- profiles (ما عدا المسؤول الحالي)
- stage_assignments, counselor_class_assignments
- schools, stages, stage_whatsapp_settings
- audit_logs / audit_events, student_import_batches
- guardian_access_codes, whatsapp_manual_send_confirmations
- ملفات Storage في bucket `student-files`

## ما يبقى
- حساب المسؤول العام الحالي
- violations_catalog, violation_degrees, violation_locations, penalties, degree_penalty_matrix
- permission_catalog, role_permissions

## الحماية
1. يظهر للمسؤول العام فقط
2. إعادة إدخال كلمة المرور (signInWithPassword)
3. OTP من 6 أرقام عبر Edge Function `system-reset-otp` (إرسال بريد عبر Resend إن وُجد المفتاح)
4. إقرار صريح + تأخير 10 ثوانٍ
5. التنفيذ عبر `execute_system_factory_reset` (SECURITY DEFINER)

## النشر
1. نفّذ `sql/phase4-step63-system-factory-reset.sql` في Supabase SQL Editor
2. انشر الدالة:
   ```
   supabase functions deploy system-reset-otp
   ```
3. (اختياري) أضف أسرار البريد:
   ```
   supabase secrets set RESEND_API_KEY=re_xxx
   supabase secrets set RESEND_FROM_EMAIL="Solouki <noreply@yourdomain.com>"
   ```
4. بدون Resend: يُسجَّل الكود في سجلات الدالة أثناء الإعداد فقط

## الاختبار
1. ادخل كمسؤول عام
2. افتح «تنظيف جميع بيانات النظام»
3. أكمل الخطوات — استخدم حساباً تجريبياً أولاً
4. بعد النجاح يجب أن تُسجَّل خروجاً ويبقى حسابك فقط
