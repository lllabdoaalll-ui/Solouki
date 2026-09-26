# Solouki Bridge Baseline — نقطة انطلاق (بعد إصلاحات الجسر)

هذا الأرشيف = **Solouki baseline 4.72.0** + تعديلات الجسر التالية.

## ما أُصلح في هذه الحزمة

### 1) `supabase/functions/teacher-behavior-catalog`
- حذف عمود `code` غير الموجود من جدول `violation_locations` (كان يسبب `locations_load_failed`)
- إضافة `title` / `name` / `label` من `description_ar` لعرض البنود في رصد
- `config.toml` → `verify_jwt = false`

### 2) `supabase/functions/teacher-behavior-record`
- بحث الطالب بالرقم القومي **بدون فرض school_id في SQL** (طلاب الاستيراد غالباً بلا school_id)
- إعادة محاولة select بأعمدة أضيق عند فشل المخطط
- رسائل أوضح: `student_not_found` مع detail
- `config.toml` → `verify_jwt = false`

### 3) `rasd/index.html` (نظام رصد الدرجات)
- عرض بند المخالفة: `درجة X · الكود — الوصف`
- ترتيب البنود حسب الدرجة ثم الرمز

### 4) `rasd/api/solouki-bridge.js`
- وكيل Vercel يضيف السر من السيرفر ويستدعي كتالوج/تسجيل سلوكي

---

## نشر سلوكي (Supabase)

```bash
# من مجلد المشروع المرتبط بـ project-ref سلوكي
supabase functions deploy teacher-behavior-catalog --project-ref yjfajkuozpijxrzlnfgh --no-verify-jwt
supabase functions deploy teacher-behavior-record  --project-ref yjfajkuozpijxrzlnfgh --no-verify-jwt
```

Secrets في Edge Functions:
- `TEACHER_BEHAVIOR_BRIDGE_SECRET` = سر طويل عشوائي (نفس القيمة في Vercel رصد)

SQL إن لم يُنفَّذ سابقاً (بالترتيب):
1. `sql/phase4-step69-teacher-directory.sql`
2. `sql/phase4-step70-security-and-switches.sql`
3. `sql/phase4-step72-teacher-bridge-record.sql`
4. (مستحسن) `sql/phase4-step42-students-columns.sql`
5. (مستحسن للرفع) `sql/phase4-step42-storage-policies.sql` + bucket `student-files`

## نشر رصد (Vercel)

1. انسخ `rasd/index.html` إلى جذر موقع رصد (أو ادمج التعديلات).
2. انسخ `rasd/api/solouki-bridge.js` إلى `api/solouki-bridge.js`.
3. Environment Variables:
   - `SOLOUKI_BRIDGE_SECRET` = نفس سر سلوكي
   - `SOLOUKI_CATALOG_URL` = `https://yjfajkuozpijxrzlnfgh.supabase.co/functions/v1/teacher-behavior-catalog`
   - `SOLOUKI_RECORD_URL`  = `https://yjfajkuozpijxrzlnfgh.supabase.co/functions/v1/teacher-behavior-record`

## بيانات التشغيل (لا تُنسى)

| المطلوب | أين |
|---------|-----|
| Teacher ID متطابق نشط | سلوكي → دليل المعلمين = نفس ID في رصد |
| نطاق فصول المعلم | يشمل فصل الطالب |
| مفتاح المرحلة/القسم | مفعّل |
| الطالب بنفس الرقم القومي | **في جدول students بسلوكي** (رفع رصد وحده لا يكفي) |

## اختبار سريع

```bash
curl -X POST "https://<RASD>.vercel.app/api/solouki-bridge" \
  -H "Content-Type: application/json" \
  -d '{"action":"catalog"}'
# متوقع: {"ok":true,"violations":[...]}

curl -X POST "https://<RASD>.vercel.app/api/solouki-bridge" \
  -H "Content-Type: application/json" \
  -d '{"action":"record_violation","external_teacher_id":"<ID>","student_national_id":"14digits","violation_id":1}'
```

## هيكل المجلدات المهمة

```
Solouki-main/
  START-HERE-BRIDGE.md          ← ابدأ من هنا
  SOLOUKI-BRIDGE-README.md
  supabase/functions/
    teacher-behavior-catalog/   ← معدّل
    teacher-behavior-record/    ← معدّل
  sql/phase4-step69|70|72*.sql
  rasd/
    index.html                  ← رصد معدّل (عرض الكتالوج)
    api/solouki-bridge.js       ← وكيل Vercel
```

نقطة انطلاق آمنة لمزيد من التعديلات على الجسر أو الواجهة.


---

## تحديث 4.72.1 (مضمّن في هذا الأرشيف)

1. **`js/backup.js`**: جدول التكريمات `merit_records` (كان خطأ `merits`).
2. **`rasd/index.html`**: منع تسجيل حضور الطلاب والمعلمين يوم **الجمعة** دائماً، و**السبت** ما لم يُفعَّل من إعدادات المدرسة.

راجع `BASELINE-4.72.1.md` للتفاصيل.
