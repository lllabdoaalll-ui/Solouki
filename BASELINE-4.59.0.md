# Solouki Baseline 4.59.0 — STEP 59

## WhatsApp Notification Center
- Notification records are generated from `violation_records` by date.
- Father and mother numbers can be queued separately when both are present and different.
- `notification_key` prevents duplicate queue records for the same student/date/parent/number.
- Statuses: queued, sending, sent, failed. Attempts and last attempt time are tracked.
- Sending is performed by `supabase/functions/whatsapp-send/index.ts`.
- `WHATSAPP_ACCESS_TOKEN` is an Edge Function secret and is never stored in SQL, JS, or the notification table.
- Manual WhatsApp opening is explicitly a fallback and does not mark an API send as successful.
- Proactive outbound WhatsApp messages may require an approved Meta template depending on the recipient/conversation state; this step currently sends a text payload and reports provider errors faithfully.

## Database migration
Run: `sql/phase4-step59-whatsapp-notification-center.sql`

## Edge Function deployment
Deploy `whatsapp-send` and configure `WHATSAPP_ACCESS_TOKEN`; optionally set `WHATSAPP_API_VERSION`.
