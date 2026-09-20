# Database Architecture & Schema: TALK TO RITIANS

This document describes the foundational database architecture, PostgreSQL schemas, identity partitions, and Row Level Security (RLS) policies for **Talk to RITians**.

---

## 1. Architectural Principles

1. **Supabase Auth Ownership**:
   - `auth.users` manages personal email registration, passwords/magic links, and JWT issuance.
   - Application tables link to `auth.users.id` via foreign key constraints (`ON DELETE CASCADE`).

2. **Cryptographic & Architectural Segregation**:
   - Private student data (department, section, graduation year, real name, college verification) is strictly partitioned from public chat personas.
   - Strangers in chat rooms interact **only** with `anonymous_identities` and are blocked from querying `profiles` or `college_identities` at the PostgreSQL engine level.

3. **1-to-1 College ID Uniqueness**:
   - A physical college card identity hash must belong to at most **one** active account at any given time.
   - If an account unlinks an ID, `active` is set to `false` and `unlinked_at` is stamped, allowing future re-verification while maintaining an audit trail without duplicate active collisions.

4. **Zero Raw QR Image / Invented ID Storage**:
   - No raw card photographs or biometric captures are stored.
   - Only parsed attributes extracted directly from the physical barcode and a deterministic SHA-256 hash are recorded.

---

## 2. Table Specifications

### 2.1 `profiles`
**Purpose**: Stores individual student profile metadata and onboarding state.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` | Matches the authenticated user's `auth.uid()`. |
| `display_username` | `TEXT` | `NULL` | User-selected anonymous display name. |
| `avatar_config` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Visual avatar settings (character, color theme, accessories). |
| `profile_completed` | `BOOLEAN` | `NOT NULL DEFAULT false` | Set to `true` once onboarding steps are finalized. |
| `college_identity_linked` | `BOOLEAN` | `NOT NULL DEFAULT false` | Set to `true` when a physical ID is successfully verified. |
| `department` | `TEXT` | `NULL` | Student's engineering/academic department (e.g. CSE, AIDS, ECE). |
| `section` | `TEXT` | `NULL` | Class section / division (Private). |
| `class_name` | `TEXT` | `NULL` | Class identifier (Private). |
| `batch` | `TEXT` | `NULL` | Academic batch year (Private). |
| `graduation_year` | `INTEGER` | `NULL` | Projected graduation year (Private). |
| `gender` | `TEXT` | `NULL` | Self-reported gender (Private). |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Record creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Managed automatically via `handle_updated_at` trigger. |

**RLS Enforcement**:
- **SELECT**: Restricted to `auth.uid() = id`. A student can only view their own profile. Other students receive empty sets.
- **INSERT**: Restricted to `auth.uid() = id`.
- **UPDATE**: Restricted to `auth.uid() = id`.
- **DELETE**: Restricted to `auth.uid() = id`.

---

### 2.2 `college_identities`
**Purpose**: Enforces physical student ID card verification, prevent duplicate accounts per student, and store verified campus credentials securely.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique record identifier. |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Owning student account. |
| `identity_hash` | `TEXT` | `NOT NULL` | One-way cryptographic SHA-256 hash of unique card barcode data. |
| `name_from_qr` | `TEXT` | `NULL` | Official student name decoded from QR. |
| `department_from_qr` | `TEXT` | `NULL` | Department decoded from QR. |
| `batch_from_qr` | `TEXT` | `NULL` | Academic batch decoded from QR. |
| `qr_metadata` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Additional verified payload parameters (excluding raw image). |
| `verified_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Verification timestamp. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Insertion timestamp. |
| `unlinked_at` | `TIMESTAMPTZ` | `NULL` | Set if student explicitly unlinks card. |
| `active` | `BOOLEAN` | `NOT NULL DEFAULT true` | `true` for currently linked identity; `false` once unlinked. |

**Indexes & Constraints**:
- **Active Hash Uniqueness**:
  ```sql
  CREATE UNIQUE INDEX idx_college_identities_active_hash
    ON public.college_identities (identity_hash)
    WHERE active = true;
  ```
  Prevents duplicate accounts: the same physical card cannot be actively linked by two different user accounts simultaneously.
- **Active User Uniqueness**:
  ```sql
  CREATE UNIQUE INDEX idx_college_identities_active_user
    ON public.college_identities (user_id)
    WHERE active = true;
  ```
  Prevents a single user account from claiming multiple active college identities.
- **Lookup Index**: `idx_college_identities_user_id` on `(user_id)`.

**RLS Enforcement**:
- **SELECT**: Restricted to `auth.uid() = user_id`. Strangers cannot query or verify peer card data.
- **INSERT**: Restricted to `auth.uid() = user_id`.
- **UPDATE**: Restricted to `auth.uid() = user_id`.

---

### 2.3 `anonymous_identities`
**Purpose**: Public anonymous persona partition. This is the **only** identity table queried during matchmaking and 1-to-1 chat sessions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique record identifier. |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE` | Link to student account. |
| `anonymous_username` | `TEXT` | `NOT NULL` | Pseudonym visible to matched peers. |
| `avatar_config` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Visual rendering parameters (color, character, preset). |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Record creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Managed via `handle_updated_at` trigger. |

**RLS Enforcement**:
- **SELECT**: Accessible to `authenticated` users (`USING (true)`). Matched peers can inspect only the public handle and avatar.
- **ALL (INSERT/UPDATE/DELETE)**: Restricted to `auth.uid() = user_id`.

---

## 3. Sanitized Public View

### `public_anonymous_profiles`
```sql
CREATE OR REPLACE VIEW public.public_anonymous_profiles AS
SELECT
  user_id,
  anonymous_username,
  avatar_config
FROM public.anonymous_identities;
```
Enables frontend matchmaking and chat services to resolve a peer's visual identity without granting access to any private table.

---

## 4. Automation Triggers

1. **`handle_updated_at`**:
   Automatically updates `updated_at = timezone('utc'::text, now())` before any update on `profiles` or `anonymous_identities`.

2. **`handle_new_user`**:
   Automatically executes on `AFTER INSERT ON auth.users` to initialize an empty `public.profiles` row with `id = NEW.id`.

3. **`sync_anonymous_identity`**:
   Automatically synchronizes changes to `display_username` or `avatar_config` from `public.profiles` to `public.anonymous_identities`.

---

## 5. Security & Threat Mitigation Summary

| Threat | Mitigation Architecture |
|---|---|
| Stranger queries student's real email / department via PostgREST API | Blocked by `profiles_select_own` RLS policy (`auth.uid() = id`). |
| Malicious user inspects network traffic to steal peer's roll number | Blocked: roll number / card data is in `college_identities`, isolated under `auth.uid() = user_id`. |
| Single student creates multiple accounts to troll or spam | Blocked: `idx_college_identities_active_hash` UNIQUE constraint rejects duplicate active card hashes. |
| Direct client modification of peer anonymous handle | Blocked: `anonymous_identities_manage_own` allows mutations only if `auth.uid() = user_id`. |
