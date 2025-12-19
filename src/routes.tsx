import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import BridgePage from "./pages/Bridge";
import DashboardPage from "./pages/Dashboard";
import OnboardingPage from "./pages/Onboarding";
import ReceivePage from "./pages/Receive";
import SendPage from "./pages/Send";
import SettingsPage from "./pages/Settings";
import { useWalletStore } from "./state/walletStore";

function WalletGate({ children }: { children: ReactNode }) {
  const hasWallet = useWalletStore((s) => s.hasWallet);
  if (!hasWallet) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route
        path="/"
        element={
          <WalletGate>
            <AppLayout />
          </WalletGate>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="send" element={<SendPage />} />
        <Route path="bridge" element={<BridgePage />} />
        <Route path="receive" element={<ReceivePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
