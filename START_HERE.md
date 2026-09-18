# Solouki — Master Development Baseline

## Baseline
- Current release: **4.64.0 (STEP 64)**
- يشمل: كل الميزات حتى التحليلات وPWA + Factory Reset + **بداية عام دراسي جديد**.

## آخر إضافة (64)
- بداية عام دراسي جديد: أرشفة اختيارية للطلاب + تحديث العام دون مسح السجلات.
- تنظيف النظام الكامل (63) ما زال متاحاً بجانب هذا الزر.

## قبل الاستخدام
1. نفّذ SQL:
   - `sql/phase4-step63-system-factory-reset.sql`
   - `sql/phase4-step64-new-academic-year.sql`
2. (لـ Factory Reset) انشر Edge Function `system-reset-otp`.
3. اختبر على بيئة تجريبية أولاً.

## الخطوة التالية المقترحة
تكامل رصد الدرجات (تسجيل مخالفة من المعلم) أو صقل إنتاج إضافي.
