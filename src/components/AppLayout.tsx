import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { api } from "../lib/tauri";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useWalletStore } from "../state/walletStore";
import { LayoutDashboard, Send, ArrowLeftRight, Download, Settings, Plus } from "lucide-react";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const lockState = useWalletStore((s) => s.lockState);
  const lock = useWalletStore((s) => s.lock);
  const syncStatus = useWalletStore((s) => s.syncStatus);
  const syncMessage = useWalletStore((s) => s.syncMessage);
  const accounts = useWalletStore((s) => s.accounts);
  const activeAccountIndex = useWalletStore((s) => s.activeAccountIndex);
  const setAccountsState = useWalletStore((s) => s.setAccountsState);

  useEffect(() => {
    if (lockState !== "unlocked") return;
    api
      .getAccountsState()
      .then((s) => setAccountsState(s.accounts, s.activeAccountIndex))
      .catch(() => {
        // ignore
      });
  }, [lockState, setAccountsState]);

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
        <aside className="w-72 border-r border-border p-4">
          <div className="mb-4">
            <div className="text-base font-semibold">Praph Wallet</div>
            <div className="text-xs text-muted-foreground">Official Desktop Wallet</div>
          </div>

          <div className="mb-4 rounded-md border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">Account</div>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={activeAccountIndex}
                onChange={async (e) => {
                  const idx = Number(e.currentTarget.value);
                  const s = await api.switchAccount(idx);
                  setAccountsState(s.accounts, s.activeAccountIndex);
                }}
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {accounts.length ? (
                  accounts.map((a) => (
                    <option key={a.index} value={a.index}>
                      {`Account ${a.index + 1}`}
                    </option>
                  ))
                ) : (
                  <option value={0}>Account 1</option>
                )}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const s = await api.createAccount();
                  setAccountsState(s.accounts, s.activeAccountIndex);
                }}
                title="Create new account"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {accounts.length ? (
              <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                {accounts.find((a) => a.index === activeAccountIndex)?.address ?? ""}
              </div>
            ) : null}
          </div>

          <nav className="space-y-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary " +
                      (isActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="flex-1">Dashboard</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/send"
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary " +
                      (isActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <Send className="h-4 w-4" />
                  <span className="flex-1">Send</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/bridge"
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary " +
                      (isActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="flex-1">Bridge</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/receive"
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary " +
                      (isActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <Download className="h-4 w-4" />
                  <span className="flex-1">Receive</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary " +
                      (isActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <Settings className="h-4 w-4" />
                  <span className="flex-1">Settings</span>
                </>
              )}
            </NavLink>
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
                <div className="mt-1 text-xs text-muted-foreground">
                  Sync: {syncStatus}
                  {syncMessage ? ` · ${syncMessage}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    syncStatus === "idle"
                      ? "secondary"
                      : syncStatus === "syncing"
                        ? "default"
                        : "destructive"
                  }
                >
                  {syncStatus}
                </Badge>
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
