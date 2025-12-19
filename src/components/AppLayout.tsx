import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/tauri";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useWalletStore } from "../state/walletStore";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "block rounded px-3 py-2 text-sm",
          isActive ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const lockState = useWalletStore((s) => s.lockState);
  const lock = useWalletStore((s) => s.lock);

  return (
    <div className="h-full bg-white text-zinc-900">
      <div className="flex h-full">
        <aside className="w-60 border-r border-zinc-200 p-4">
          <div className="mb-4">
            <div className="text-base font-semibold">Praph Wallet</div>
            <div className="text-xs text-zinc-500">Official Desktop Wallet</div>
          </div>

          <nav className="space-y-1">
            <NavItem to="/" label="Dashboard" />
            <NavItem to="/send" label="Send" />
            <NavItem to="/bridge" label="Bridge" />
            <NavItem to="/receive" label="Receive" />
            <NavItem to="/settings" label="Settings" />
          </nav>

          <Card className="mt-6">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Wallet</div>
              <div className="mt-1 text-sm font-medium">{lockState}</div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (lockState === "locked") {
                      navigate("/unlock");
                      return;
                    }
                    try {
                      await api.walletLock();
                    } finally {
                      lock();
                    }
                  }}
                >
                  {lockState === "locked" ? "Unlock" : "Lock"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-5xl p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
