import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Context & Providers
import { AuthProvider, ThemeProvider } from './context';

// Guards & Layouts
import { ProtectedRoute, DeveloperRoute, CreatorSplashScreen } from './components';
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
  SettingsPage,
  DeveloperPage,
  NotFoundPage,
} from './pages';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CreatorSplashScreen />
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
              {/* Standalone Chat Experience — 100dvh viewport, fixed header and composer */}
              <Route path="/chat/:roomId" element={<ChatPage />} />

              {/* Campus Dashboard, Realtime Rooms & Settings */}
              <Route element={<AppLayout />}>
                <Route path="/home" element={<HomePage />} />
                <Route path="/matching" element={<MatchingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              {/* Campus ID Verification Gate */}
              <Route element={<AuthLayout />}>
                <Route path="/verify" element={<VerifyCollegePage />} />
              </Route>

              {/* Persona Customization Flow */}
              <Route element={<OnboardingLayout />}>
                <Route path="/profile/setup" element={<ProfileSetupPage />} />
                <Route path="/username" element={<UsernameSelectionPage />} />
                <Route path="/avatar" element={<AvatarBuilderPage />} />
              </Route>
            </Route>

            {/* Developer / Admin Console — Requires Authenticated Staff Session */}
            <Route element={<DeveloperRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/developer" element={<DeveloperPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
