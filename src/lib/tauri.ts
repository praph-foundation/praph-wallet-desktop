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
  recipientAddress?: string;
  senderAddress?: string;
}

export interface SendParams {
  to: string;
  amount: string;
  memo?: string;
  proverTip: string;
}

export interface SendResult {
  txId: string;
}

export interface BridgeDepositParams {
  l2Address: string;
  amount: string;
  memo?: string;
  proverTip: string;
}

export interface BridgeDepositResult {
  txId: string;
}

export interface BridgeWithdrawParams {
  amount: string;
  l1Recipient: string;
  proverTip: string;
}

export interface BridgeWithdrawResult {
  txId: string;
}

export interface ActionCountEstimate {
  spendCount: number;
  outputCount: number;
  changeCount: number;
  tipCount: number;
  totalActions: number;
}

export interface MintDevFaucetParams {
  amount: string;
  memo?: string;
  proverTip: string;
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
  zkAddress: string;
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

// L2 Types
export interface L2Balance {
  praf: string;
  address: string;
}

export interface L2SendParams {
  to: string;
  amount: string;
  token: "praf";
}

export interface L2SendResult {
  txHash: string;
  status: string;
}

export interface L2Config {
  rpcUrl: string;
  bridgeAddress?: string;
  chainId: number;
}

export interface L2AddressResult {
  l1Address: string;
  l2Address: string;
}

export interface WalletUnlockParams {
  password: string;
  [key: string]: unknown;
}

export interface FeeEstimates {
  base_fee: number; // u128 from rust comes as number if small, but might be string/bigint if large?
  // serde_json treats u128 as number if it fits? No, usually fails or requires string.
  // My backend struct used u128. Default serde serialization for u128 is "number" if it fits, else fails?
  // Rust serde_json serialization of u128 is integer. JS numbers are doubles (safe up to 2^53).
  // 1, 5, 20 fit easily.
  // But strictly, u128 should be treated as string or number.
  // Let's assume number for now as expected values are small (units).
  min_tip_per_action: number;
  average_tip: number;
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



let mockTxs: TxSummary[] = [];

let mockAccounts: AccountInfo[] = [
  { index: 0, name: "Account 1", address: "", zkAddress: "", isActive: true },
];
let mockActiveAccountIndex = 0;

interface WalletApi {
  appInfo: () => Promise<AppInfo>;
  walletStatus: () => Promise<WalletStatus>;
  walletCreate: (password: string) => Promise<WalletCreateResult>;
  walletImport: (mnemonic: string, password: string) => Promise<void>;
  walletUnlock: (params: WalletUnlockParams) => Promise<void>;
  walletLock: () => Promise<void>;
  walletLogout: () => Promise<void>;
  debugProbeSeedEntries: () => Promise<string[]>;
  debugProbeSeedEntriesVerbose: () => Promise<Record<string, string[]>>;
  debugKeychainRoundtrip: () => Promise<string>;
  debugWalletSeedStorageStatus: () => Promise<Record<string, unknown>>;
  // Transaction and balance operations
  getBalance: () => Promise<Balance>;
  estimateActionCount: (amount: string, isBridge: boolean) => Promise<ActionCountEstimate>;
  listTransactions: () => Promise<TxSummary[]>;
  listTransactionsForActiveAccount: () => Promise<TxSummary[]>;
  rescan: () => Promise<void>;
  sendTransaction: (params: SendParams) => Promise<SendResult>;
  mintDevFaucet: (params: MintDevFaucetParams) => Promise<MintDevFaucetResult>;
  bridgeDeposit: (params: BridgeDepositParams) => Promise<BridgeDepositResult>;
  bridgeWithdraw: (params: BridgeWithdrawParams) => Promise<BridgeWithdrawResult>;
  updateBridgeStatus: (txId: string) => Promise<string>;
  generateAddress: () => Promise<AddressResult>;
  getAccountsState: () => Promise<AccountsState>;
  createAccount: () => Promise<AccountsState>;
  createAccountNamed: (name: string) => Promise<AccountsState>;
  switchAccount: (accountIndex: number) => Promise<AccountsState>;
  renameAccount: (accountIndex: number, newName: string) => Promise<AccountsState>;
  discoverAccounts: () => Promise<AccountInfo[]>;
  getSettings: () => Promise<Settings>;
  setHelperServiceUrl: (url: string) => Promise<void>;
  getSyncMetadata: () => Promise<SyncMetadata>;
  scanNotes: (params: ScanNotesParams) => Promise<SyncMetadata>;
  exportViewingKeys: (password: string) => Promise<ViewingKeysResult>;
  exportTvk: (txId: string, password: string) => Promise<TvkResult>;
  getFeeEstimates: () => Promise<FeeEstimates>;

  // L2 API
  getL2Address: () => Promise<L2AddressResult>;
  getL2Balance: () => Promise<L2Balance>;
  sendL2Transaction: (params: L2SendParams) => Promise<L2SendResult>;
  getL2Config: () => Promise<L2Config>;
  setL2RpcUrl: (url: string) => Promise<void>;

  setBridgeAddress: (address: string) => Promise<void>;

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
  walletLogout: () => invokeSafe<void>("wallet_logout"),

  debugProbeSeedEntries: () => invoke("debug_probe_seed_entries"),
  debugProbeSeedEntriesVerbose: () => invoke("debug_probe_seed_entries_verbose"),
  debugKeychainRoundtrip: () => invoke("debug_keychain_roundtrip"),
  debugWalletSeedStorageStatus: () => invoke("debug_wallet_seed_storage_status"),

  getBalance: () => invokeSafe<Balance>("get_balance"),
  estimateActionCount: (amount: string, isBridge: boolean) =>
    invokeSafe<ActionCountEstimate>("estimate_action_count", { amount, isBridge }),
  listTransactions: () => invokeSafe<TxSummary[]>("list_transactions"),
  listTransactionsForActiveAccount: () =>
    invokeSafe<TxSummary[]>("list_transactions_for_active_account"),
  rescan: () => invokeSafe<void>("rescan"),
  sendTransaction: (params: SendParams) => invokeSafe<SendResult>("send_transaction", { params }),
  mintDevFaucet: (params: MintDevFaucetParams) =>
    invokeSafe<MintDevFaucetResult>("mint_dev_faucet", { params }),
  bridgeDeposit: (params: BridgeDepositParams) =>
    invokeSafe<BridgeDepositResult>("bridge_deposit", { params }),
  bridgeWithdraw: (params: BridgeWithdrawParams) =>
    invokeSafe<BridgeWithdrawResult>("bridge_withdraw", { params }),
  updateBridgeStatus: (txId: string) =>
    invoke<string>("update_bridge_status", { txId }),

  generateAddress: () => invokeSafe<AddressResult>("generate_address"),

  getAccountsState: () => invokeSafe<AccountsState>("get_accounts_state"),
  createAccount: () => invokeSafe<AccountsState>("create_account"),
  createAccountNamed: (name: string) =>
    invokeSafe<AccountsState>("create_account_named", { name }),
  switchAccount: (accountIndex: number) =>
    invokeSafe<AccountsState>("switch_account", { accountIndex }),
  renameAccount: (accountIndex: number, newName: string) =>
    invokeSafe<AccountsState>("rename_account", { accountIndex, newName }),
  discoverAccounts: () =>
    invokeSafe<AccountInfo[]>("discover_accounts"),

  getSettings: () => invokeSafe<Settings>("get_settings"),
  setHelperServiceUrl: (url: string) => invokeSafe<void>("set_helper_service_url", { url }),

  getSyncMetadata: () => invokeSafe<SyncMetadata>("get_sync_metadata"),
  scanNotes: (params: ScanNotesParams) => invokeSafe<SyncMetadata>("scan_notes", { params }),

  exportViewingKeys: (password: string) =>
    invokeSafe<ViewingKeysResult>("export_viewing_keys", { password }),
  exportTvk: (txId: string, password: string) =>
    invokeSafe<TvkResult>("export_tvk", { tx_id: txId, password }),
  getFeeEstimates: () => invokeSafe<FeeEstimates>("get_fee_estimates"),

  // L2 API
  getL2Address: () => invokeSafe<L2AddressResult>("get_l2_address"),
  getL2Balance: () => invokeSafe<L2Balance>("get_l2_balance"),
  sendL2Transaction: (params: L2SendParams) =>
    invokeSafe<L2SendResult>("send_l2_transaction", { params }),
  getL2Config: () => invokeSafe<L2Config>("get_l2_config"),
  setL2RpcUrl: (url: string) => invokeSafe<void>("set_l2_rpc_url", { url }),

  setBridgeAddress: (address: string) => invokeSafe<void>("set_bridge_address", { address }),
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

  walletLogout: async (): Promise<void> => {
    mockHasWallet = false;
    mockUnlocked = false;
    await sleep(100);
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
    return {
      total: "100.0000",
      confirmed: "100.0000",
      pending: "0.0000",
      unspent: "100.0000",
    };
  },

  estimateActionCount: async (amount: string, isBridge: boolean): Promise<ActionCountEstimate> => {
    await sleep(150);
    // Mock: simulate 2 spends needed for amounts > 50
    const amt = parseFloat(amount);
    const spendCount = amt > 50 ? 2 : 1;
    const outputCount = isBridge ? 0 : 1;
    const changeCount = 1;
    const tipCount = 1;
    return {
      spendCount,
      outputCount,
      changeCount,
      tipCount,
      totalActions: spendCount + outputCount + changeCount + tipCount,
    };
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
      { index: next, name: `Account ${next + 1}`, address: "", zkAddress: "", isActive: false },
    ];
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  createAccountNamed: async (name: string): Promise<AccountsState> => {
    await sleep(50);
    const next = mockAccounts.length;
    mockAccounts = [
      ...mockAccounts.map((a) => ({ ...a, isActive: a.index === mockActiveAccountIndex })),
      { index: next, name, address: "", zkAddress: "", isActive: false },
    ];
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  switchAccount: async (accountIndex: number): Promise<AccountsState> => {
    await sleep(50);
    mockActiveAccountIndex = accountIndex;
    mockAccounts = mockAccounts.map((a) => ({ ...a, isActive: a.index === accountIndex }));
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  renameAccount: async (accountIndex: number, newName: string): Promise<AccountsState> => {
    await sleep(50);
    mockAccounts = mockAccounts.map((a) =>
      a.index === accountIndex ? { ...a, name: newName } : a
    );
    return { accounts: mockAccounts, activeAccountIndex: mockActiveAccountIndex };
  },
  discoverAccounts: async (): Promise<AccountInfo[]> => {
    await sleep(300);
    // Mock returns empty array (no additional accounts discovered)
    return [];
  },

  bridgeDeposit: async (_params: BridgeDepositParams): Promise<BridgeDepositResult> => {
    await sleep(100);
    throw new Error(
      "bridgeDeposit is only available in the Tauri desktop app (backend required)"
    );
  },

  bridgeWithdraw: async (_params: BridgeWithdrawParams): Promise<BridgeWithdrawResult> => {
    await sleep(100);
    throw new Error(
      "bridgeWithdraw is only available in the Tauri desktop app (backend required)"
    );
  },

  updateBridgeStatus: async (_txId: string): Promise<string> => {
    await sleep(50);
    return "pending"; // Mock always returns pending
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
  getFeeEstimates: async (): Promise<FeeEstimates> => {
    await sleep(50);
    return {
      base_fee: 1,
      min_tip_per_action: 1,
      average_tip: 5,
    };
  },

  // L2 Mock
  getL2Address: async (): Promise<L2AddressResult> => {
    await sleep(50);
    return { l1Address: "", l2Address: "0x0000000000000000000000000000000000000000" };
  },
  getL2Balance: async (): Promise<L2Balance> => {
    await sleep(50);
    return { praf: "0.00", address: "0x..." };
  },
  sendL2Transaction: async (_params: L2SendParams): Promise<L2SendResult> => {
    await sleep(100);
    throw new Error("sendL2Transaction is only available in backend");
  },
  getL2Config: async (): Promise<L2Config> => {
    await sleep(50);
    return { rpcUrl: "http://localhost:8545", chainId: 1337 };
  },
  setL2RpcUrl: async (_url: string): Promise<void> => {
    await sleep(50);
  },
  setBridgeAddress: async (_address: string): Promise<void> => {
    await sleep(50);
  },
};

export const api: WalletApi = isTauriRuntime() ? tauriApi : mockApi;
