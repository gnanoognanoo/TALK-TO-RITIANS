# Supabase SQL Migrations

Owner: **Person B (Backend/Database)**

This directory contains versioned SQL migration scripts for:
- Tables (`profiles`, `college_identities`, `matchmaking_queue`, `chat_rooms`, `chat_messages`)
- Row Level Security (RLS) policies
- Postgres triggers and stored procedures (e.g. `match_students()`, `link_college_identity()`)
- Database indexes for low-latency matchmaking and real-time chat

Naming convention:
`YYYYMMDDHHMMSS_description.sql` (e.g., `20260920000001_initial_schema.sql`)
