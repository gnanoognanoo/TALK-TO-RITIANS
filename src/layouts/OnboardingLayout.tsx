import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Shield, CheckCircle2 } from 'lucide-react';
import { PageContainer } from '../components';
import { Logo } from '../components/Logo';

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
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col relative selection:bg-brand-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-gray-200 bg-white/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Logo size="sm" />
        </Link>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield className="h-4 w-4 text-brand-600" />
          <span className="hidden sm:inline">Onboarding:</span>
          <span className="font-semibold text-gray-900">
            Step {currentStepIdx + 1} of {steps.length}
          </span>
        </div>
      </header>

      {/* Stepper Progress Indicator */}
      <div className="border-b border-gray-200 bg-white py-4 px-4 sm:px-8 shadow-subtle">
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
                            ? 'text-brand-600 font-bold'
                            : isCompleted
                            ? 'text-emerald-700 hover:text-emerald-800'
                            : 'text-gray-400 hover:text-gray-600'
                        }
                      `.trim()}
                    >
                      <span
                        className={`
                          h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all
                          ${
                            isCurrent
                              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-100'
                              : isCompleted
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : 'bg-gray-100 text-gray-400 border border-gray-200'
                          }
                        `.trim()}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
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
                          ${idx < currentStepIdx ? 'bg-emerald-400' : 'bg-gray-200'}
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
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
        Your real student details stay permanently isolated. Only your anonymous handle & avatar are visible.
      </footer>
    </div>
  );
};

export default OnboardingLayout;
