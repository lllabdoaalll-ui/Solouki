# Solouki Baseline 4.62.18

## Purpose
Fix Analytics scope handling so results are calculated strictly inside the authenticated user’s assigned range.

## Scope rules
- superadmin: active stages in the current school.
- stage_manager / it_officer: stages assigned through `stage_assignments`.
- counselor: stages/classes derived from `counselor_class_assignments`, with violations restricted to those assigned classes.
- The database RPC enforces the scope; the frontend does not broaden it.

## Diagnostics
The RPC returns scope and diagnostics metadata so the UI can distinguish “no data” from “data exists but is outside this account’s scope”.

## Data safety
No student or violation records are deleted or modified by this migration.
