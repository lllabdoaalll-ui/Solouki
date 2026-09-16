# Security notes

- Never commit Supabase `service_role` keys, Edge Function secrets, or other private credentials.
- `js/config.js` contains the Supabase URL and public `anon` key used by the browser. This key is not a service-role secret; database security must be enforced with RLS and server-side authorization.
- Temporary staff passwords are generated/revealed only for the issuance/printing workflow and are not stored in plaintext by the client.
- Do not commit real staff passwords, exported credential spreadsheets, `.env` files, or production backups.
