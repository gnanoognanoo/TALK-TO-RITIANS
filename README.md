# Talk to RITians

> **Anonymous 1-to-1 Real-Time Chat Exclusively for Verified Students of Rajalakshmi Institute of Technology (RIT).**

Talk to RITians allows RIT students to connect, converse, and collaborate with fellow campus peers anonymously. By verifying physical student ID cards via an on-device QR scanner while completely segregating real-world identities from the chat interface, students can safely interact without exposing their private personal information.

---

## 🚀 Technology Stack

### Frontend
- **Framework**: React 18 + Vite (SPA)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Icons**: Lucide React
- **QR Scanner**: `html5-qrcode` (with extensible parser abstraction)

### Backend & Infrastructure
- **Platform**: Supabase
- **Authentication**: Supabase Auth (Personal Email / OTP)
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Realtime**: Supabase Realtime (WebSockets)
- **Serverless**: Supabase Edge Functions (where server execution is required)

---

## 🎯 V1 Scope vs Future Scope

### Included in V1:
1. **Personal Email Authentication**: Sign-up / login via personal email.
2. **Unknown User State**: Strict gating before college identity is verified.
3. **Browser QR Scanner**: Extensible camera scanner for physical college ID cards.
4. **College Identity Linking**: Cryptographically hashes student card ID to link with account.
5. **1-to-1 Uniqueness Enforcement**: Prevents the same student ID card from creating multiple accounts.
6. **Anonymous Profile Onboarding**: Select pseudonym and customize anonymous avatar.
7. **Random Matchmaking**: 100% random pairing between currently active verified students.
8. **Realtime 1-to-1 Anonymous Text Chat**: Sub-second messaging over WebSockets.
9. **Skip & Leave**: Seamlessly cycle to the next student or exit chat.
10. **Strict Privacy Model**: Strangers see **only** Anonymous Username and Avatar.

### Excluded from V1 (Planned for Later Releases):
- Subscriptions and payment gateways
- Department, year, or gender preference filters
- Video or voice chat
- Visible Block / Report buttons (V1 uses administrative moderation holds)

---

## 📂 Project Structure

```
TALK TO RITIANS/
├── docs/                 # System architecture, API contracts, privacy model & workflow
│   ├── api-contract.md
│   ├── architecture.md
│   ├── privacy-model.md
│   └── team-workflow.md
├── src/
│   ├── components/       # Reusable presentation UI elements (Person A)
│   ├── context/          # React Context providers (Auth, Chat)
│   ├── features/         # Modular feature domains
│   │   ├── auth/         # Email authentication flow
│   │   ├── avatar/       # Avatar customizer & presets
│   │   ├── chat/         # Realtime chat UI & controls
│   │   ├── matchmaking/  # Radar search & queue status
│   │   ├── profile/      # Anonymous username & onboarding
│   │   └── verification/ # QR scanner & card parsing
│   ├── hooks/            # Custom React hooks (useAuth, useChat, etc.)
│   ├── layouts/          # Layout shells (AppLayout, ChatLayout)
│   ├── lib/              # Client instances (Supabase)
│   ├── pages/            # Top-level route pages (Person A)
│   ├── services/         # Typed API contracts & Supabase queries (Person B)
│   ├── types/            # Shared TypeScript contracts (agreed by both developers)
│   └── utils/            # Utilities & QR parser registry
├── supabase/             # Backend database definitions (Person B)
│   ├── functions/        # Edge Functions
│   ├── migrations/       # Versioned PostgreSQL migrations & RLS policies
│   └── seed/             # Development mock seed data
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
└── vite.config.ts        # Vite configuration with @/ alias
```

---

## 🛠️ Setup & Development Commands

### Prerequisites
- Node.js (v18 or higher recommended, verified on v22+)
- npm (v9 or higher)

### 1. Clone & Install
```bash
git clone https://github.com/gnanoognanoo/TALK-TO-RITIANS.git
cd "TALK TO RITIANS"
npm install
```

### 2. Configure Environment Variables
Copy the environment template and provide your Supabase credentials:
```bash
cp .env.example .env.local
```
Update `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Available Scripts
| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite local development server on `http://localhost:5173` |
| `npm run build` | Type-checks via `tsc` and creates production bundle in `/dist` |
| `npm run lint` | Runs TypeScript compiler checks without emitting code |
| `npm run preview` | Previews the production build locally |

---

## 👥 Team Roles & Git Workflow

### Team Division
- **Person A (Frontend/UI)**: Owns `src/components`, `src/pages`, `src/layouts`, and feature UI implementations.
- **Person B (Backend/Database)**: Owns `supabase/`, SQL migrations, RLS policies, and `src/services/` backend calls.
- **Shared Agreement**: `src/types/` and `docs/api-contract.md` require joint approval.

### Branch Strategy
Main branch (`main`) is always deployable. All feature work is conducted in dedicated branches:
```bash
git checkout main
git pull origin main
git checkout -b feature/NAME
```
Feature branches:
- `feature/project-setup`
- `feature/auth`
- `feature/college-verification`
- `feature/profile`
- `feature/avatar`
- `feature/matchmaking`
- `feature/chat`
- `feature/skip-leave`
- `feature/security`
- `feature/testing`

Always test builds locally (`npm run build`) before pushing and submitting a pull request.