// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};

#[derive(Clone)]
struct AppState {
    identifier: String,
    version: String,
    os: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    identifier: String,
    os: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Balance {
    total: String,
    confirmed: String,
    pending: String,
    unspent: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum TxDirection {
    Incoming,
    Outgoing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum TxStatus {
    Pending,
    Confirmed,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TxSummary {
    id: String,
    direction: TxDirection,
    amount: String,
    fee: String,
    memo: Option<String>,
    timestamp: u64,
    status: TxStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendParams {
    to: String,
    amount: String,
    memo: Option<String>,
    prover_tip: ProverTip,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeDepositParams {
    l2_address: String,
    amount: String,
    memo: Option<String>,
    prover_tip: ProverTip,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ProverTip {
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendResult {
    tx_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeDepositResult {
    tx_id: String,
}

#[tauri::command]
fn app_info(state: tauri::State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: state.version.clone(),
        identifier: state.identifier.clone(),
        os: state.os.clone(),
    }
}

#[tauri::command]
fn get_balance() -> Result<Balance, String> {
    Ok(Balance {
        total: "0".to_string(),
        confirmed: "0".to_string(),
        pending: "0".to_string(),
        unspent: "0".to_string(),
    })
}

#[tauri::command]
fn list_transactions() -> Result<Vec<TxSummary>, String> {
    Ok(vec![])
}

#[tauri::command]
fn rescan() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn send_transaction(params: SendParams) -> Result<SendResult, String> {
    let _ = params;
    Ok(SendResult {
        tx_id: format!("stub-{}", unix_ts()),
    })
}

#[tauri::command]
fn bridge_deposit(params: BridgeDepositParams) -> Result<BridgeDepositResult, String> {
    let _ = params;
    Ok(BridgeDepositResult {
        tx_id: format!("stub-{}", unix_ts()),
    })
}

fn unix_ts() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ctx = tauri::generate_context!();
    let identifier = ctx.config().identifier.clone();
    let version = env!("CARGO_PKG_VERSION").to_string();
    let os = std::env::consts::OS.to_string();

    tauri::Builder::default()
        .manage(AppState {
            identifier,
            version,
            os,
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            get_balance,
            list_transactions,
            rescan,
            send_transaction,
            bridge_deposit
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
