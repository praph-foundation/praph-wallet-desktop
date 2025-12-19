import { create } from "zustand";

export type WalletLockState = "locked" | "unlocked";
export type ThemeMode = "light" | "dark";
export type SyncStatus = "idle" | "syncing" | "error";
export interface AccountInfo {
  index: number;
  name: string;
  address: string;
  isActive: boolean;
}

const THEME_STORAGE_KEY = "praph_wallet_theme";

function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === "dark" ? "dark" : "light";
}

function persistTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

interface WalletState {
  hasWallet: boolean;
  lockState: WalletLockState;
  helperServiceUrl: string;
  theme: ThemeMode;
  syncStatus: SyncStatus;
  syncMessage: string | null;

  accounts: AccountInfo[];
  activeAccountIndex: number;

  setHasWallet: (hasWallet: boolean) => void;
  lock: () => void;
  unlock: () => void;
  setAccountsState: (accounts: AccountInfo[], activeAccountIndex: number) => void;
  setHelperServiceUrl: (url: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSyncStatus: (status: SyncStatus, message?: string | null) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  hasWallet: false,
  lockState: "locked",
  helperServiceUrl: "http://localhost:8080",
  theme: loadTheme(),
  syncStatus: "idle",
  syncMessage: null,

  accounts: [],
  activeAccountIndex: 0,

  setHasWallet: (hasWallet) => set({ hasWallet }),
  lock: () => set({ lockState: "locked" }),
  unlock: () => set({ lockState: "unlocked" }),
  setAccountsState: (accounts, activeAccountIndex) => set({ accounts, activeAccountIndex }),
  setHelperServiceUrl: (helperServiceUrl) => set({ helperServiceUrl }),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const theme: ThemeMode = s.theme === "dark" ? "light" : "dark";
      persistTheme(theme);
      return { theme };
    }),

  setSyncStatus: (syncStatus, message = null) => set({ syncStatus, syncMessage: message }),
}));
