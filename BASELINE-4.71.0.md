# Solouki Baseline 4.71.0

## قسم مستقل: سجلات الرصد
- صفحة جديدة `behavior-logs.html` (يومي / أسبوعي / شهري / من–إلى)
- طباعة أفقية Landscape A4
- صلاحية مستقلة `view_behavior_logs` تُمنح من شاشة الأدوار
- بلاطة في لوحة التحكم ضمن «المتابعة والتقارير»
- SQL: `sql/phase4-step71-behavior-logs.sql`

### افتراضيات الصلاحية
- counselor / stage_manager: active
- it_officer: observer
- superadmin: يظهر دائماً من الواجهة

### التشغيل
1. نفّذ `sql/phase4-step71-behavior-logs.sql` في Supabase
2. انشر الواجهة
3. من الأدوار يمكن تعديل من يحصل على «سجلات الرصد»
