import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import { Button } from "./ui/button";
import { useWalletStore } from "../state/walletStore";
import LayerTabs from "./LayerTabs";
import { LayoutDashboard, Send, ArrowLeftRight, Download, Settings, Plus, ChevronDown, Check, Pencil, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { toast } from "sonner";
import type { AccountInfo } from "../lib/tauri";

interface AccountItemProps {
  account: AccountInfo;
  isActive: boolean;
  accountBusy: boolean;
  setAccountBusy: (busy: boolean) => void;
  setAccountsState: (accounts: AccountInfo[], activeIndex: number) => void;
  setAccountPickerOpen: (open: boolean) => void;
}

function AccountItem({
  account,
  isActive,
  accountBusy,
  setAccountBusy,
  setAccountsState,
  setAccountPickerOpen,
}: AccountItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(account.name);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex flex-1 items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
        onClick={async () => {
          if (accountBusy || isEditing) return;
          try {
            setAccountBusy(true);
            const s = await api.switchAccount(account.index);
            setAccountsState(s.accounts, s.activeAccountIndex);
            toast.success("Switched account");
            setAccountPickerOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to switch account");
          } finally {
            setAccountBusy(false);
          }
        }}
      >
        <div className="text-left flex-1">
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.currentTarget.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  try {
                    const s = await api.renameAccount(account.index, editName);
                    setAccountsState(s.accounts, s.activeAccountIndex);
                    toast.success("Account renamed");
                    setIsEditing(false);
                  } catch (e) {
                    toast.error("Failed to rename account");
                  }
                } else if (e.key === "Escape") {
                  setEditName(account.name);
                  setIsEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 text-sm"
              autoFocus
            />
          ) : (
            <div className="font-medium">{account.name}</div>
          )}
          <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
            {account.address}
          </div>
        </div>
        {isActive ? <Check className="h-4 w-4" /> : null}
      </button>
      <Button
        size="sm"
        variant="ghost"
        className="h-9 w-9 p-0"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(!isEditing);
          if (!isEditing) {
            setEditName(account.name);
          }
        }}
        title="Rename account"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const lockState = useWalletStore((s) => s.lockState);
  const lock = useWalletStore((s) => s.lock);
  const accounts = useWalletStore((s) => s.accounts);
  const activeAccountIndex = useWalletStore((s) => s.activeAccountIndex);
  const setAccountsState = useWalletStore((s) => s.setAccountsState);
  const activeLayer = useWalletStore((s) => s.activeLayer);

  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [l2Address, setL2Address] = useState<string | null>(null);

  useEffect(() => {
    if (lockState !== "unlocked") return;
    api
      .getAccountsState()
      .then((s) => setAccountsState(s.accounts, s.activeAccountIndex))
      .catch(() => { });
  }, [lockState, setAccountsState]);

  // Fetch L2 address when on L2 layer
  useEffect(() => {
    if (activeLayer === "l2") {
      api.getL2Balance().then((b) => setL2Address(b.address)).catch(() => { });
    }
  }, [activeLayer, activeAccountIndex]);

  // Layer-specific navigation items
  const l1NavItems = [
    { to: "/l1", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/l1/send", icon: Send, label: "Send" },
    { to: "/l1/receive", icon: Download, label: "Receive" },
    { to: "/l1/bridge", icon: ArrowLeftRight, label: "Bridge to L2" },
  ];

  const l2NavItems = [
    { to: "/l2", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/l2/send", icon: Send, label: "Send" },
    { to: "/l2/receive", icon: Download, label: "Receive" },
    { to: "/l2/bridge", icon: ArrowLeftRight, label: "Bridge to L1" },
  ];

  const navItems = activeLayer === "l1" ? l1NavItems : l2NavItems;
  const layerColor = activeLayer === "l1" ? "emerald" : "purple";

  return (
    <div className="h-full bg-background text-foreground">
      <div className="flex h-full">
        <aside className="w-72 border-r border-border p-4 flex flex-col">
          <div className="mb-4">
            <div className="text-base font-semibold">Praph Wallet</div>
            <div className="text-xs text-muted-foreground">Official Desktop Wallet</div>
          </div>

          {/* Layer Tabs */}
          <LayerTabs className="mb-4" />

          {/* Account Picker */}
          <div className="mb-4 rounded-md border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">
              {activeLayer === "l1" ? "L1 Account" : "L2 Account"}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Dialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 flex-1 items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm hover:bg-muted/40"
                  >
                    <span className="truncate">
                      {accounts.find((a) => a.index === activeAccountIndex)?.name ?? "Account 1"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Switch account</DialogTitle>
                    <DialogDescription>
                      Select the active {activeLayer === "l1" ? "L1" : "L2"} account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-1">
                    {(accounts.length ? accounts : [{ index: 0, name: "Account 1", address: "", isActive: true }]).map(
                      (a) => (
                        <AccountItem
                          key={a.index}
                          account={a}
                          isActive={a.index === activeAccountIndex}
                          accountBusy={accountBusy}
                          setAccountBusy={setAccountBusy}
                          setAccountsState={setAccountsState}
                          setAccountPickerOpen={setAccountPickerOpen}
                        />
                      ),
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" title="Create new account">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create new account</DialogTitle>
                    <DialogDescription>
                      A new {activeLayer === "l1" ? "L1" : "L2"} address will be derived from your seed.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Input
                        placeholder="Account name"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.currentTarget.value)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={async () => {
                          try {
                            setAccountBusy(true);
                            const s = newAccountName
                              ? await api.createAccountNamed(newAccountName)
                              : await api.createAccount();
                            setAccountsState(s.accounts, s.activeAccountIndex);
                            toast.success("Account created");
                            setCreateOpen(false);
                            setNewAccountName("");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          } finally {
                            setAccountBusy(false);
                          }
                        }}
                        disabled={accountBusy}
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {/* Address display - shows L1 or L2 address based on layer */}
            <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
              {activeLayer === "l1"
                ? (accounts.find((a) => a.index === activeAccountIndex)?.address ?? "")
                : (l2Address ?? "Loading...")}
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/l1" || item.to === "/l2"}
                className={({ isActive }) =>
                  [
                    "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? `bg-${layerColor}-500/10 text-foreground`
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={
                        `absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-${layerColor}-500 ` +
                        (isActive ? "opacity-100" : "opacity-0")
                      }
                    />
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}

            {/* Settings (shared) */}
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

          {/* Footer */}
          <div className="pt-4 border-t border-border mt-auto space-y-2">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => {
              lock();
              navigate("/unlock");
            }}>
              <Settings className="h-4 w-4 mr-2" />
              Lock Wallet
            </Button>
            <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => {
              // Clear wallet state to force onboarding
              const setHasWallet = useWalletStore.getState().setHasWallet;
              setHasWallet(false);
              lock();
              navigate("/onboarding");
            }}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
