// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;

mod bridge_crypto;
mod commands;
mod db;
pub mod l2_client;
mod rpc_client;
mod types;
mod wallet;

struct AppState {
    identifier: String,
    version: String,
    os: String,
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

    let db_state = db::DbState {
        db_path: db::wallet_db_path(&identifier).expect("failed to resolve wallet DB path"),
    };
    db::init_db(&db_state).expect("failed to initialize wallet DB");

    tauri::Builder::default()
        .manage(AppState {
            identifier,
            version,
            os,
        })
        .manage(wallet::WalletState {
            // Use a stable keyring service name so upgrades / dev-vs-release don't lose access
            // to the keychain entry.
            keyring_service: "com.eunseong.praph-wallet".to_string(),
            keyring_service_fallbacks: vec![
                ctx.config().identifier.clone(),
                "praph-wallet".to_string(),
                "Praph Wallet".to_string(),
                "com.tauri.dev".to_string(),
                "com.eunseong.praphwallet".to_string(),
            ],
            keyring_username: "wallet_seed".to_string(),
            keyring_username_fallbacks: vec![
                "wallet-seed".to_string(),
                "walletSeed".to_string(),
                "walletseed".to_string(),
                "wallet seed".to_string(),
                "seed".to_string(),
                "mnemonic".to_string(),
            ],
            unlocked_seed: Mutex::new(None),
        })
        .manage(db_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::wallet_status,
            commands::wallet_status_db,
            commands::wallet_create,
            commands::wallet_import,
            commands::wallet_unlock,
            commands::debug_probe_seed_entries,
            commands::debug_probe_seed_entries_verbose,
            commands::debug_keychain_roundtrip,
            commands::debug_wallet_seed_storage_status,
            commands::wallet_lock,
            commands::wallet_logout,
            commands::get_balance,
            commands::list_transactions,
            commands::list_transactions_for_active_account,
            commands::rescan,
            commands::scan_notes,
            commands::get_sync_metadata,
            commands::send_transaction,
            commands::mint_dev_faucet,
            commands::bridge_deposit,
            commands::generate_address,
            commands::get_accounts_state,
            commands::create_account,
            commands::create_account_named,
            commands::switch_account,
            commands::rename_account,
            commands::discover_accounts,
            commands::export_viewing_keys,
            commands::export_tvk,
            commands::get_settings,
            commands::set_helper_service_url,
            // L2 ETH Wallet
            commands::get_l2_address,
            commands::get_l2_balance,
            commands::send_l2_transaction,
            commands::get_l2_config,
            commands::set_l2_rpc_url,
            commands::set_wpraf_address,
            commands::set_bridge_address,
            commands::withdraw_l2_funds,
            commands::get_fee_estimates
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
