import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import OnboardingPage from "./pages/Onboarding";
import UnlockPage from "./pages/Unlock";
import SettingsPage from "./pages/Settings";
import { useWalletStore } from "./state/walletStore";

// L1 Pages
import L1DashboardPage from "./pages/l1/L1Dashboard";
import SendPage from "./pages/Send";
import ReceivePage from "./pages/Receive";
import L1BridgePage from "./pages/l1/L1Bridge";

// L2 Pages
import L2DashboardPage from "./pages/l2/L2Dashboard";
import L2SendPage from "./pages/L2Send";
import L2ReceivePage from "./pages/l2/L2Receive";
import L2BridgePage from "./pages/l2/L2Bridge";

function WalletGate({ children }: { children: ReactNode }) {
  const hasWallet = useWalletStore((s) => s.hasWallet);
  if (!hasWallet) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function UnlockedGate({ children }: { children: ReactNode }) {
  const lockState = useWalletStore((s) => s.lockState);
  if (lockState === "locked") return <Navigate to="/unlock" replace />;
  return <>{children}</>;
}

function LayerRedirect() {
  const activeLayer = useWalletStore((s) => s.activeLayer);
  return <Navigate to={activeLayer === "l1" ? "/l1" : "/l2"} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route
        path="/unlock"
        element={
          <WalletGate>
            <UnlockPage />
          </WalletGate>
        }
      />

      <Route
        path="/"
        element={
          <WalletGate>
            <UnlockedGate>
              <AppLayout />
            </UnlockedGate>
          </WalletGate>
        }
      >
        {/* Default route redirects to active layer */}
        <Route index element={<LayerRedirect />} />

        {/* L1 Routes */}
        <Route path="l1" element={<L1DashboardPage />} />
        <Route path="l1/send" element={<SendPage />} />
        <Route path="l1/receive" element={<ReceivePage />} />
        <Route path="l1/bridge" element={<L1BridgePage />} />

        {/* L2 Routes */}
        <Route path="l2" element={<L2DashboardPage />} />
        <Route path="l2/send" element={<L2SendPage />} />
        <Route path="l2/receive" element={<L2ReceivePage />} />
        <Route path="l2/bridge" element={<L2BridgePage />} />

        {/* Shared Routes */}
        <Route path="settings" element={<SettingsPage />} />

        {/* Legacy redirects */}
        <Route path="send" element={<Navigate to="/l1/send" replace />} />
        <Route path="receive" element={<Navigate to="/l1/receive" replace />} />
        <Route path="l2-send" element={<Navigate to="/l2/send" replace />} />
        <Route path="bridge" element={<Navigate to="/l1/bridge" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
