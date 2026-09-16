# Solouki Baseline — Phase 4 STEP 55.1

This archive is the clean baseline for future modifications.

## Current authentication model
- Staff login uses **email + password** only.
- PIN login is retired.
- New/reset passwords are temporary and `must_change_password` is set to `true`.
- The application does not store a plaintext staff password in `profiles`.

## Login cards
- `roles.html` / `js/roles.js` display each staff member's email.
- A password appears on a card only after that password has been issued in the current page session.
- New accounts, password resets, and newly imported accounts return the generated password to the admin and place it in the in-memory card state.
- Reloading the page clears the displayed passwords; a new password must be issued to print that card again.
- `طباعة البطاقات الجاهزة` prints only cards that currently contain an issued password.

## Important deployment files
If the Supabase project is deployed from this archive, the relevant Edge Functions are:
- `supabase/functions/admin-manage-staff`
- `supabase/functions/bulk-user-import`

Example deployment commands:
- `supabase functions deploy admin-manage-staff`
- `supabase functions deploy bulk-user-import`

## Version
`4.55.1`


## GitHub readiness
- Removed sample plaintext passwords from the Excel template.
- Added `.gitignore` and `SECURITY.md`.
- Client config keeps only the public Supabase anon key; no service-role key is committed.
- Application version is aligned to 4.55.1.
