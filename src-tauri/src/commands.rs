use crate::db;
use crate::db::DbState;
use crate::types::{
    AppInfo, Balance, BridgeDepositParams, BridgeDepositResult, SendParams, SendResult, Settings,
    TxSummary, WalletCreateResult, WalletStatus,
};
use crate::wallet::WalletState;

#[tauri::command]
pub fn app_info(state: tauri::State<'_, crate::AppState>) -> AppInfo {
    AppInfo {
        version: state.version.clone(),
        identifier: state.identifier.clone(),
        os: state.os.clone(),
    }
}

#[tauri::command]
pub fn get_balance(db: tauri::State<'_, DbState>) -> Result<Balance, String> {
    db::get_balance(&db)
}

#[tauri::command]
pub fn list_transactions(db: tauri::State<'_, DbState>) -> Result<Vec<TxSummary>, String> {
    db::list_transactions(&db)
}

#[tauri::command]
pub fn rescan(db: tauri::State<'_, DbState>) -> Result<(), String> {
    db::confirm_pending(&db)
}

#[tauri::command]
pub fn send_transaction(db: tauri::State<'_, DbState>, params: SendParams) -> Result<SendResult, String> {
    let tx_id = db::random_id("tx");
    let amount = if params.amount.contains(' ') {
        params.amount
    } else {
        format!("{} PRAF", params.amount)
    };
    let fee = "0.0100 PRAF".to_string();
    db::insert_outgoing(&db, tx_id.clone(), amount, fee, params.memo)?;
    Ok(SendResult { tx_id })
}

#[tauri::command]
pub fn bridge_deposit(
    db: tauri::State<'_, DbState>,
    params: BridgeDepositParams,
) -> Result<BridgeDepositResult, String> {
    let tx_id = db::random_id("bridge");
    let amount = if params.amount.contains(' ') {
        params.amount
    } else {
        format!("{} PRAF", params.amount)
    };
    let fee = "0.0200 PRAF".to_string();
    let memo = params
        .memo
        .map(|m| format!("L2: {} · {m}", params.l2_address));
    db::insert_outgoing(&db, tx_id.clone(), amount, fee, memo)?;
    Ok(BridgeDepositResult { tx_id })
}

#[tauri::command]
pub fn wallet_status(wallet: tauri::State<'_, WalletState>) -> Result<WalletStatus, String> {
    wallet.status()
}

#[tauri::command]
pub fn wallet_create(
    wallet: tauri::State<'_, WalletState>,
    password: String,
) -> Result<WalletCreateResult, String> {
    wallet.create(password)
}

#[tauri::command]
pub fn wallet_import(
    wallet: tauri::State<'_, WalletState>,
    mnemonic: String,
    password: String,
) -> Result<(), String> {
    wallet.import(mnemonic, password)
}

#[tauri::command]
pub fn wallet_unlock(wallet: tauri::State<'_, WalletState>, password: String) -> Result<(), String> {
    wallet.unlock(password)
}

#[tauri::command]
pub fn wallet_lock(wallet: tauri::State<'_, WalletState>) -> Result<(), String> {
    wallet.lock()
}

#[tauri::command]
pub fn generate_address(wallet: tauri::State<'_, WalletState>) -> Result<crate::types::AddressResult, String> {
    wallet.generate_address()
}

#[tauri::command]
pub fn export_viewing_keys(
    wallet: tauri::State<'_, WalletState>,
    password: String,
) -> Result<crate::types::ViewingKeysResult, String> {
    wallet.export_viewing_keys(password)
}

#[tauri::command]
pub fn export_tvk(
    wallet: tauri::State<'_, WalletState>,
    tx_id: String,
    password: String,
) -> Result<crate::types::TvkResult, String> {
    wallet.export_tvk(tx_id, password)
}

#[tauri::command]
pub fn get_settings(db: tauri::State<'_, DbState>) -> Result<Settings, String> {
    Ok(Settings {
        helper_service_url: db::get_helper_service_url(&db)?,
    })
}

#[tauri::command]
pub fn set_helper_service_url(db: tauri::State<'_, DbState>, url: String) -> Result<(), String> {
    db::set_helper_service_url(&db, url)
}
