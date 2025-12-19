import { useEffect } from "react";
import { api } from "./lib/tauri";
import AppRoutes from "./routes";
import { useWalletStore } from "./state/walletStore";

export default function App() {
  const setHasWallet = useWalletStore((s) => s.setHasWallet);
  const lock = useWalletStore((s) => s.lock);
  const unlock = useWalletStore((s) => s.unlock);

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

  return <AppRoutes />;
}
