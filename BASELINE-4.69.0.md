# Solouki Baseline 4.69.0

## STEP 69 — دليل المعلمين وربط نطاق الفصول

- Added `teacher_directory` for external Grade System Pro teacher IDs.
- Added `teacher_class_assignments` for stage/grade/class/section scope.
- No duplicate Supabase Auth accounts are created for Grade System Pro teachers.
- Added `teacher_is_assigned_to_class(...)` as a server-side scope-check foundation for the future recording bridge.
- Added `teachers.html` / `js/teachers.js` for superadmin and IT officer management.
- Added `sql/phase4-step69-teacher-directory.sql`; run this migration in the Solouki Supabase project before opening the teacher directory.
- Existing Solouki catalog remains the source of violation definitions.
- Teacher recording is intentionally not enabled yet.

Next: STEP 70 — stage-scoped teacher violation/merit recording switches.
