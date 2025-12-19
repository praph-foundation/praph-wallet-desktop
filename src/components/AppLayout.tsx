import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/tauri";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useWalletStore } from "../state/walletStore";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "block rounded-md px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const lockState = useWalletStore((s) => s.lockState);
  const lock = useWalletStore((s) => s.lock);

  function pageTitle(): string {
    const p = location.pathname;
    if (p === "/") return "Dashboard";
    if (p.startsWith("/send")) return "Send";
    if (p.startsWith("/bridge")) return "Bridge";
    if (p.startsWith("/receive")) return "Receive";
    if (p.startsWith("/settings")) return "Settings";
    return "Praph Wallet";
  }

  return (
    <div className="h-full bg-background text-foreground">
      <div className="flex h-full">
        <aside className="w-60 border-r border-border p-4">
          <div className="mb-4">
            <div className="text-base font-semibold">Praph Wallet</div>
            <div className="text-xs text-muted-foreground">Official Desktop Wallet</div>
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

        <main className="flex-1 overflow-auto bg-background">
          <div className="mx-auto w-full max-w-5xl p-6">
            <header className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold">{pageTitle()}</div>
                <div className="mt-1 text-xs text-muted-foreground">Sync: idle</div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={lockState === "locked" ? "secondary" : "default"}>
                  {lockState}
                </Badge>
                <Button
                  size="sm"
                  variant={lockState === "locked" ? "default" : "outline"}
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
            </header>

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
