import { create } from "zustand";

export type WalletLockState = "locked" | "unlocked";

interface WalletState {
  hasWallet: boolean;
  lockState: WalletLockState;
  helperServiceUrl: string;

  setHasWallet: (hasWallet: boolean) => void;
  lock: () => void;
  unlock: () => void;
  setHelperServiceUrl: (url: string) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  hasWallet: false,
  lockState: "locked",
  helperServiceUrl: "http://localhost:8080",

  setHasWallet: (hasWallet) => set({ hasWallet }),
  lock: () => set({ lockState: "locked" }),
  unlock: () => set({ lockState: "unlocked" }),
  setHelperServiceUrl: (helperServiceUrl) => set({ helperServiceUrl }),
}));
