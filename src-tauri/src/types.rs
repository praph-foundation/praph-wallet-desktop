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

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendParams {
    pub to: String,
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: ProverTip,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDepositParams {
    pub l2_address: String,
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: ProverTip,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MintDevFaucetParams {
    pub amount: String,
    pub memo: Option<String>,
    pub prover_tip: ProverTip,
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
