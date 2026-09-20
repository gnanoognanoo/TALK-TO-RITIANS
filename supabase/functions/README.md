# Supabase Edge Functions

Owner: **Person B (Backend/Database)**

Edge functions are used strictly where server-side execution is necessary:
- QR payload signature verification (if college cards use signed keys)
- Elevated verification checks avoiding direct client exposure
- Scheduled cleanup of stale matchmaking queue entries
