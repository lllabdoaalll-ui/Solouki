# Teacher Behavior Reporting — Roadmap

1. **STEP 68 — Catalog Bridge (completed)**
   - Solouki catalog is the only source of violation definitions.
2. **STEP 69 — Teacher directory + class assignments (completed)**
   - Map Grade System Pro teacher IDs to Solouki teachers/classes.
3. **STEP 70 — Stage-scoped enable/disable + scoped RLS + auto class import (completed in 4.70.0)**
   - Independent teacher violation/merit recording switches per stage × section.
   - Hardened SELECT policies on violation_records / merit_records.
   - Excel import fills teacher_class_assignments automatically.
4. **STEP 71 — Student import from Grade System Pro**
   - National ID as cross-system key; preserve Solouki student code.
5. **STEP 72 — Secure recording bridge**
   - Server-side validation of teacher identity, scope, student, catalog item and switch state.
6. **STEP 73 — Grade System Pro teacher UI**
   - Fast violation/merit recording without a second Solouki login.
7. **STEP 74 — Behavior analytics**
   - Repetition, multiple reporters, recent activity and stage/class dashboards.
8. **STEP 75 — Parent notifications / printing**
   - WhatsApp queue, printable notices and complete behavior file.
