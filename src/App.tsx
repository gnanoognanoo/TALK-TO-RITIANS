import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ShieldCheck, MessageSquare, QrCode, Layers, GitBranch } from 'lucide-react';

const ArchitectureOverviewPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-500/20">
            RIT
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Talk to RITians</h1>
            <p className="text-xs text-slate-400">Anonymous 1-to-1 Campus Chat</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            Phase 0: Architecture Ready
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-10">
        {/* Hero Section */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
            <Layers className="h-3.5 w-3.5" />
            Project Baseline & Technical Contracts Initialized
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Talk to RITians
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Anonymous 1-to-1 text platform tailored for verified students of Rajalakshmi Institute of Technology.
            Physical student ID cards are cryptographically verified while keeping chat identities completely anonymous.
          </p>
        </section>

        {/* Feature & Privacy Guarantees Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <QrCode className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slate-200">College ID QR Verification</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Browser camera scans student card. A one-way hash enforces 1-to-1 uniqueness so no ID can create multiple accounts.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slate-200">Zero Identity Leakage</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real name, email, register number, department, and gender are segregated in private tables via Row Level Security (RLS).
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slate-200">100% Anonymous Realtime Chat</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strangers see only your Anonymous Username and Avatar. Instant messaging over Supabase WebSockets with Skip and Leave.
            </p>
          </div>
        </section>

        {/* Technical Contracts & Team Division */}
        <section className="p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/40 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-indigo-400" />
                Team Division & Ownership Matrix
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Formal technical contracts established between Person A and Person B.
              </p>
            </div>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-950/60 px-3 py-1.5 rounded-lg border border-indigo-800/40">
              Branch: feature/project-setup
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Person A</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">Frontend / UI</span>
              </div>
              <p className="text-xs text-slate-300 font-medium">Owns UI & Component Domains</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li><code className="text-slate-300">src/components/</code> & <code className="text-slate-300">src/pages/</code></li>
                <li>QR Scanner camera viewport</li>
                <li>Avatar creator & preset picker</li>
                <li>Matchmaking radar & chat view</li>
              </ul>
            </div>

            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Person B</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">Backend / DB</span>
              </div>
              <p className="text-xs text-slate-300 font-medium">Owns Database & Services</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li><code className="text-slate-300">supabase/migrations/</code> & RLS</li>
                <li>College identity hashing & 1-to-1 RPC</li>
                <li>Atomic matchmaking queue procedure</li>
                <li>Realtime WebSocket channels</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Technical Documentation Navigation */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Architecture & Contract Documents
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
              <h4 className="text-sm font-medium text-slate-200">docs/architecture.md</h4>
              <p className="text-xs text-slate-400 mt-1">Multi-tier flow, layer responsibilities & Realtime engine</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
              <h4 className="text-sm font-medium text-slate-200">docs/api-contract.md</h4>
              <p className="text-xs text-slate-400 mt-1">Typed service contracts, request/response models & error codes</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition">
              <h4 className="text-sm font-medium text-slate-200">docs/privacy-model.md</h4>
              <p className="text-xs text-slate-400 mt-1">Zero-leakage rules, RLS policies & identity segregation</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
        Talk to RITians &bull; Phase 0 Architecture & Setup &bull; Rajalakshmi Institute of Technology
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ArchitectureOverviewPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
