import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Context & Providers
import { AuthProvider } from './context';

// Guards & Layouts
import { ProtectedRoute } from './components';
import { AppLayout, AuthLayout, OnboardingLayout } from './layouts';

// Pages
import {
  LandingPage,
  LoginPage,
  VerifyCollegePage,
  ProfileSetupPage,
  UsernameSelectionPage,
  AvatarBuilderPage,
  HomePage,
  MatchingPage,
  ChatPage,
  NotFoundPage,
} from './pages';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Landing & 404 Route within AppLayout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Public Personal Login Route within AuthLayout */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Protected Routes — Require Authenticated Student Session */}
          <Route element={<ProtectedRoute />}>
            {/* Campus Dashboard & Realtime Rooms */}
            <Route element={<AppLayout />}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/matching" element={<MatchingPage />} />
              <Route path="/chat/:roomId" element={<ChatPage />} />
            </Route>

            {/* Campus ID Verification Gate */}
            <Route element={<AuthLayout />}>
              <Route path="/verify" element={<VerifyCollegePage />} />
            </Route>

            {/* Persona Onboarding Flow */}
            <Route element={<OnboardingLayout />}>
              <Route path="/profile/setup" element={<ProfileSetupPage />} />
              <Route path="/username" element={<UsernameSelectionPage />} />
              <Route path="/avatar" element={<AvatarBuilderPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
