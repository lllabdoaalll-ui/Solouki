# Solouki Bridge Baseline 4.72.1 — نقطة انطلاق

هذا الأرشيف = **Solouki baseline 4.72.0-fix1** + التعديلات التالية (2026-09-26).

## التعديلات المضمّنة

### 1) `js/backup.js`
- تصحيح اسم جدول التكريمات: `merits` → `merit_records`
- يصلح خطأ التصدير: `Could not find the table 'public.merits'`

### 2) `rasd/index.html` (نظام رصد)
- منع تسجيل **حضور الطلاب** يوم الجمعة دائماً، والسبت ما لم يُفعَّل من إعدادات المدرسة (`tdaDateAllowed`)
- منع تسجيل **حضور المعلم** (+25 نقطة) في الجمعة/السبت بنفس القاعدة (`teacherCheckInToday` + `isSchoolWorkdayISO`)
- زر «تسجيل حضوري اليوم» يعرض تنبيه إجازة بدلاً من الزر في أيام العطلة

### 3) ما كان موجوداً مسبقاً من 4.72.0-fix1
- جسر رصد ↔ سلوكي (`rasd/api/solouki-bridge.js`)
- Edge Functions: `teacher-behavior-catalog` / `teacher-behavior-record`
- SQL: steps 69, 70, 72
- إصلاحات الكتالوج و recorded_by / BRIDGE_RECORDED_BY_PROFILE_ID

## نشر سريع

### سلوكي (واجهة Vercel أو استضافة ثابتة)
- ارفع محتويات المجلد (أو المجلد كاملاً حسب إعداد المشروع)
- تأكد أن `js/backup.js` المحدَّث منشور

### رصد (Vercel)
1. انسخ `rasd/index.html` → جذر موقع رصد باسم `index.html`
2. انسخ `rasd/api/solouki-bridge.js` → `api/solouki-bridge.js`
3. Environment Variables:
   - `SOLOUKI_BRIDGE_SECRET` = نفس `TEACHER_BEHAVIOR_BRIDGE_SECRET` في سلوكي
   - `SOLOUKI_CATALOG_URL` = `https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-catalog`
   - `SOLOUKI_RECORD_URL` = `https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-record`

### سلوكي Supabase Secrets
- `TEACHER_BEHAVIOR_BRIDGE_SECRET`
- `BRIDGE_RECORDED_BY_PROFILE_ID` = UUID من `profiles` نشط

## هيكل مهم
```
Solouki-main/
  START-HERE-BRIDGE.md
  js/backup.js              ← إصلاح التصدير
  rasd/index.html           ← منع الجمعة/السبت
  rasd/api/solouki-bridge.js
  supabase/functions/teacher-behavior-*
  sql/phase4-step69|70|72*.sql
```

نقطة انطلاق آمنة لمزيد من التعديلات.
