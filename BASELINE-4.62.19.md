# Solouki 4.62.19

## Scope Audit
- Added `get_behavior_scope_audit_v1(date,date,text)` for aggregate, safe verification of analytics scope.
- The audit reports counts only and never exposes students outside the authenticated user scope.
- Added a **فحص نطاق الصلاحيات** button to Analytics.
- It distinguishes exclusions caused by stage scope from exclusions caused by counselor class assignment.
- Existing analytics scope enforcement remains unchanged.
