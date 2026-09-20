import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Layouts
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
    <BrowserRouter>
      <Routes>
        {/* Public & Main App Routes within AppLayout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/matching" element={<MatchingPage />} />
          <Route path="/chat/:roomId" element={<ChatPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Authentication & Verification Routes within AuthLayout */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyCollegePage />} />
        </Route>

        {/* Onboarding Persona Routes within OnboardingLayout */}
        <Route element={<OnboardingLayout />}>
          <Route path="/profile/setup" element={<ProfileSetupPage />} />
          <Route path="/username" element={<UsernameSelectionPage />} />
          <Route path="/avatar" element={<AvatarBuilderPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
