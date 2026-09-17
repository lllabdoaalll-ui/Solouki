# Solouki Baseline 4.62.12

Cumulative on 4.62.11.

## Change — Cross-device WhatsApp manual-send synchronization
- Manual WhatsApp confirmations are persisted in Supabase instead of relying on browser localStorage as the source of truth.
- Existing local confirmations are migrated on a best-effort basis when the page loads.
- Refresh/reload on another device reads the same confirmed states for the same authenticated account.
- Message modes remain separate: access / warning / warning_escalation.
- SQL migration: `sql/phase4-step62-manual-whatsapp-sync.sql`.

## Important deployment note
Run the SQL migration in the project's Supabase SQL Editor before expecting cross-device synchronization. The frontend retains a local fallback only for resilience; the database is the authoritative source once the migration is installed.
