# Solouki Baseline 4.62.13

Bug-fix baseline based on 4.62.12.

## Fixes
- Fixed the preview modal close behavior by explicitly honoring the HTML `hidden` state despite `.preview-modal` using `display:flex`.
- Added Escape-key closing for the preview dialog.
- Preserved all WhatsApp notification, synchronization, manual sending, and message-template functionality from 4.62.12.

## Important
The database remains the shared source of manual WhatsApp confirmations when the 4.62.12 SQL migration has been applied.
