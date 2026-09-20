# Solouki Baseline 4.70.0

## STEP 70 — أمان قراءة المخالفات + مفاتيح تفعيل رصد المعلمين + استيراد نطاق تلقائي

### 1) تضييق سياسة قراءة المخالفات (أولوية أمنية)
- استبدال `violations_read_auth` المفتوحة (`USING (true)`) بسياسة نطاق:
  - superadmin / it_officer → كل المدرسة
  - stage_manager → مراحل `stage_assignments` فقط
  - counselor → فصول `counselor_class_assignments` فقط
- نفس التضييق على `merit_records` إن وُجد الجدول.
- المعلمون لا يستخدمون Auth؛ الجسر المستقبلي يعمل بـ service role.

### 2) جدول `teacher_behavior_switches`
- مفتاح لكل (مدرسة × مرحلة × قسم عربي/لغات).
- `recording_enabled` و `merits_enabled` (افتراضي: مطفأ).
- دالة `teacher_recording_enabled(...)` للجسر.
- واجهة تفعيل/إيقاف داخل صفحة دليل المعلمين.

### 3) استيراد معلمين مع النطاق التلقائي
- عمود جديد **الفصول** بصيغة:
  `المرحلة|الصف|الفصل|القسم;...`
- عند الاستيراد يُملأ `teacher_directory` + `teacher_class_assignments` دون تدخل يدوي.
- النموذج المحدّث يتضمن ورقة تعليمات.

### SQL المطلوب تنفيذه في Supabase
```
sql/phase4-step70-security-and-switches.sql
```
(بعد STEP 69 إن لم يكن منفذاً)

### ما لم يتغير
- كتالوج الجسر (STEP 68)
- لا تسجيل لحظي من المعلم بعد (STEP 72+)
