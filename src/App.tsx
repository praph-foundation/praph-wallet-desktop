import { useEffect } from "react";
import { api } from "./lib/tauri";
import AppRoutes from "./routes";
import { useWalletStore } from "./state/walletStore";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const setHasWallet = useWalletStore((s) => s.setHasWallet);
  const lock = useWalletStore((s) => s.lock);
  const unlock = useWalletStore((s) => s.unlock);
  const theme = useWalletStore((s) => s.theme);

  useEffect(() => {
    let mounted = true;
    api
      .walletStatus()
      .then((s) => {
        if (!mounted) return;
        setHasWallet(s.hasWallet);
        if (s.isUnlocked) unlock();
        else lock();
      })
      .catch(() => {
        // Ignore startup errors; onboarding will still work.
      });
    return () => {
      mounted = false;
    };
  }, [lock, setHasWallet, unlock]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <>
      <AppRoutes />
      <Toaster />
    </>
  );
}
