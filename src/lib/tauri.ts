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

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  getBalance: () => invoke<Balance>("get_balance"),
  listTransactions: () => invoke<TxSummary[]>("list_transactions"),
  rescan: () => invoke<void>("rescan"),
  sendTransaction: (params: SendParams) => invoke<SendResult>("send_transaction", { params }),
  bridgeDeposit: (params: BridgeDepositParams) =>
    invoke<BridgeDepositResult>("bridge_deposit", { params }),
};
