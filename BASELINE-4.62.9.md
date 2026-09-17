# Solouki Baseline 4.62.9

Cumulative on 4.62.8.

## WhatsApp notification reliability
- Keeps the distinction between access notice, full written warning, and warning + escalation.
- Fixes the common case where `queue_daily_whatsapp_notifications` returns zero rows even though today's `violation_records` exist.
- Adds an RLS-protected browser fallback that reads today's violations + student phone fields and groups them by student.
- Phone selection priority: father → mother → guardian_phone, with Egyptian number normalization.
- Displays a clear reason when no valid guardian phone exists.
- Manual bulk sending keeps one named WhatsApp window and requires explicit operator confirmation before advancing.
- Manual confirmations are stored locally in the browser only; they are not falsely reported as Meta/API delivery.
- Removes the duplicate sender element ID from the page.

## Important
- The fallback is a safety net for stale/missing queue RPC behavior; the Supabase queue/RPC should still be repaired at the database layer for authoritative persistence.
- No Meta Cloud API token is added to the client.

## Files changed
- `notifications.html`
- `js/notifications.js`
- `js/config.js`
- `BASELINE_VERSION.txt`
- `CHANGELOG.md`
- `BASELINE-4.62.9.md`
