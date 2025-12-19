// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use base64::prelude::*;
use bip39::{Language, Mnemonic};
use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use zeroize::Zeroizing;

struct AppState {
    identifier: String,
    version: String,
    os: String,
}

struct WalletState {
    keyring_service: String,
    keyring_username: String,
    unlocked_seed: Mutex<Option<Zeroizing<Vec<u8>>>>,
}

impl WalletState {
    fn entry(&self) -> Result<Entry, String> {
        Entry::new(&self.keyring_service, &self.keyring_username).map_err(|e| e.to_string())
    }
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WalletStatus {
    has_wallet: bool,
    is_unlocked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WalletCreateResult {
    mnemonic: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedSeed {
    kdf: String,
    salt_b64: String,
    nonce_b64: String,
    ciphertext_b64: String,
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

#[tauri::command]
fn wallet_status(wallet: tauri::State<'_, WalletState>) -> Result<WalletStatus, String> {
    let entry = wallet.entry()?;
    let has_wallet = match entry.get_password() {
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => false,
        Err(e) => return Err(e.to_string()),
    };

    let is_unlocked = wallet
        .unlocked_seed
        .lock()
        .map_err(|_| "Wallet state lock poisoned".to_string())?
        .is_some();

    Ok(WalletStatus {
        has_wallet,
        is_unlocked,
    })
}

#[tauri::command]
fn wallet_create(
    wallet: tauri::State<'_, WalletState>,
    password: String,
) -> Result<WalletCreateResult, String> {
    let mut rng = rand::thread_rng();
    let mnemonic = Mnemonic::generate_in_with(&mut rng, Language::English, 24)
        .map_err(|e| e.to_string())?;
    let seed = mnemonic.to_seed_normalized("");
    let enc = encrypt_seed(&seed, &password)?;
    wallet.entry()?.set_password(&enc).map_err(|e| e.to_string())?;

    let mut guard = wallet
        .unlocked_seed
        .lock()
        .map_err(|_| "Wallet state lock poisoned".to_string())?;
    *guard = Some(Zeroizing::new(seed.to_vec()));

    Ok(WalletCreateResult {
        mnemonic: mnemonic.to_string(),
    })
}

#[tauri::command]
fn wallet_import(
    wallet: tauri::State<'_, WalletState>,
    mnemonic: String,
    password: String,
) -> Result<(), String> {
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
        .map_err(|e| e.to_string())?;
    let seed = mnemonic.to_seed_normalized("");
    let enc = encrypt_seed(&seed, &password)?;
    wallet.entry()?.set_password(&enc).map_err(|e| e.to_string())?;

    let mut guard = wallet
        .unlocked_seed
        .lock()
        .map_err(|_| "Wallet state lock poisoned".to_string())?;
    *guard = Some(Zeroizing::new(seed.to_vec()));
    Ok(())
}

#[tauri::command]
fn wallet_unlock(wallet: tauri::State<'_, WalletState>, password: String) -> Result<(), String> {
    let enc = wallet.entry()?.get_password().map_err(|e| e.to_string())?;
    let seed = decrypt_seed(&enc, &password)?;
    let mut guard = wallet
        .unlocked_seed
        .lock()
        .map_err(|_| "Wallet state lock poisoned".to_string())?;
    *guard = Some(Zeroizing::new(seed));
    Ok(())
}

#[tauri::command]
fn wallet_lock(wallet: tauri::State<'_, WalletState>) -> Result<(), String> {
    let mut guard = wallet
        .unlocked_seed
        .lock()
        .map_err(|_| "Wallet state lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

fn encrypt_seed(seed: &[u8], password: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);

    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), seed)
        .map_err(|e| e.to_string())?;

    let payload = EncryptedSeed {
        kdf: "argon2id+a256gcm".to_string(),
        salt_b64: BASE64_STANDARD.encode(salt),
        nonce_b64: BASE64_STANDARD.encode(nonce),
        ciphertext_b64: BASE64_STANDARD.encode(ciphertext),
    };

    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

fn decrypt_seed(payload_json: &str, password: &str) -> Result<Vec<u8>, String> {
    let payload: EncryptedSeed = serde_json::from_str(payload_json).map_err(|e| e.to_string())?;
    if payload.kdf != "argon2id+a256gcm" {
        return Err("Unsupported encrypted payload".to_string());
    }

    let salt = BASE64_STANDARD
        .decode(payload.salt_b64)
        .map_err(|e| e.to_string())?;
    let nonce = BASE64_STANDARD
        .decode(payload.nonce_b64)
        .map_err(|e| e.to_string())?;
    let ciphertext = BASE64_STANDARD
        .decode(payload.ciphertext_b64)
        .map_err(|e| e.to_string())?;

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|e| e.to_string())
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
        .manage(WalletState {
            keyring_service: ctx.config().identifier.clone(),
            keyring_username: "wallet_seed".to_string(),
            unlocked_seed: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            wallet_status,
            wallet_create,
            wallet_import,
            wallet_unlock,
            wallet_lock,
            get_balance,
            list_transactions,
            rescan,
            send_transaction,
            bridge_deposit
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
