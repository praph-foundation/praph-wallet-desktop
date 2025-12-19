// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use base64::prelude::*;
use bip39::{Language, Mnemonic};
use directories::ProjectDirs;
use keyring::Entry;
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

struct DbState {
    db_path: PathBuf,
}

impl WalletState {
    fn entry(&self) -> Result<Entry, String> {
        Entry::new(&self.keyring_service, &self.keyring_username).map_err(|e| e.to_string())
    }
}

fn wallet_db_path(identifier: &str) -> Result<PathBuf, String> {
    let proj = ProjectDirs::from("org", "praph", identifier)
        .ok_or_else(|| "Failed to resolve app data directory".to_string())?;
    let dir = proj.data_local_dir();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(dir.join("wallet.sqlite3"))
}

fn open_db(db: &DbState) -> Result<Connection, String> {
    Connection::open(&db.db_path).map_err(|e| e.to_string())
}

fn init_db(db: &DbState) -> Result<(), String> {
    let conn = open_db(db)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS transactions (\
             id TEXT PRIMARY KEY,\
             direction TEXT NOT NULL,\
             amount TEXT NOT NULL,\
             amount_minor INTEGER NOT NULL,\
             fee TEXT NOT NULL,\
             fee_minor INTEGER NOT NULL,\
             memo TEXT,\
             timestamp INTEGER NOT NULL,\
             status TEXT NOT NULL\
         );\
         CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);",
    )
    .map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        let now = unix_ts() as i64;
        let demo1_amount_minor = parse_amount_minor("5.0000 PRAF");
        let demo2_amount_minor = parse_amount_minor("1.5000 PRAF");
        conn.execute(
            "INSERT INTO transactions (id, direction, amount, amount_minor, fee, fee_minor, memo, timestamp, status)\
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                "tx_demo_1",
                "incoming",
                "5.0000 PRAF",
                demo1_amount_minor,
                "0.0000 PRAF",
                0i64,
                "Demo incoming",
                now - 3600,
                "confirmed"
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO transactions (id, direction, amount, amount_minor, fee, fee_minor, memo, timestamp, status)\
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                "tx_demo_2",
                "outgoing",
                "1.5000 PRAF",
                demo2_amount_minor,
                "0.0100 PRAF",
                parse_amount_minor("0.0100 PRAF"),
                "Demo outgoing",
                now - 900,
                "pending"
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn parse_amount_minor(amount: &str) -> i64 {
    let s = amount.split_whitespace().next().unwrap_or("0");
    let v: f64 = s.parse().unwrap_or(0.0);
    (v * 10_000.0).round() as i64
}

fn format_amount_minor(amount_minor: i64) -> String {
    let sign = if amount_minor < 0 { "-" } else { "" };
    let v = amount_minor.abs();
    let whole = v / 10_000;
    let frac = v % 10_000;
    format!("{}{whole}.{frac:04} PRAF", sign)
}

fn parse_tx_direction(s: &str) -> Result<TxDirection, String> {
    match s {
        "incoming" => Ok(TxDirection::Incoming),
        "outgoing" => Ok(TxDirection::Outgoing),
        _ => Err("Invalid direction".to_string()),
    }
}

fn parse_tx_status(s: &str) -> Result<TxStatus, String> {
    match s {
        "pending" => Ok(TxStatus::Pending),
        "confirmed" => Ok(TxStatus::Confirmed),
        "failed" => Ok(TxStatus::Failed),
        _ => Err("Invalid status".to_string()),
    }
}

fn random_id(prefix: &str) -> String {
    let mut bytes = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut bytes);
    let mut s = String::with_capacity(12);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    format!("{prefix}_{}_{}", unix_ts(), s)
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
fn get_balance(db: tauri::State<'_, DbState>) -> Result<Balance, String> {
    let conn = open_db(&db)?;

    let incoming_confirmed: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM transactions WHERE direction='incoming' AND status='confirmed'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let outgoing_confirmed: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_minor + fee_minor), 0) FROM transactions WHERE direction='outgoing' AND status='confirmed'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let incoming_pending: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM transactions WHERE direction='incoming' AND status='pending'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let outgoing_pending: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_minor + fee_minor), 0) FROM transactions WHERE direction='outgoing' AND status='pending'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let confirmed_net = incoming_confirmed - outgoing_confirmed;
    let pending_net = incoming_pending - outgoing_pending;
    let total = confirmed_net + pending_net;

    Ok(Balance {
        total: format_amount_minor(total),
        confirmed: format_amount_minor(confirmed_net),
        pending: format_amount_minor(pending_net),
        unspent: format_amount_minor(confirmed_net),
    })
}

#[tauri::command]
fn list_transactions(db: tauri::State<'_, DbState>) -> Result<Vec<TxSummary>, String> {
    let conn = open_db(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, direction, amount, fee, memo, timestamp, status FROM transactions ORDER BY timestamp DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            let direction: String = r.get(1)?;
            let status: String = r.get(6)?;
            Ok(TxSummary {
                id: r.get(0)?,
                direction: parse_tx_direction(&direction).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))?,
                amount: r.get(2)?,
                fee: r.get(3)?,
                memo: r.get(4)?,
                timestamp: r.get::<_, i64>(5)? as u64,
                status: parse_tx_status(&status).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
fn rescan(db: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = open_db(&db)?;
    conn.execute("UPDATE transactions SET status='confirmed' WHERE status='pending'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn send_transaction(db: tauri::State<'_, DbState>, params: SendParams) -> Result<SendResult, String> {
    let conn = open_db(&db)?;
    let tx_id = random_id("tx");
    let amount = if params.amount.contains(' ') {
        params.amount.clone()
    } else {
        format!("{} PRAF", params.amount)
    };
    let amount_minor = parse_amount_minor(&amount);
    let fee = "0.0100 PRAF".to_string();
    let fee_minor = parse_amount_minor(&fee);
    let ts = unix_ts() as i64;

    conn.execute(
        "INSERT INTO transactions (id, direction, amount, amount_minor, fee, fee_minor, memo, timestamp, status)\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            tx_id,
            "outgoing",
            amount,
            amount_minor,
            fee,
            fee_minor,
            params.memo,
            ts,
            "pending"
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(SendResult { tx_id })
}

#[tauri::command]
fn bridge_deposit(
    db: tauri::State<'_, DbState>,
    params: BridgeDepositParams,
) -> Result<BridgeDepositResult, String> {
    let conn = open_db(&db)?;
    let tx_id = random_id("bridge");
    let amount = if params.amount.contains(' ') {
        params.amount.clone()
    } else {
        format!("{} PRAF", params.amount)
    };
    let amount_minor = parse_amount_minor(&amount);
    let fee = "0.0200 PRAF".to_string();
    let fee_minor = parse_amount_minor(&fee);
    let ts = unix_ts() as i64;
    let memo = params.memo.map(|m| format!("L2: {} · {m}", params.l2_address));

    conn.execute(
        "INSERT INTO transactions (id, direction, amount, amount_minor, fee, fee_minor, memo, timestamp, status)\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            tx_id,
            "outgoing",
            amount,
            amount_minor,
            fee,
            fee_minor,
            memo,
            ts,
            "pending"
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(BridgeDepositResult { tx_id })
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

    let db_state = DbState {
        db_path: wallet_db_path(&identifier).expect("failed to resolve wallet DB path"),
    };
    init_db(&db_state).expect("failed to initialize wallet DB");

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
        .manage(db_state)
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
