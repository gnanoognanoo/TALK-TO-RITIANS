-- ============================================================================
-- Migration: 20260927000001_realtime_publication.sql
-- Description: Add chat_messages and chat_rooms to the supabase_realtime
--              publication so that Supabase Realtime postgres_changes
--              (INSERT on chat_messages, UPDATE on chat_rooms) are delivered
--              to subscribed clients via websocket.
--
-- ROOT CAUSE FIX:
--   Two matched users could both send messages which were successfully
--   stored in PostgreSQL, but neither user received the other's messages
--   in realtime. Messages only appeared after a tab switch / visibility
--   change because the client fell back to a full DB fetch.
--
--   The cause: public.chat_messages and public.chat_rooms were never added
--   to the supabase_realtime publication. Without publication membership,
--   PostgreSQL logical replication does not emit WAL events for these tables,
--   and Supabase Realtime has nothing to broadcast.
--
-- SAFETY:
--   ALTER PUBLICATION ... ADD TABLE is idempotent-safe when wrapped in a
--   DO block that checks pg_publication_tables first, preventing duplicate
--   errors if this migration is re-applied or if the tables are already
--   members.
-- ============================================================================

-- 1. Add chat_messages to supabase_realtime publication (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- 2. Add chat_rooms to supabase_realtime publication (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
  END IF;
END $$;

-- 3. Set REPLICA IDENTITY FULL on chat_messages so that Realtime can apply
--    row-level filters (e.g. room_id=eq.xxx) on INSERT events.
--    Without FULL, INSERT events only include the new row's primary key
--    in the WAL, and column-based filters may not match.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- 4. Set REPLICA IDENTITY FULL on chat_rooms so that UPDATE events include
--    all columns (status, end_reason, expires_at) for client-side filtering.
ALTER TABLE public.chat_rooms REPLICA IDENTITY FULL;
