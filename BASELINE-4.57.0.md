# Solouki — BASELINE 4.57.0

STEP 57 is the official cumulative baseline.

- STEP 56 operational audit log retained.
- STEP 57 adds server-side audit triggers for critical mutations.
- Direct authenticated writes to `audit_logs` are revoked.
- Audit details intentionally exclude sensitive values; UPDATE records changed column names only.
- Critical tables covered: students, violation_records, merit_records, behavior_followups, whatsapp_notifications.
- Existing staff authentication remains email/password only.
- WhatsApp credentials/tokens remain outside the database schema.

Required migration:
`sql/phase4-step57-audit-hardening.sql`
