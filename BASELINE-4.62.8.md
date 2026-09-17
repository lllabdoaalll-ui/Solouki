# Solouki 4.62.8 — WhatsApp Messaging Baseline

- Maintains the 4.62.7 project as the starting point.
- Separates WhatsApp **access notification** from the **full written warning/report**.
- Access notification tells the guardian to open Solouki and use the student's national ID + student code; it does not send the full behavior report.
- Written warning can be sent in full text.
- Optional written warning + escalation mode includes the available escalation level, suggested action, and reason.
- Manual bulk sending supports selecting multiple students and reuses one named WhatsApp window (`solouki_whatsapp`).
- The operator manually confirms sending in WhatsApp before moving to the next student.
- No Meta Cloud API is required for this manual mode.
