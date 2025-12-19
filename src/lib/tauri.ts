import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  version: string;
  identifier: string;
  os: string;
}

export interface Balance {
  total: string;
  confirmed: string;
  pending: string;
  unspent: string;
}

export type TxDirection = "incoming" | "outgoing";
export type TxStatus = "pending" | "confirmed" | "failed";

export interface TxSummary {
  id: string;
  direction: TxDirection;
  amount: string;
  fee: string;
  memo?: string;
  timestamp: number;
  status: TxStatus;
}

export interface SendParams {
  to: string;
  amount: string;
  memo?: string;
  proverTip: "low" | "medium" | "high";
}

export interface SendResult {
  txId: string;
}

export interface BridgeDepositParams {
  l2Address: string;
  amount: string;
  memo?: string;
  proverTip: "low" | "medium" | "high";
}

export interface BridgeDepositResult {
  txId: string;
}

export interface WalletStatus {
  hasWallet: boolean;
  isUnlocked: boolean;
}

export interface WalletCreateResult {
  mnemonic: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockUnlocked = true;
let mockHasWallet = true;

let mockBalance: Balance = {
  total: "42.0000 PRAF",
  confirmed: "40.0000 PRAF",
  pending: "2.0000 PRAF",
  unspent: "40.0000 PRAF",
};

let mockTxs: TxSummary[] = [
  {
    id: "tx_demo_1",
    direction: "incoming",
    amount: "5.0000 PRAF",
    fee: "0.0000 PRAF",
    memo: "Demo incoming",
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    status: "confirmed",
  },
  {
    id: "tx_demo_2",
    direction: "outgoing",
    amount: "1.5000 PRAF",
    fee: "0.0100 PRAF",
    memo: "Demo outgoing",
    timestamp: Math.floor(Date.now() / 1000) - 900,
    status: "pending",
  },
];

const tauriApi = {
  appInfo: () => invoke<AppInfo>("app_info"),

  walletStatus: () => invoke<WalletStatus>("wallet_status"),
  walletCreate: (password: string) =>
    invoke<WalletCreateResult>("wallet_create", { password }),
  walletImport: (mnemonic: string, password: string) =>
    invoke<void>("wallet_import", { mnemonic, password }),
  walletUnlock: (password: string) => invoke<void>("wallet_unlock", { password }),
  walletLock: () => invoke<void>("wallet_lock"),

  getBalance: () => invoke<Balance>("get_balance"),
  listTransactions: () => invoke<TxSummary[]>("list_transactions"),
  rescan: () => invoke<void>("rescan"),
  sendTransaction: (params: SendParams) => invoke<SendResult>("send_transaction", { params }),
  bridgeDeposit: (params: BridgeDepositParams) =>
    invoke<BridgeDepositResult>("bridge_deposit", { params }),
};

const mockApi = {
  appInfo: async (): Promise<AppInfo> => ({
    version: "0.0.0-dev",
    identifier: "mock.browser",
    os: "browser",
  }),

  walletStatus: async (): Promise<WalletStatus> => ({
    hasWallet: mockHasWallet,
    isUnlocked: mockUnlocked,
  }),

  walletCreate: async (_password: string): Promise<WalletCreateResult> => {
    mockHasWallet = true;
    mockUnlocked = true;
    await sleep(200);
    return {
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    };
  },

  walletImport: async (_mnemonic: string, _password: string): Promise<void> => {
    mockHasWallet = true;
    mockUnlocked = true;
    await sleep(200);
  },

  walletUnlock: async (_password: string): Promise<void> => {
    mockUnlocked = true;
    await sleep(150);
  },

  walletLock: async (): Promise<void> => {
    mockUnlocked = false;
    await sleep(150);
  },

  getBalance: async (): Promise<Balance> => {
    await sleep(150);
    return mockBalance;
  },

  listTransactions: async (): Promise<TxSummary[]> => {
    await sleep(150);
    return mockTxs;
  },

  rescan: async (): Promise<void> => {
    await sleep(600);
  },

  sendTransaction: async (params: SendParams): Promise<SendResult> => {
    await sleep(600);
    const txId = `tx_demo_${Math.random().toString(16).slice(2)}`;
    mockTxs = [
      {
        id: txId,
        direction: "outgoing",
        amount: `${params.amount} PRAF`,
        fee: "0.0100 PRAF",
        memo: params.memo,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
      },
      ...mockTxs,
    ];
    return { txId };
  },

  bridgeDeposit: async (params: BridgeDepositParams): Promise<BridgeDepositResult> => {
    await sleep(800);
    const txId = `bridge_demo_${Math.random().toString(16).slice(2)}`;
    mockTxs = [
      {
        id: txId,
        direction: "outgoing",
        amount: `${params.amount} PRAF`,
        fee: "0.0200 PRAF",
        memo: params.memo,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
      },
      ...mockTxs,
    ];
    return { txId };
  },
};

export const api = isTauriRuntime() ? tauriApi : mockApi;
