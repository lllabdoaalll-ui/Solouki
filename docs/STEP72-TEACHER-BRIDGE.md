# STEP 72 — جسر رصد ↔ سلوكي (حسابات منفصلة)

## المبدأ

| النظام | GitHub | Supabase | Vercel |
|--------|--------|----------|--------|
| **سلوكي** | مشروع مستقل | مشروع مستقل = مصدر الحقيقة للسلوك | واجهة الأخصائي |
| **رصد** | مشروع مستقل | مشروع مستقل = طلاب/معلمون/درجات | واجهة المعلم |

**لا تُشارك** بين المشروعين:
- `service_role` key لسلوكي
- كلمات مرور قاعدة سلوكي

**ما يُشارك فقط:**
- عنوان Edge Function لسلوكي
- سر مشترك `TEACHER_BEHAVIOR_BRIDGE_SECRET` (يُولَّد مرة ويُحفظ في Secrets الطرفين)

```
[معلم في رصد]
    → API/Server في رصد (Vercel serverless أو Supabase Edge لرصد)
    → HTTPS + x-solouki-bridge-secret
    → Solouki Edge: teacher-behavior-record
    → التحقق: معلم · نطاق فصول · مفتاح مرحلة · طالب · كتالوج
    → كتابة violation_records / merit_records في Supabase سلوكي
```

---

## على مشروع سلوكي (مرة واحدة)

### 1) SQL
```text
sql/phase4-step69-teacher-directory.sql   (إن لم يُنفَّذ)
sql/phase4-step70-security-and-switches.sql
sql/phase4-step72-teacher-bridge-record.sql
```

### 2) نشر الدوال
```bash
# من مجلد مشروع سلوكي المرتبط بـ Supabase سلوكي
supabase functions deploy teacher-behavior-catalog --project-ref <SOLOUKI_REF>
supabase functions deploy teacher-behavior-record  --project-ref <SOLOUKI_REF>
```

### 3) Secrets في Supabase سلوكي
```bash
supabase secrets set TEACHER_BEHAVIOR_BRIDGE_SECRET="ضع-سراً-طويلاً-عشوائياً"
# إن كان recorded_by / awarded_by إلزاميين:
supabase secrets set BRIDGE_RECORDED_BY_PROFILE_ID="<uuid من profiles نشط>"
```

### 4) تجهيز البيانات في سلوكي
- دليل المعلمين: `external_teacher_id` = نفس Teacher ID في رصد
- نطاق الفصول لكل معلم
- تفعيل مفاتيح المرحلة/القسم من شاشة دليل المعلمين

### 5) كتالوج للمعلمين (قراءة فقط)
```
GET/POST https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-catalog
Header: x-solouki-bridge-secret: <secret>
```

---

## على مشروع رصد (منفصل)

### متغيرات البيئة (Vercel رصد أو Edge رصد فقط — ليس المتصفح)
```
SOLOUKI_BRIDGE_URL=https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-record
SOLOUKI_BRIDGE_SECRET=<نفس السر>
SOLOUKI_CATALOG_URL=https://<SOLOUKI_REF>.supabase.co/functions/v1/teacher-behavior-catalog
```

### مثال استدعاء من سيرفر رصد
```js
const res = await fetch(process.env.SOLOUKI_BRIDGE_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-solouki-bridge-secret': process.env.SOLOUKI_BRIDGE_SECRET,
  },
  body: JSON.stringify({
    action: 'record_violation',
    external_teacher_id: teacherIdFromRasd, // نفس ID في دليل معلمي سلوكي
    student_national_id: '32103101402334',  // مفتاح عابر للأنظمة
    violation_id: 12,                       // من كتالوج سلوكي
    location_id: 1,
    notes: 'أثناء الحصة',
  }),
});
const data = await res.json();
// data.ok === true → record_id
```

### تكريم
```js
body: JSON.stringify({
  action: 'record_merit',
  external_teacher_id: teacherIdFromRasd,
  student_national_id: '...',
  title: 'تعاون متميز',
  points: 10,
})
```

---

## أكواد الخطأ الشائعة

| error | المعنى |
|-------|--------|
| `invalid_bridge_secret` | السر غير مطابق |
| `teacher_not_found_or_inactive` | Teacher ID غير موجود في دليل سلوكي |
| `student_not_found` | الرقم القومي غير موجود في طلاب سلوكي |
| `recording_disabled_for_stage_section` | مفتاح المرحلة/القسم موقوف |
| `teacher_not_assigned_to_student_class` | المعلم غير مسموح له بفصل هذا الطالب |
| `violation_not_found_or_inactive` | بند الكتالوج غير صالح |
| `recorded_by_required` | اضبط `BRIDGE_RECORDED_BY_PROFILE_ID` |

---

## ترتيب التشغيل العملي

1. سلوكي: SQL 69→70→72 + نشر الدالتين + السر  
2. سلوكي: دليل معلمين + نطاق + تفعيل مفاتيح  
3. سلوكي: طلاب بنفس الأرقام القومية المستخدمة في رصد  
4. رصد: حفظ URL + السر في Server env فقط  
5. رصد: شاشة معلم تستدعي الجسر (STEP 73 واجهة)  
6. اختبار: معلم تجريبي → مخالفة واحدة → تظهر في ملف السلوك وسجل الرصد في سلوكي  

---

## الأمان

- السر فقط على السيرفر (رصد Vercel Serverless / Edge)، ليس في JS للمتصفح.
- دوال سلوكي تتحقق دائماً من: السر · المعلم · المفتاح · النطاق · الطالب · الكتالوج.
- حتى لو تسرّب anon key لرصد، لا يكفي للكتابة في سلوكي.
