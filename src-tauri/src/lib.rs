// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;

mod commands;
mod db;
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
            ],
            keyring_username: "wallet_seed".to_string(),
            unlocked_seed: Mutex::new(None),
        })
        .manage(db_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::wallet_status,
            commands::wallet_create,
            commands::wallet_import,
            commands::wallet_unlock,
            commands::wallet_lock,
            commands::get_balance,
            commands::list_transactions,
            commands::rescan,
            commands::scan_notes,
            commands::get_sync_metadata,
            commands::send_transaction,
            commands::mint_dev_faucet,
            commands::bridge_deposit,
            commands::generate_address,
            commands::get_accounts_state,
            commands::create_account,
            commands::switch_account,
            commands::export_viewing_keys,
            commands::export_tvk,
            commands::get_settings,
            commands::set_helper_service_url
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
