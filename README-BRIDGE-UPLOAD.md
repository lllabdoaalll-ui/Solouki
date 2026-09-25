# ملفات جسر رصد ↔ سلوكي — للرفع على GitHub

## محتويات الأرشيف (نفس مسارات مستودع Solouki)

```
supabase/functions/teacher-behavior-catalog/index.ts
supabase/functions/teacher-behavior-record/index.ts
sql/phase4-step69-teacher-directory.sql
sql/phase4-step70-security-and-switches.sql
sql/phase4-step72-teacher-bridge-record.sql
docs/STEP72-TEACHER-BRIDGE.md
```

## 1) الرفع على GitHub

1. افتح مستودع: https://github.com/llabdoaalll-ui/Solouki
2. إن كانت المجلدات موجودة مسبقاً: استبدل الملفات بنفس المسارات.
3. أو من الكمبيوتر: انسخ المجلدات فوق نسخة المشروع ثم Commit + Push.

رفع الملفات على GitHub **وحده لا ينشر** الدوال على Supabase.

## 2) تنفيذ SQL في Supabase (مرة واحدة)

في مشروع Solouki → SQL Editor، نفّذ بالترتيب:

1. sql/phase4-step69-teacher-directory.sql
2. sql/phase4-step70-security-and-switches.sql
3. sql/phase4-step72-teacher-bridge-record.sql

(تخطَّ أي ملف نفّذته سابقاً بنجاح.)

## 3) نشر الدوال على Supabase (ضروري)

بعد أن تكون الملفات على جهازك داخل مجلد المشروع:

```bash
supabase login
supabase functions deploy teacher-behavior-catalog --project-ref yjfajkuozpijxrzlnfgh
supabase functions deploy teacher-behavior-record --project-ref yjfajkuozpijxrzlnfgh
```

ثم Refresh في: Edge Functions → Functions

## 4) السر

في Solouki → Edge Functions → Secrets:
TEACHER_BEHAVIOR_BRIDGE_SECRET = نفس قيمة SOLOUKI_BRIDGE_SECRET في Vercel رصد
