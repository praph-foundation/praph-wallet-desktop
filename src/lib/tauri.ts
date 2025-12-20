import { invoke } from "@tauri-apps/api/core";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function invokeSafe<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(toErrorMessage(e));
  }
}

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

export interface MintDevFaucetParams {
  amount: string;
  memo?: string;
  proverTip: "low" | "medium" | "high";
}

export interface MintDevFaucetResult {
  txId: string;
}

export interface WalletStatus {
  hasWallet: boolean;
  isUnlocked: boolean;
}

export interface WalletCreateResult {
  mnemonic: string;
}

export interface AddressResult {
  address: string;
}

export interface AccountInfo {
  index: number;
  name: string;
  address: string;
  isActive: boolean;
}

export interface AccountsState {
  accounts: AccountInfo[];
  activeAccountIndex: number;
}

export interface Settings {
  helperServiceUrl: string;
}

export type SyncState = "idle" | "syncing" | "error";

export interface SyncMetadata {
  state: SyncState;
  message?: string;
  lastSyncedAt?: number;
  lastScannedHeight?: number;
}

export interface ScanNotesParams {
  fullRescan: boolean;
}

export interface ViewingKeysResult {
  fvk: string;
  ivk: string;
  ovk: string;
}

export interface TvkResult {
  tvk: string;
}

export interface WalletUnlockParams {
  password: string;
  [key: string]: unknown;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockUnlocked = true;
let mockHasWallet = true;
let mockHelperServiceUrl = "http://localhost:8081";

let mockBalance: Balance = {
  total: "0.0000 PRAF",
  confirmed: "0.0000 PRAF",
  pending: "0.0000 PRAF",
  unspent: "0.0000 PRAF",
};

let mockTxs: TxSummary[] = [];

let mockAccounts: AccountInfo[] = [
  { index: 0, name: "Account 1", address: "", isActive: true },
];
let mockActiveAccountIndex = 0;

interface WalletApi {
  appInfo: () => Promise<AppInfo>;
  walletStatus: () => Promise<WalletStatus>;
  walletCreate: (password: string) => Promise<WalletCreateResult>;
  walletImport: (mnemonic: string, password: string) => Promise<void>;
  walletUnlock: (params: WalletUnlockParams) => Promise<void>;
  walletLock: () => Promise<void>;
  debugProbeSeedEntries: () => Promise<string[]>;
  debugProbeSeedEntriesVerbose: () => Promise<Record<string, string[]>>;
  debugKeychainRoundtrip: () => Promise<string>;
  debugWalletSeedStorageStatus: () => Promise<Record<string, unknown>>;
  getBalance: () => Promise<Balance>;
  listTransactions: () => Promise<TxSummary[]>;
  listTransactionsForActiveAccount: () => Promise<TxSummary[]>;
  rescan: () => Promise<void>;
  sendTransaction: (params: SendParams) => Promise<SendResult>;
  mintDevFaucet: (params: MintDevFaucetParams) => Promise<MintDevFaucetResult>;
  bridgeDeposit: (params: BridgeDepositParams) => Promise<BridgeDepositResult>;
  generateAddress: () => Promise<AddressResult>;
  getAccountsState: () => Promise<AccountsState>;
  createAccount: () => Promise<AccountsState>;
  createAccountNamed: (name: string) => Promise<AccountsState>;
  switchAccount: (accountIndex: number) => Promise<AccountsState>;
  getSettings: () => Promise<Settings>;
  setHelperServiceUrl: (url: string) => Promise<void>;
  getSyncMetadata: () => Promise<SyncMetadata>;
  scanNotes: (params: ScanNotesParams) => Promise<SyncMetadata>;
  exportViewingKeys: (password: string) => Promise<ViewingKeysResult>;
  exportTvk: (txId: string, password: string) => Promise<TvkResult>;
}

const tauriApi: WalletApi = {
  appInfo: () => invokeSafe<AppInfo>("app_info"),

  walletStatus: () => invokeSafe<WalletStatus>("wallet_status_db"),
  walletCreate: (password: string) =>
    invokeSafe<WalletCreateResult>("wallet_create", { password }),
  walletImport: (mnemonic: string, password: string) =>
    invokeSafe<void>("wallet_import", { mnemonic, password }),
  walletUnlock: (params: WalletUnlockParams) =>
    invokeSafe<void>("wallet_unlock", { password: params.password }),
  walletLock: () => invoke("wallet_lock"),

  debugProbeSeedEntries: () => invoke("debug_probe_seed_entries"),
  debugProbeSeedEntriesVerbose: () => invoke("debug_probe_seed_entries_verbose"),
  debugKeychainRoundtrip: () => invoke("debug_keychain_roundtrip"),
  debugWalletSeedStorageStatus: () => invoke("debug_wallet_seed_storage_status"),

  getBalance: () => invokeSafe<Balance>("get_balance"),
  listTransactions: () => invokeSafe<TxSummary[]>("list_transactions"),
  listTransactionsForActiveAccount: () =>
    invokeSafe<TxSummary[]>("list_transactions_for_active_account"),
  rescan: () => invokeSafe<void>("rescan"),
  sendTransaction: (params: SendParams) => invokeSafe<SendResult>("send_transaction", { params }),
  mintDevFaucet: (params: MintDevFaucetParams) =>
    invokeSafe<MintDevFaucetResult>("mint_dev_faucet", { params }),
  bridgeDeposit: (params: BridgeDepositParams) =>
    invokeSafe<BridgeDepositResult>("bridge_deposit", { params }),

  generateAddress: () => invokeSafe<AddressResult>("generate_address"),

  getAccountsState: () => invokeSafe<AccountsState>("get_accounts_state"),
  createAccount: () => invokeSafe<AccountsState>("create_account"),
  createAccountNamed: (name: string) =>
    invokeSafe<AccountsState>("create_account_named", { name }),
  switchAccount: (accountIndex: number) =>
    invokeSafe<AccountsState>("switch_account", { accountIndex }),

  getSettings: () => invokeSafe<Settings>("get_settings"),
  setHelperServiceUrl: (url: string) => invokeSafe<void>("set_helper_service_url", { url }),

  getSyncMetadata: () => invokeSafe<SyncMetadata>("get_sync_metadata"),
  scanNotes: (params: ScanNotesParams) => invokeSafe<SyncMetadata>("scan_notes", { params }),

  exportViewingKeys: (password: string) =>
    invokeSafe<ViewingKeysResult>("export_viewing_keys", { password }),
  exportTvk: (txId: string, password: string) =>
    invokeSafe<TvkResult>("export_tvk", { tx_id: txId, password }),
};

const mockApi: WalletApi = {
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

  walletUnlock: async (_params: WalletUnlockParams): Promise<void> => {
    await sleep(200);
    throw new Error(
      "walletUnlock is only available in the Tauri desktop app (backend required)"
    );
  },

  walletLock: async (): Promise<void> => {
    mockUnlocked = false;
    await sleep(150);
  },

  debugProbeSeedEntries: async (): Promise<string[]> => {
    await sleep(50);
    return [];
  },

  debugProbeSeedEntriesVerbose: async (): Promise<Record<string, string[]>> => {
    await sleep(50);
    return { candidates: [], found: [], errors: [] };
  },

  debugKeychainRoundtrip: async (): Promise<string> => {
    await sleep(50);
    return "OK mock";
  },

  debugWalletSeedStorageStatus: async (): Promise<Record<string, unknown>> => {
    await sleep(50);
    return {
      primaryReadable: false,
      scanFound: false,
      services: [],
      usernames: [],
      errors: [],
    };
  },

  getBalance: async (): Promise<Balance> => {
    await sleep(150);
    return mockBalance;
  },

  listTransactions: async (): Promise<TxSummary[]> => {
    await sleep(150);
    return mockTxs;
  },

  listTransactionsForActiveAccount: async (): Promise<TxSummary[]> => {
    await sleep(150);
    return mockTxs;
  },

  rescan: async (): Promise<void> => {
    await sleep(600);
  },

  sendTransaction: async (_params: SendParams): Promise<SendResult> => {
    await sleep(100);
    throw new Error(
      "sendTransaction is only available in the Tauri desktop app (backend required)"
    );
  },

  mintDevFaucet: async (_params: MintDevFaucetParams): Promise<MintDevFaucetResult> => {
    await sleep(100);
    throw new Error(
      "mintDevFaucet is only available in the Tauri desktop app (backend required)"
    );
  },

  generateAddress: async (): Promise<AddressResult> => {
    await sleep(50);
    return { address: "" };
  },

  getAccountsState: async (): Promise<AccountsState> => {
    await sleep(50);
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  createAccount: async (): Promise<AccountsState> => {
    await sleep(50);
    const next = mockAccounts.length;
    mockAccounts = [
      ...mockAccounts.map((a) => ({ ...a, isActive: a.index === mockActiveAccountIndex })),
      { index: next, name: `Account ${next + 1}`, address: "", isActive: false },
    ];
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  createAccountNamed: async (name: string): Promise<AccountsState> => {
    await sleep(50);
    const next = mockAccounts.length;
    mockAccounts = [
      ...mockAccounts.map((a) => ({ ...a, isActive: a.index === mockActiveAccountIndex })),
      { index: next, name, address: "", isActive: false },
    ];
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  switchAccount: async (accountIndex: number): Promise<AccountsState> => {
    await sleep(50);
    mockActiveAccountIndex = accountIndex;
    mockAccounts = mockAccounts.map((a) => ({ ...a, isActive: a.index === accountIndex }));
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },

  bridgeDeposit: async (_params: BridgeDepositParams): Promise<BridgeDepositResult> => {
    await sleep(100);
    throw new Error(
      "bridgeDeposit is only available in the Tauri desktop app (backend required)"
    );
  },

  getSettings: async (): Promise<Settings> => {
    await sleep(50);
    return { helperServiceUrl: mockHelperServiceUrl };
  },
  setHelperServiceUrl: async (url: string): Promise<void> => {
    mockHelperServiceUrl = url;
    await sleep(50);
  },

  getSyncMetadata: async (): Promise<SyncMetadata> => {
    await sleep(50);
    return { state: "idle" };
  },
  scanNotes: async (_params: ScanNotesParams): Promise<SyncMetadata> => {
    await sleep(300);
    return { state: "idle", lastSyncedAt: Math.floor(Date.now() / 1000) };
  },

  exportViewingKeys: async (_password: string): Promise<ViewingKeysResult> => {
    await sleep(150);
    return {
      fvk: "mock_fvk",
      ivk: "mock_ivk",
      ovk: "mock_ovk",
    };
  },
  exportTvk: async (_txId: string, _password: string): Promise<TvkResult> => {
    await sleep(150);
    return { tvk: "mock_tvk" };
  },
};

export const api: WalletApi = isTauriRuntime() ? tauriApi : mockApi;
