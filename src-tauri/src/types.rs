use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub identifier: String,
    pub os: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Balance {
    pub total: String,
    pub confirmed: String,
    pub pending: String,
    pub unspent: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TxDirection {
    Incoming,
    Outgoing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TxStatus {
    Pending,
    Confirmed,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxSummary {
    pub id: String,
    pub direction: TxDirection,
    pub amount: String,
    pub fee: String,
    pub memo: Option<String>,
    pub timestamp: u64,
    pub status: TxStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_address: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendParams {
    pub to: String,
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: String,
    #[serde(default)]
    pub l2_recipient: Option<String>, // EVM address for bridge deposits
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDepositParams {
    pub l2_address: String,
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: String,
    /// If true, auto-wrap remaining PRAF to wPRAF (keep 0.1 PRAF for gas)
    pub auto_wrap: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MintDevFaucetParams {
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProverTip {
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    pub tx_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDepositResult {
    pub tx_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MintDevFaucetResult {
    pub tx_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletStatus {
    pub has_wallet: bool,
    pub is_unlocked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletCreateResult {
    pub mnemonic: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressResult {
    pub address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub index: u32,
    pub name: String,
    pub address: String,
    pub zk_address: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsState {
    pub accounts: Vec<AccountInfo>,
    pub active_account_index: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewingKeysResult {
    pub fvk: String,
    pub ivk: String,
    pub ovk: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvkResult {
    pub tvk: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub helper_service_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncState {
    Idle,
    Syncing,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMetadata {
    pub state: SyncState,
    pub message: Option<String>,
    pub last_synced_at: Option<u64>,
    pub last_scanned_height: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanNotesParams {
    pub full_rescan: bool,
}

// L2 Wallet Types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct L2Balance {
    /// Native PRAF balance (for gas)
    pub praf: String,
    /// wPRAF token balance
    pub wpraf: String,
    /// L2 address (0x...)
    pub address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct L2SendParams {
    /// Recipient address (0x...)
    pub to: String,
    /// Amount to send (human readable, e.g., "1.5")
    pub amount: String,
    /// Token type: "eth" or "wpraf"
    pub token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct L2SendResult {
    /// Transaction hash
    pub tx_hash: String,
    /// Status: "pending", "confirmed", "failed"
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct L2Config {
    /// L2 RPC URL
    pub rpc_url: String,
    /// wPRAF token contract address
    pub wpraf_address: Option<String>,
    /// Bridge contract address
    pub bridge_address: Option<String>,
    /// Chain ID
    pub chain_id: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct L2AddressResult {
    /// L1 PRAPH address (SS58)
    pub l1_address: String,
    /// L2 ETH address (0x...)
    pub l2_address: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeeEstimates {
    pub base_fee: u128,
    pub min_tip_per_action: u128,
    pub average_tip: u128,
}
