import { create } from "zustand";

export type WalletLockState = "locked" | "unlocked";
export type ThemeMode = "light" | "dark";

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

  setHasWallet: (hasWallet: boolean) => void;
  lock: () => void;
  unlock: () => void;
  setHelperServiceUrl: (url: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  hasWallet: false,
  lockState: "locked",
  helperServiceUrl: "http://localhost:8080",
  theme: loadTheme(),

  setHasWallet: (hasWallet) => set({ hasWallet }),
  lock: () => set({ lockState: "locked" }),
  unlock: () => set({ lockState: "unlocked" }),
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
}));
