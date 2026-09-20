# Technical API Contract: TALK TO RITIANS

This document defines the formal communication contract between the React Frontend (Person A) and the Supabase Backend / Database layer (Person B).

---

## 1. Response Envelope Standard

All service methods return a standard typed envelope:

```typescript
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  success: boolean;
}

export interface ApiError {
  code: string;     // Machine-readable code, e.g. "AUTH_SESSION_EXPIRED"
  message: string;  // User-facing or debug message
  details?: unknown;
}
```

---

## 2. Authentication APIs

### `getCurrentUser()`
- **Layer**: Supabase Auth Client + `profiles` table lookup
- **Input**: None (derives from session JWT)
- **Success Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "c7a840e6-5bc7-4638-b78f-6b22b7fa1204",
      "email": "student@gmail.com",
      "accountState": "verified",
      "isCollegeVerified": true,
      "createdAt": "2026-09-20T11:00:00Z",
      "updatedAt": "2026-09-20T11:30:00Z"
    },
    "error": null
  }
  ```
- **Error Codes**: `NOT_AUTHENTICATED`, `USER_NOT_FOUND`

### `signInWithPersonalEmail(email: string)`
- **Layer**: Supabase Auth (`supabase.auth.signInWithOtp`)
- **Input**: `{ "email": "student@gmail.com" }`
- **Success Response**:
  ```json
  {
    "success": true,
    "data": { "confirmationSent": true },
    "error": null
  }
  ```
- **Error Codes**: `INVALID_EMAIL_FORMAT`, `RATE_LIMIT_EXCEEDED`

### `signOut()`
- **Layer**: Supabase Auth (`supabase.auth.signOut`)
- **Input**: None
- **Success Response**: `{ "success": true, "data": null, "error": null }`

---

## 3. College Verification APIs

### `linkCollegeIdentity(qrPayload: ParsedQRIdentity)`
- **Layer**: Supabase RPC (`rpc/link_college_identity`) or Edge Function
- **Input**:
  ```json
  {
    "rawText": "RIT|2023|CS|312423104001|JOHN DOE",
    "isValidFormat": true,
    "extractedFields": {
      "registerNumber": "312423104001",
      "fullName": "JOHN DOE",
      "department": "CSE",
      "batch": "2023-2027"
    },
    "cardIdentifier": "312423104001"
  }
  ```
- **Execution Rules**:
  1. Hashes `cardIdentifier` with server salt (SHA-256).
  2. Ensures hash is not already linked to another `user_id`.
  3. Inserts into private table `college_identities`.
  4. Updates `user.account_state` to `verified`.
- **Success Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "e81d6f6e-6395-46aa-b2b9-623e1e9a3a2a",
      "userId": "c7a840e6-5bc7-4638-b78f-6b22b7fa1204",
      "collegeIdHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "registerNumber": "312423104001",
      "verifiedAt": "2026-09-20T12:00:00Z"
    },
    "error": null
  }
  ```
- **Error Codes**:
  - `COLLEGE_ID_ALREADY_LINKED`: This college ID card is already registered to another account.
  - `INVALID_QR_PAYLOAD`: Card format could not be verified.
  - `ALREADY_VERIFIED`: Current account already has a college identity.

---

## 4. Profile & Onboarding APIs

### `getProfile(userId: string)`
- **Layer**: Supabase PostgREST `profiles` table
- **Success Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "c7a840e6-5bc7-4638-b78f-6b22b7fa1204",
      "anonymousUsername": "CyberKnight",
      "avatarId": "avatar-preset-4",
      "avatarConfig": { "bg": "#4338ca", "hat": "none" },
      "bio": "Coding late at the library",
      "createdAt": "2026-09-20T12:05:00Z",
      "updatedAt": "2026-09-20T12:05:00Z"
    },
    "error": null
  }
  ```

### `upsertProfile(params)`
- **Layer**: Supabase PostgREST `profiles`
- **Input**:
  ```json
  {
    "anonymousUsername": "CyberKnight",
    "avatarId": "avatar-preset-4",
    "avatarConfig": { "bg": "#4338ca" },
    "bio": "Coding late at the library"
  }
  ```
- **Success Response**: Returns updated `Profile` object.
- **Error Codes**: `USERNAME_TAKEN`, `INVALID_USERNAME_LENGTH`, `UNAUTHORIZED`

---

## 5. Matchmaking APIs

### `joinMatchmaking()`
- **Layer**: Supabase RPC (`rpc/join_matchmaking_queue`)
- **Input**: None (authenticated caller)
- **Execution Rules**:
  - Validates user is verified and onboarded.
  - Inserts entry into `matchmaking_queue`.
  - Atomically searches for another waiting entry (`status = 'searching'`).
  - If partner found, creates `chat_rooms` row and links both entries.
- **Success Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "queue-entry-uuid",
      "userId": "c7a840e6-5bc7-4638-b78f-6b22b7fa1204",
      "status": "searching",
      "joinedAt": "2026-09-20T12:10:00Z",
      "matchedRoomId": null
    },
    "error": null
  }
  ```
- **Error Codes**: `NOT_VERIFIED`, `ALREADY_IN_QUEUE`, `ACTIVE_ROOM_EXISTS`

### `leaveMatchmaking()`
- **Layer**: Supabase RPC or Direct update on user's own queue record
- **Success Response**: `{ "success": true, "data": null, "error": null }`

---

## 6. Real-Time Chat APIs

### `sendMessage(roomId: string, content: string)`
- **Layer**: Supabase PostgREST `INSERT INTO chat_messages`
- **Input**:
  ```json
  {
    "roomId": "room-uuid",
    "content": "Hey, which year are you?"
  }
  ```
- **Validation**:
  - Caller must be either `participant1_id` or `participant2_id` of the active room.
  - Message content trimmed, non-empty, max 1000 characters.
  - Room status must be `'active'`.
- **Success Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "msg-uuid",
      "roomId": "room-uuid",
      "senderId": "c7a840e6-5bc7-4638-b78f-6b22b7fa1204",
      "content": "Hey, which year are you?",
      "createdAt": "2026-09-20T12:12:00Z"
    },
    "error": null
  }
  ```
- **Error Codes**: `ROOM_NOT_ACTIVE`, `UNAUTHORIZED_PARTICIPANT`, `MESSAGE_EMPTY`

### `skipChat(roomId: string)`
- **Layer**: Supabase RPC (`rpc/skip_chat_room`)
- **Input**: `{ "roomId": "room-uuid" }`
- **Behavior**:
  - Sets room status to `'skipped'`.
  - Dispatches system event to peer.
  - Automatically re-queues caller in matchmaking pool.
- **Success Response**: `{ "success": true, "data": null, "error": null }`

### `leaveChat(roomId: string)`
- **Layer**: Supabase RPC (`rpc/leave_chat_room`)
- **Input**: `{ "roomId": "room-uuid" }`
- **Behavior**:
  - Sets room status to `'ended'`.
  - Closes channel for both peers.
  - Caller exits to dashboard.
- **Success Response**: `{ "success": true, "data": null, "error": null }`

---

## 7. Realtime Channel Subscription Matrix

| Channel Name | Filter / Topic | Events | Payload |
|---|---|---|---|
| `realtime:queue:<userId>` | `userId=eq.<uid>` | `UPDATE` | `{ status: "matched", matchedRoomId: "uuid" }` |
| `realtime:room:<roomId>` | `roomId=eq.<roomId>` | `INSERT` (`chat_messages`) | New `ChatMessage` row |
| `realtime:room:<roomId>` | `roomId=eq.<roomId>` | `UPDATE` (`chat_rooms`) | Room status change (`skipped`, `ended`) |
| `realtime:presence:<roomId>` | Room Presence | `presence_state`, `sync` | Peer online / typing status |
