-- ============================================================================
-- TALK TO RITIANS - Production Migration: Realtime Broadcast Channel Authorization
-- Migration: 20261015000003_realtime_broadcast_authorization.sql
-- ============================================================================
-- Enforces server-side authorization on realtime.messages for room-scoped typing
-- and chat event channels.
--
-- Security Invariants:
-- 1. Topic format: 'chat-messages-<room_uuid>'
-- 2. Subscriber must be an authenticated participant (user_1 or user_2) of an active room.
-- 3. Broadcaster must be an authenticated participant (user_1 or user_2) of an active room.
-- 4. Prevents unauthenticated, eavesdropping, or third-party broadcast injections.
-- ============================================================================

-- Ensure Row Level Security is enabled on realtime.messages
DO $$
BEGIN
  ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  -- realtime.messages is owned by supabase_realtime_admin in managed instances
  -- where RLS is already enabled by default.
  NULL;
END $$;

-- 1. SELECT Policy (Listening to room broadcast channels)
DROP POLICY IF EXISTS "chat_room_broadcast_select" ON realtime.messages;
CREATE POLICY "chat_room_broadcast_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE ('chat-messages-' || r.id::text) = realtime.topic()
      AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
      AND r.status = 'active'
  )
);

-- 2. INSERT Policy (Publishing broadcast events to room channels)
DROP POLICY IF EXISTS "chat_room_broadcast_insert" ON realtime.messages;
CREATE POLICY "chat_room_broadcast_insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE ('chat-messages-' || r.id::text) = realtime.topic()
      AND (r.user_1 = auth.uid() OR r.user_2 = auth.uid())
      AND r.status = 'active'
  )
);
