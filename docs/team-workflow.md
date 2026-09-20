# Team Workflow & Ownership Guide: TALK TO RITIANS

This document establishes the boundaries of code ownership, pull request conventions, and collaboration rules between **Person A (Frontend/UI)** and **Person B (Backend/Database)**.

---

## 1. Role Responsibilities & Directory Ownership

```
TALK TO RITIANS/
├── src/
│   ├── components/       --> [Person A] Reusable UI widgets & primitives
│   ├── pages/            --> [Person A] Route screens & page containers
│   ├── layouts/          --> [Person A] Application layout wrappers
│   ├── features/
│   │   ├── auth/         --> [Person A: UI Forms/State] | [Person B: Auth Client Hooks]
│   │   ├── verification/ --> [Person A: QR Scanner UI]  | [Person B: Linking Services]
│   │   ├── profile/      --> [Person A: Forms/State]    | [Person B: Profile Fetch/Save]
│   │   ├── avatar/       --> [Person A] Avatar picker, visual styling, presets
│   │   ├── matchmaking/  --> [Person A: Radar/Status UI]| [Person B: Queue Polling/Sockets]
│   │   └── chat/         --> [Person A: Message Box/UI] | [Person B: Realtime Socket Sync]
│   ├── services/         --> [Person B] Concrete Supabase API calls implementing interfaces
│   ├── hooks/            --> [Shared / Co-developed] Custom React hooks
│   ├── context/          --> [Person A / Person B] Global React context providers
│   ├── lib/              --> [Person B] Supabase client initialization & network config
│   ├── types/            --> [SHARED CONTRACT] Must be agreed upon by BOTH developers
│   └── utils/            --> [Shared] Pure utility functions & QR parser registry
├── supabase/             --> [Person B] Database migrations, RLS, functions, seed data
└── docs/                 --> [Shared] Architectural documentation and technical contracts
```

### Person A: Frontend & UI Lead
- **Primary Focus**: User experience, responsive layouts, Tailwind styling, loading and empty states, form interactions, error toasts, and visual fidelity.
- **Key Deliverables**:
  - Landing and onboarding views
  - Camera viewport and QR scanner integration
  - Avatar creator component
  - Matchmaking animation & queue status radar
  - Real-time chat UI with skip and leave controls

### Person B: Backend & Database Lead
- **Primary Focus**: PostgreSQL schemas, RLS privacy policies, RPC functions, Realtime channel configuration, and Supabase integration.
- **Key Deliverables**:
  - Supabase Auth setup & session persistence
  - `college_identities` table & 1-to-1 unique hashing RPC
  - Matchmaking queue paired via atomic Postgres functions
  - Chat room lifecycle and message delivery
  - Disconnect detection and presence cleanup

---

## 2. Shared Contract Rule (CRITICAL)

The interfaces in `src/types/` and the specifications in `docs/api-contract.md` form the **binding contract** between Person A and Person B.

> [!IMPORTANT]
> **Neither developer may alter `src/types/` or `docs/api-contract.md` unilaterally.**
> Any change to an interface must be discussed, agreed upon, and approved by both team members before merging.

---

## 3. Git Branching & Collaboration Workflow

### Stable Main Branch
- `main` is production/stable. **Never push directly to `main`.**

### Canonical Feature Branches
Work is divided into focused feature branches:
- `feature/project-setup` (Initial architecture, baseline configs)
- `feature/auth` (Personal email authentication & session handling)
- `feature/college-verification` (QR scanning & identity linking)
- `feature/profile` (Anonymous username selection & onboarding)
- `feature/avatar` (Avatar picker & styling)
- `feature/matchmaking` (Random student pairing queue)
- `feature/chat` (Anonymous 1-to-1 realtime messaging)
- `feature/skip-leave` (Chat skip, leave, and session termination)
- `feature/security` (RLS policy audits & privacy tests)
- `feature/testing` (Integration and end-to-end testing)

### Daily Development Lifecycle
1. **Sync main**:
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Create/Switch to feature branch**:
   ```bash
   git checkout -b feature/NAME
   ```
3. **Implement code within owned directories**:
   Run build locally to ensure zero TypeScript or bundling errors:
   ```bash
   npm run build
   ```
4. **Commit with descriptive messages**:
   ```bash
   git add .
   git commit -m "feat(chat): implement real-time message bubble layout"
   ```
5. **Push to GitHub**:
   ```bash
   git push origin feature/NAME
   ```
6. **Open a Pull Request**:
   - Assign the other developer as a Reviewer.
   - Address comments and verify that `npm run build` succeeds.
   - Merge via Squash & Merge or Rebase once approved.
