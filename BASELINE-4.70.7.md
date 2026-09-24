# Solouki Baseline 4.70.7

## إصلاح تكرار المراحل في مفاتيح تفعيل رصد المعلمين
- `js/teachers.js` → `renderSwitches`: كل مرحلة تُعرض مرة واحدة فقط بقسمها الفعلي من جدول `stages` (لا ضرب مرحلة × عربي/لغات).
- `sql/phase4-step70-security-and-switches.sql`: بذرة المفاتيح تعتمد على `stages.section` بدل CROSS JOIN على القسمين.
- رفع الإصدار إلى 4.70.7 (config + cache-bust في teachers.html).

## السابق
4.70.6 دليل معلمين + STEP 70، 4.70.5 واجهة أدوار، 4.70.4 طلاب موبايل + صلاحيات
