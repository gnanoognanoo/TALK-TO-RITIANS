# Privacy & Security Model: TALK TO RITIANS

This document defines the strict privacy guarantees, identity partitions, and access controls governing student data in **Talk to RITians**.

---

## 1. Core Principle: Zero Identity Leakage

The fundamental guarantee of Talk to RITians is that **a student's real-world identity is cryptographically and architecturally segregated from their anonymous chat presence.**

A stranger matched in a 1-to-1 chat must **never** be able to discover or reconstruct the other participant's real identity through the client, network traffic, or database inspection.

---

## 2. Identity Classification Matrix

| Field | Classification | Visible to Verified Owner | Visible to Chat Stranger | Visible to Backend / DB |
|---|---|---|---|---|
| **Anonymous Username** | Public Anonymous | YES | YES | YES |
| **Avatar Preset / Config** | Public Anonymous | YES | YES | YES |
| **Real Name** | Private Identity | YES (profile settings only) | **NEVER** | YES (encrypted/isolated) |
| **Personal Email** | Private Identity | YES (auth session) | **NEVER** | YES (`auth.users`) |
| **College ID / Reg Number**| Private Identity | YES | **NEVER** | YES (`college_identities`) |
| **College Email** | Private Identity | YES | **NEVER** | YES (`college_identities`) |
| **Department** | Private Identity | YES | **NEVER** (V1) | YES |
| **Section / Class** | Private Identity | YES | **NEVER** | YES |
| **Batch / Academic Year** | Private Identity | YES | **NEVER** (V1) | YES |
| **Graduation Year** | Private Identity | YES | **NEVER** (V1) | YES |
| **Gender** | Private Identity | YES | **NEVER** (V1) | YES |
| **College ID Card Hash** | Internal Cryptographic | NO | **NEVER** | YES (Unique Index) |

---

## 3. What the Chat Stranger Sees

In the chat interface, the stranger's client receives **only** an `AnonymousIdentity` payload:

```typescript
export interface AnonymousIdentity {
  anonymousUsername: string; // e.g. "EchoPulse"
  avatarId: string;          // e.g. "robot-blue"
  avatarConfig?: Record<string, unknown>; // e.g. { color: "#6366f1" }
}
```

### Prohibited Disclosures:
Under no circumstances will the chat interface or network response provide:
- Real name
- College registration / roll number
- Personal email or college email
- Department, section, class, batch, or graduation year
- Gender

---

## 4. Multi-Layer Access Control

### 4.1 Database Layer (PostgreSQL Row Level Security)

RLS is enabled on every table. The database will reject unauthorized queries at the engine level even if the client makes direct PostgREST calls.

1. **`college_identities` Table**:
   - `SELECT`: `USING (auth.uid() = user_id)` (Users can only query their own verified row).
   - `INSERT`: Allowed only via trusted `SECURITY DEFINER` function (`link_college_identity`) to prevent forged verification stamps.
   - `UPDATE` / `DELETE`: Denied for all non-admin roles.

2. **`chat_rooms` Table**:
   - `SELECT`: `USING (auth.uid() = participant1_id OR auth.uid() = participant2_id)`
   - Strangers who are not participants in that specific room receive an empty set.

3. **`chat_messages` Table**:
   - `SELECT`: `USING (EXISTS (SELECT 1 FROM chat_rooms WHERE chat_rooms.id = chat_messages.room_id AND (chat_rooms.participant1_id = auth.uid() OR chat_rooms.participant2_id = auth.uid())))`
   - `INSERT`: Allowed only if `auth.uid() = sender_id` AND user belongs to active room.

4. **`profiles` Table**:
   - `SELECT`: Public read is permitted **only for public columns**: `id`, `anonymous_username`, `avatar_id`, `avatar_config`.
   - Private attributes are stored in partitioned tables or protected columns.

### 4.2 Application / Service Layer (Frontend)
- Client-side code consumes data via strongly typed services that explicitly typecast stranger identity to `AnonymousIdentity`.
- Redux / Context / Local state does not retain or log peer user UUIDs beyond room scoping.

### 4.3 Network & API Inspection Protection
- Database foreign keys linking messages to participants use internal UUIDs (`sender_id`).
- The frontend chat UI resolves `sender_id` to either "You" or "Stranger", fetching only the peer's public `AnonymousIdentity` via a sanitized RPC view:
  ```sql
  CREATE VIEW public_anonymous_profiles AS
  SELECT id, anonymous_username, avatar_id, avatar_config
  FROM profiles;
  ```

---

## 5. College ID 1-to-1 Uniqueness & Hash Protection

To prevent students from creating multiple accounts with the same physical ID card:
1. When a QR code is parsed, the student's unique registration identifier is combined with a server-side salt and hashed via SHA-256:
   ```sql
   college_id_hash = encode(sha256((card_id || server_salt)::bytea), 'hex');
   ```
2. The `college_identities` table enforces a strict unique constraint:
   ```sql
   CREATE UNIQUE INDEX idx_college_identities_hash ON college_identities(college_id_hash);
   ```
3. If an account is already linked to that hash, the transaction aborts with error `COLLEGE_ID_ALREADY_LINKED`.
4. The raw QR data is never retained in cleartext logs.
