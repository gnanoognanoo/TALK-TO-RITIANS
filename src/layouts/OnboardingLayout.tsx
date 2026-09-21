import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Shield, CheckCircle2 } from 'lucide-react';
import { PageContainer } from '../components';

export interface OnboardingLayoutProps {
  children?: React.ReactNode;
}

const steps = [
  { id: 'username', name: 'Anonymous Handle', path: '/username', stepNum: 1 },
  { id: 'avatar', name: 'Avatar Builder', path: '/avatar', stepNum: 2 },
  { id: 'profile', name: 'Campus Profile', path: '/profile/setup', stepNum: 3 },
];

export const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({ children }) => {
  const location = useLocation();

  const getCurrentStepIndex = () => {
    const idx = steps.findIndex((s) => location.pathname === s.path);
    return idx >= 0 ? idx : 0;
  };

  const currentStepIdx = getCurrentStepIndex();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative selection:bg-brand-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm font-bold text-white">
          <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-brand-600/30">
            RIT
          </div>
          <span>Talk to RITians</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="h-4 w-4 text-emerald-400" />
          <span className="hidden sm:inline">Persona Onboarding:</span>
          <span className="font-semibold text-white">
            Step {currentStepIdx + 1} of {steps.length}
          </span>
        </div>
      </header>

      {/* Stepper Progress Indicator */}
      <div className="border-b border-slate-800/40 bg-slate-900/30 py-4 px-4 sm:px-8">
        <div className="max-w-2xl mx-auto">
          <nav aria-label="Onboarding Progress">
            <ol className="flex items-center justify-between gap-2">
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <li key={step.id} className="flex-1 flex items-center gap-2">
                    <Link
                      to={step.path}
                      className={`
                        flex items-center gap-2.5 text-xs font-semibold transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg p-1
                        ${
                          isCurrent
                            ? 'text-brand-400'
                            : isCompleted
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-slate-500 hover:text-slate-400'
                        }
                      `.trim()}
                    >
                      <span
                        className={`
                          h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all
                          ${
                            isCurrent
                              ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                              : isCompleted
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                          }
                        `.trim()}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          step.stepNum
                        )}
                      </span>
                      <span className="hidden md:inline">{step.name}</span>
                    </Link>

                    {idx < steps.length - 1 && (
                      <div
                        className={`
                          flex-1 h-0.5 mx-1 sm:mx-2 rounded-full transition-colors
                          ${idx < currentStepIdx ? 'bg-emerald-500/40' : 'bg-slate-800'}
                        `}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col" id="onboarding-content">
        <PageContainer maxWidth="md" className="flex-1 flex flex-col py-8">
          {children || <Outlet />}
        </PageContainer>
      </main>

      {/* Onboarding Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        Your real student details stay permanently isolated. Only your anonymous handle & avatar are visible.
      </footer>
    </div>
  );
};

export default OnboardingLayout;
