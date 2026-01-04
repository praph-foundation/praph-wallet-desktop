import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import { Button } from "./ui/button";
import { useWalletStore } from "../state/walletStore";
import LayerTabs from "./LayerTabs";
import { LayoutDashboard, Send, ArrowLeftRight, Download, Settings, Plus, Check, Pencil, LogOut, Lock, ChevronDown } from "lucide-react";
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

  useEffect(() => {
    if (lockState !== "unlocked") return;
    api
      .getAccountsState()
      .then((s) => setAccountsState(s.accounts, s.activeAccountIndex))
      .catch(() => { });
  }, [lockState, setAccountsState]);


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
        <aside className="w-20 border-r border-border py-4 flex flex-col items-center transition-all duration-300">
          <div className="mb-6 flex justify-center">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl shadow-lg">
              P
            </div>
          </div>




          {/* Navigation */}
          <nav className="flex-1 w-full flex flex-col items-center gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/l1" || item.to === "/l2"}
                className={({ isActive }) =>
                  [
                    "group relative flex items-center justify-center h-12 w-12 rounded-2xl transition-all duration-300 ease-out hover:scale-150 hover:shadow-xl hover:z-50",
                    isActive
                      ? `bg-${layerColor}-500 text-white shadow-lg scale-110`
                      : `text-muted-foreground hover:bg-${layerColor}-100 dark:hover:bg-muted hover:text-foreground bg-transparent`,
                  ].join(" ")
                }
              >
                {() => (
                  <>
                    <item.icon className="h-6 w-6" />
                    {/* Tooltip Label */}
                    <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-sm font-semibold rounded-lg opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 whitespace-nowrap shadow-lg pointer-events-none z-50">
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}

            <div className="my-2 h-px w-8 bg-border" />


          </nav>

          {/* Footer */}
          <div className="mt-auto flex flex-col items-center gap-4 pb-4 w-full">
            <button
              className="group relative flex items-center justify-center h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-150 hover:shadow-xl hover:z-50 transition-all duration-300 ease-out"
              onClick={() => {
                lock();
                navigate("/unlock");
              }}
            >
              <Lock className="h-5 w-5" />
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-sm font-semibold rounded-lg opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 whitespace-nowrap shadow-lg pointer-events-none z-50">
                Lock Wallet
              </span>
            </button>
            <button
              className="group relative flex items-center justify-center h-10 w-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 hover:scale-150 hover:shadow-xl hover:z-50 transition-all duration-300 ease-out"
              onClick={() => {
                // Clear wallet state to force onboarding
                const setHasWallet = useWalletStore.getState().setHasWallet;
                setHasWallet(false);
                lock();
                navigate("/onboarding");
              }}
            >
              <LogOut className="h-5 w-5" />
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-destructive text-destructive-foreground text-sm font-semibold rounded-lg opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 whitespace-nowrap shadow-lg pointer-events-none z-50">
                Logout
              </span>
            </button>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                [
                  "group relative flex items-center justify-center h-12 w-12 rounded-2xl transition-all duration-300 ease-out hover:scale-150 hover:shadow-xl hover:z-50",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg scale-110"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground bg-transparent",
                ].join(" ")
              }
            >
              {() => (
                <>
                  <Settings className="h-6 w-6" />
                  <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-sm font-semibold rounded-lg opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 whitespace-nowrap shadow-lg pointer-events-none z-50">
                    Settings
                  </span>
                </>
              )}
            </NavLink>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-6">
          <div className="relative mb-6">
            <div className="absolute left-0 top-0 z-10 flex items-center gap-4">
              <Dialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="group relative flex h-10 items-center justify-between gap-2 rounded-xl border border-input bg-background px-4 py-2 shadow-sm transition-all duration-300 hover:bg-muted/40 hover:scale-105 active:scale-95"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                        {accounts.find((a) => a.index === activeAccountIndex)?.name?.charAt(0).toUpperCase() ?? "A"}
                      </div>
                      <span className="font-medium text-sm">
                        {accounts.find((a) => a.index === activeAccountIndex)?.name ?? "Account 1"}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-hover:rotate-180" />
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
                    {(accounts.length ? accounts : [{ index: 0, name: "Account 1", address: "", zkAddress: "", isActive: true }]).map(
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
                  <button className="group relative h-10 w-10 flex items-center justify-center rounded-xl border border-input bg-background shadow-sm hover:bg-muted/40 transition-all duration-300 hover:scale-125 hover:shadow-md" title="Create new account">
                    <Plus className="h-5 w-5" />
                    <span className="absolute top-full mt-2 px-3 py-1.5 bg-foreground text-background text-sm font-semibold rounded-lg opacity-0 -translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 whitespace-nowrap shadow-lg pointer-events-none z-50">
                      Create Account
                    </span>
                  </button>
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

            <div className="max-w-xs mx-auto">
              <LayerTabs />
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
