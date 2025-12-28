use crate::db;
use crate::db::DbState;
use crate::types::{
    AccountInfo, AccountsState, AddressResult, AppInfo, Balance, BridgeDepositParams,
    BridgeDepositResult, MintDevFaucetParams, MintDevFaucetResult, ProverTip, ScanNotesParams,
    SendParams, SendResult, Settings, SyncMetadata, SyncState, TxSummary, WalletCreateResult,
    WalletStatus,
};
use crate::wallet::WalletState;
use serde::{Deserialize, Serialize};
use tauri::Manager;

fn resolve_keys_dir(app: Option<&tauri::AppHandle>) -> Result<std::path::PathBuf, String> {
    use std::path::PathBuf;

    // PRIORITY 1: Check for src-tauri/resources/keys in development mode
    // In dev mode, resolve relative to the workspace root
    if let Ok(cwd) = std::env::current_dir() {
        // Try src-tauri/resources/keys relative to current directory
        let dev_keys = cwd.join("src-tauri/resources/keys");
        if dev_keys.is_dir() {
            eprintln!("[resolve_keys_dir] Using dev keys: {}", dev_keys.display());
            return Ok(dev_keys);
        }
        // Also try if we're already in src-tauri directory
        let dev_keys_alt = cwd.join("resources/keys");
        if dev_keys_alt.is_dir() {
            eprintln!(
                "[resolve_keys_dir] Using dev keys (alt): {}",
                dev_keys_alt.display()
            );
            return Ok(dev_keys_alt);
        }
    }

    // PRIORITY 2: Environment variables (for e2e tests and explicit configuration)
    if let Ok(v) = std::env::var("PRAPH_CLIENT_KEYS_DIR") {
        if !v.trim().is_empty() {
            eprintln!("[resolve_keys_dir] Using PRAPH_CLIENT_KEYS_DIR: {}", v);
            return Ok(PathBuf::from(v));
        }
    }
    if let Ok(v) = std::env::var("PRAPH_KEYS_DIR") {
        if !v.trim().is_empty() {
            eprintln!("[resolve_keys_dir] Using PRAPH_KEYS_DIR: {}", v);
            return Ok(PathBuf::from(v));
        }
    }

    // PRIORITY 3: Bundled resources (production mode)
    if let Some(app) = app {
        use tauri::path::BaseDirectory;
        if let Ok(p) = app.path().resolve("keys", BaseDirectory::Resource) {
            if p.is_dir() {
                eprintln!("[resolve_keys_dir] Using bundled keys: {}", p.display());
                return Ok(p);
            }
        }
        if let Ok(p) = app
            .path()
            .resolve("resources/keys", BaseDirectory::Resource)
        {
            if p.is_dir() {
                eprintln!(
                    "[resolve_keys_dir] Using bundled resources/keys: {}",
                    p.display()
                );
                return Ok(p);
            }
        }
    }

    // PRIORITY 4: Fallback to ./keys or sibling PRAPH repo
    let cwd_keys = PathBuf::from("./keys");
    if cwd_keys.is_dir() {
        eprintln!("[resolve_keys_dir] Using fallback ./keys");
        return Ok(cwd_keys);
    }

    if let Ok(cwd) = std::env::current_dir() {
        let sibling = cwd.join("../PRAPH/keys");
        if sibling.is_dir() {
            eprintln!("[resolve_keys_dir] Using fallback sibling ../PRAPH/keys");
            return Ok(sibling);
        }
    }

    eprintln!("[resolve_keys_dir] WARNING: No keys directory found, returning ./keys");
    Ok(PathBuf::from("./keys"))
}

fn ensure_client_key_files(keys_dir: &std::path::Path) -> Result<(), String> {
    let required = [
        "client_output_params.bin",
        "client_output_pk.bin",
        "client_output_vk.bin",
        "client_spend_params.bin",
        "client_spend_pk.bin",
        "client_spend_vk.bin",
    ];
    let mut missing = Vec::new();
    for f in required.iter() {
        let p = keys_dir.join(f);
        if !p.is_file() {
            missing.push(f.to_string());
        }
    }
    if !missing.is_empty() {
        return Err(format!(
            "missing proof key files in keys_dir={}: {} (set PRAPH_CLIENT_KEYS_DIR=/path/to/PRAPH/keys)",
            keys_dir.display(),
            missing.join(", ")
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn app_info(state: tauri::State<'_, crate::AppState>) -> AppInfo {
    AppInfo {
        version: state.version.clone(),
        identifier: state.identifier.clone(),
        os: state.os.clone(),
    }
}

fn encrypt_memo_v1(plaintext: &[u8], key: &[u8; 32], nonce: &[u8; 12]) -> Result<Vec<u8>, String> {
    use aead::generic_array::GenericArray;
    use chacha20poly1305::{AeadInPlace, ChaCha20Poly1305, KeyInit};

    let key_array = GenericArray::from_slice(key);
    let nonce_array = GenericArray::from_slice(nonce);
    let cipher = ChaCha20Poly1305::new(key_array);

    let mut ciphertext = plaintext.to_vec();
    let tag = cipher
        .encrypt_in_place_detached(nonce_array, b"", &mut ciphertext)
        .map_err(|e| format!("memo encryption failed: {e}"))?;

    let mut out = nonce.to_vec();
    out.extend_from_slice(&ciphertext);
    out.extend_from_slice(tag.as_slice());
    Ok(out)
}

#[tauri::command]
pub fn debug_keychain_roundtrip(wallet: tauri::State<'_, WalletState>) -> Result<String, String> {
    wallet.debug_keychain_roundtrip()
}

#[tauri::command]
pub fn debug_wallet_seed_storage_status(
    wallet: tauri::State<'_, WalletState>,
) -> Result<std::collections::HashMap<String, serde_json::Value>, String> {
    let (primary_readable, scan_found, services, usernames, errors) =
        wallet.debug_wallet_seed_storage_status()?;
    let mut out = std::collections::HashMap::new();
    out.insert(
        "primaryReadable".to_string(),
        serde_json::Value::Bool(primary_readable),
    );
    out.insert("scanFound".to_string(), serde_json::Value::Bool(scan_found));
    out.insert(
        "services".to_string(),
        serde_json::Value::Array(
            services
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );
    out.insert(
        "usernames".to_string(),
        serde_json::Value::Array(
            usernames
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );
    out.insert(
        "errors".to_string(),
        serde_json::Value::Array(errors.into_iter().map(serde_json::Value::String).collect()),
    );
    Ok(out)
}

fn parse_amount_minor(amount: &str) -> i64 {
    let raw = amount.split_whitespace().next().unwrap_or("0");
    let (whole, frac) = match raw.split_once('.') {
        Some((w, f)) => (w, f),
        None => (raw, ""),
    };

    let sign = if whole.starts_with('-') { -1i64 } else { 1i64 };
    let whole_digits = whole.trim_start_matches('-');

    let whole_value: i64 = whole_digits.parse().unwrap_or(0);
    let mut frac_digits = frac.to_string();
    if frac_digits.len() > 4 {
        frac_digits.truncate(4);
    }
    while frac_digits.len() < 4 {
        frac_digits.push('0');
    }
    let frac_value: i64 = frac_digits.parse().unwrap_or(0);

    sign * (whole_value * 10_000 + frac_value)
}

fn parse_hex_32(s: &str) -> Result<[u8; 32], String> {
    let s = s.trim();
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).map_err(|e| e.to_string())?;
    if bytes.len() != 32 {
        return Err("address must be 32-byte hex".to_string());
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn parse_ss58_account_id_32(s: &str, expected_prefix: u16) -> Result<[u8; 32], String> {
    use blake2::digest::Digest;
    use blake2::Blake2b512;

    let data = bs58::decode(s.trim())
        .into_vec()
        .map_err(|e| format!("invalid SS58: {e}"))?;

    // For prefix < 64: [prefix(1)][account(32)][checksum(2)]
    if data.len() != 35 {
        return Err("invalid SS58 length".to_string());
    }
    let prefix = data[0] as u16;
    if prefix != expected_prefix {
        return Err(format!(
            "SS58 prefix mismatch (expected {expected_prefix}, got {prefix})"
        ));
    }

    let checksum = &data[data.len() - 2..];
    let payload = &data[..data.len() - 2];
    let mut hasher = Blake2b512::new();
    hasher.update(b"SS58PRE");
    hasher.update(payload);
    let hash = hasher.finalize();
    if checksum != &hash[..2] {
        return Err("invalid SS58 checksum".to_string());
    }

    let mut account = [0u8; 32];
    account.copy_from_slice(&data[1..33]);
    Ok(account)
}

fn parse_recipient_32(s: &str) -> Result<[u8; 32], String> {
    let s_trim = s.trim();
    if s_trim.starts_with("0x") || s_trim.len() == 64 {
        return parse_hex_32(s_trim);
    }
    // PRAPH runtime uses SS58 prefix 42.
    parse_ss58_account_id_32(s_trim, 42)
}

fn build_v1_plaintext(note_nonce: &[u8; 32], amount: u128, metadata: &[u8]) -> Vec<u8> {
    const MAGIC: &[u8; 4] = b"PRAF";
    const VERSION: u8 = 1;
    let mut out = Vec::with_capacity(4 + 1 + 32 + 16 + metadata.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(note_nonce);
    out.extend_from_slice(&amount.to_le_bytes());
    out.extend_from_slice(metadata);
    out
}

/// Query state roots directly from L1 node RPC to avoid helper service sync lag.
/// Returns (commitment_root, null ifier_root) as byte arrays.
async fn get_state_roots_from_node(rpc_url: &str) -> Result<([u8; 32], [u8; 32]), String> {
    let client = reqwest::Client::new();

    // Get commitment root
    let commitment_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "1",
        "method": "praph_zk_getCommitmentRoot",
        "params": []
    });

    let commitment_resp = client
        .post(rpc_url)
        .json(&commitment_req)
        .send()
        .await
        .map_err(|e| format!("RPC request failed: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("RPC response parse failed: {}", e))?;

    let commitment_root_hex = commitment_resp
        .get("result")
        .and_then(|r| r.get("commitment_root"))
        .and_then(|v| v.as_str())
        .ok_or("missing commitment_root in response")?;

    // Get nullifier root
    let nullifier_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "2",
        "method": "praph_zk_getNullifierRoot",
        "params": []
    });

    let nullifier_resp = client
        .post(rpc_url)
        .json(&nullifier_req)
        .send()
        .await
        .map_err(|e| format!("RPC request failed: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("RPC response parse failed: {}", e))?;

    let nullifier_root_hex = nullifier_resp
        .get("result")
        .and_then(|r| r.get("nullifier_root"))
        .and_then(|v| v.as_str())
        .ok_or("missing nullifier_root in response")?;

    // Parse hex to bytes
    let c_bytes = hex::decode(commitment_root_hex.trim_start_matches("0x"))
        .map_err(|e| format!("invalid commitment root hex: {}", e))?;
    let n_bytes = hex::decode(nullifier_root_hex.trim_start_matches("0x"))
        .map_err(|e| format!("invalid nullifier root hex: {}", e))?;

    if c_bytes.len() != 32 || n_bytes.len() != 32 {
        return Err("state roots must be 32 bytes".to_string());
    }

    let mut c_arr = [0u8; 32];
    c_arr.copy_from_slice(&c_bytes);
    let mut n_arr = [0u8; 32];
    n_arr.copy_from_slice(&n_bytes);

    Ok((c_arr, n_arr))
}

#[tauri::command]

pub async fn get_balance(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<Balance, String> {
    let active = db::get_active_account_index(&db)?;
    // Sync from helper-service so balance reflects the latest server-visible notes/nullifiers.
    let _ = scan_notes_impl(&wallet, &db, ScanNotesParams { full_rescan: false }).await?;
    let fingerprint = wallet.fingerprint_hex_for_index(active)?;
    Ok(db::get_balance(&db, &fingerprint, active)?)
}

#[tauri::command]
pub fn list_transactions(db: tauri::State<'_, DbState>) -> Result<Vec<TxSummary>, String> {
    // Back-compat: if UI calls this without wallet state, return all.
    db::list_transactions(&db)
}

#[tauri::command]
pub fn list_transactions_for_active_account(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<Vec<TxSummary>, String> {
    let active = db::get_active_account_index(&db)?;
    let fingerprint = wallet.fingerprint_hex_for_index(active)?;
    db::list_transactions_for_account(&db, &fingerprint, active)
}

#[tauri::command]
pub async fn rescan(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let _ = scan_notes_impl(&wallet, &db, ScanNotesParams { full_rescan: true }).await?;
    db::confirm_pending(&db)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum HelperRequest {
    GetMemosByFingerprint { fingerprint: String },
    GetOutgoingMemosBySenderFingerprint { sender_fingerprint: String },
    GetNullifierStatus { nullifier: String },
    GetStateRoots,
    GetNextCommitmentIndex,
    GetCommitmentPathForIndex { commitment_index: u64 },
    GenerateWitnesses { spends: Vec<SpendRequest> },
    SimulateAddCommitments { commitments: Vec<String> },
    GetCommitmentStatus { commitment: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum HelperResponse {
    GetMemosByFingerprintResult {
        notes: Vec<EncryptedNoteResponse>,
    },
    GetOutgoingMemosBySenderFingerprintResult {
        notes: Vec<OutgoingNoteResponse>,
    },
    GetNullifierStatusResult {
        exists: bool,
    },
    StateRootsResult {
        commitment_root: String,
        nullifier_root: String,
    },
    GetNextCommitmentIndexResult {
        commitment_index: u64,
    },
    GetCommitmentPathForIndexResult {
        commitment_path: ApiMerklePath,
        commitment_index: u64,
    },
    GenerateWitnessesResult {
        spend_witnesses_count: usize,
        spend_witnesses: Vec<ApiSpendWitness>,
        success: bool,
    },
    SimulateAddCommitmentsResult {
        new_commitment_root: String,
    },
    CommitmentStatusResult {
        exists: bool,
        commitment_index: Option<u64>,
        tx_hash: Option<String>,
        spent: bool,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedNoteResponse {
    pub commitment: String,
    pub commitment_index: u64,
    pub encrypted_memo: Option<String>,
    pub fingerprint: String,
    pub tx_hash: Option<String>,
    pub sender_fingerprint: Option<String>,
    pub ephemeral_public: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutgoingNoteResponse {
    pub commitment: String,
    pub commitment_index: u64,
    pub outgoing_ciphertext: Option<String>,
    pub tx_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SpendRequest {
    pub commitment_index: u64,
    pub commitment: String,
    pub nullifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiMerklePath {
    pub siblings: Vec<String>,
    pub direction_bits: Vec<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiSpendWitness {
    pub commitment_path: ApiMerklePath,
    pub commitment_index: u64,
    pub nullifier_path: ApiMerklePath,
    pub nullifier_index: u64,
}

fn decrypt_memo_v1(encrypted: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    use aead::generic_array::GenericArray;
    use chacha20poly1305::{AeadInPlace, ChaCha20Poly1305, KeyInit};

    if encrypted.is_empty() {
        return Ok(Vec::new());
    }

    const NONCE_SIZE: usize = 12;
    const TAG_SIZE: usize = 16;
    const MIN_CIPHERTEXT_SIZE: usize = NONCE_SIZE + TAG_SIZE;
    if encrypted.len() < MIN_CIPHERTEXT_SIZE {
        return Err("encrypted memo too short".to_string());
    }

    let nonce_bytes = &encrypted[0..NONCE_SIZE];
    let tag_start = encrypted.len() - TAG_SIZE;
    let ciphertext = &encrypted[NONCE_SIZE..tag_start];
    let tag = &encrypted[tag_start..];

    let key_array = GenericArray::from_slice(key);
    let nonce_array = GenericArray::from_slice(nonce_bytes);
    let cipher = ChaCha20Poly1305::new(key_array);

    let mut plaintext = ciphertext.to_vec();
    let tag_array = GenericArray::from_slice(tag);
    cipher
        .decrypt_in_place_detached(nonce_array, b"", &mut plaintext, tag_array)
        .map_err(|e| format!("memo decryption failed: {e}"))?;
    Ok(plaintext)
}

fn parse_v1_plaintext(plaintext: &[u8]) -> Result<([u8; 32], u128, Vec<u8>), String> {
    const MAGIC: &[u8; 4] = b"PRAF";
    if plaintext.len() < 4 + 1 + 32 + 16 {
        return Err("decrypted memo too short".to_string());
    }
    if &plaintext[0..4] != MAGIC {
        return Err("invalid memo magic".to_string());
    }
    let version = plaintext[4];
    if version != 1 {
        return Err("unsupported memo version".to_string());
    }
    let mut note_nonce = [0u8; 32];
    note_nonce.copy_from_slice(&plaintext[5..37]);
    let mut amount_bytes = [0u8; 16];
    amount_bytes.copy_from_slice(&plaintext[37..53]);
    let amount = u128::from_le_bytes(amount_bytes);
    let metadata = plaintext[53..].to_vec();
    Ok((note_nonce, amount, metadata))
}

fn parse_outgoing_metadata(
    plaintext: &[u8],
) -> Result<
    (
        [u8; 32],
        u128,
        String,
        String,
        Option<String>,
        Option<String>,
    ),
    String,
> {
    if plaintext.len() < 48 {
        return Err("outgoing metadata too short".to_string());
    }
    let mut recipient_fingerprint = [0u8; 32];
    recipient_fingerprint.copy_from_slice(&plaintext[0..32]);
    let mut amount_bytes = [0u8; 16];
    amount_bytes.copy_from_slice(&plaintext[32..48]);
    let amount = u128::from_le_bytes(amount_bytes);

    let remaining = &plaintext[48..];
    // Split by null byte 0u8
    let parts: Vec<&[u8]> = remaining.split(|b| *b == 0).collect();

    let memo = String::from_utf8(parts.get(0).unwrap_or(&&[][..]).to_vec()).unwrap_or_default();
    let tx_id = String::from_utf8(parts.get(1).unwrap_or(&&[][..]).to_vec()).unwrap_or_default();

    // New optional fields
    let fee = parts
        .get(2)
        .map(|b| String::from_utf8(b.to_vec()).unwrap_or_default())
        .filter(|s| !s.is_empty());
    let recipient = parts
        .get(3)
        .map(|b| String::from_utf8(b.to_vec()).unwrap_or_default())
        .filter(|s| !s.is_empty());

    Ok((recipient_fingerprint, amount, memo, tx_id, fee, recipient))
}

async fn scan_notes_impl(
    wallet: &WalletState,
    db: &DbState,
    params: ScanNotesParams,
) -> Result<SyncMetadata, String> {
    use praph_circuits::hash::{fr_from_u64, fr_to_bytes};
    use praph_circuits::keys::IncomingViewingKey;
    use praph_circuits::keys::SpendingKey;
    use praph_circuits::note::Note;

    let helper = db::get_helper_service_url(db)?;
    let current = db::get_sync_metadata(db)?;

    let syncing = SyncMetadata {
        state: SyncState::Syncing,
        message: Some(format!("Syncing via {helper}")),
        last_synced_at: current.last_synced_at,
        last_scanned_height: current.last_scanned_height,
    };
    db::set_sync_metadata(db, &syncing)?;
    let active_account_index = db::get_active_account_index(&db)?;
    let spending_key_bytes = wallet.spending_key_bytes_for_index(active_account_index)?;
    let spending_key = SpendingKey::from_bytes(spending_key_bytes);
    let fvk = spending_key.derive_full_viewing_key();
    let fingerprint_hex = hex::encode(fvk.fingerprint());
    let memo_key = *fvk.memo_key().as_bytes();

    eprintln!("[scan_notes_impl] Using fingerprint: {}", fingerprint_hex);
    eprintln!("[scan_notes_impl] Account index: {}", active_account_index);

    if params.full_rescan {
        // Chain purge or user requested full rescan: clear stale local history so old outgoing txs
        // don't keep subtracting from balance.
        let _ = db::clear_account_history(db, &fingerprint_hex, active_account_index);
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));

    let req = HelperRequest::GetMemosByFingerprint {
        fingerprint: fingerprint_hex.clone(),
    };
    let resp = client
        .post(&url)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let resp: HelperResponse = resp.json().await.map_err(|e| e.to_string())?;

    let notes = match resp {
        HelperResponse::GetMemosByFingerprintResult { notes } => notes,
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("Unexpected helper response".to_string()),
    };

    let mut max_idx: Option<u64> = None;
    let now = crate::unix_ts();

    for note in notes {
        eprintln!(
            "[scan_notes_impl] Processing note: commitment={} index={}",
            note.commitment, note.commitment_index
        );

        let enc_hex = match note.encrypted_memo {
            Some(h) => h,
            None => {
                eprintln!("[scan_notes_impl] Skipping: no encrypted_memo");
                continue;
            }
        };
        let enc_bytes = hex::decode(enc_hex.trim_start_matches("0x")).map_err(|e| e.to_string())?;
        // Try to decrypt memo with TVK (priority) or legacy FVK key
        let plaintext_result = if let Some(ref ephem_hex) = note.ephemeral_public {
            eprintln!(
                "[scan_notes_impl] Attempting TVK decryption with ephemeral_public={}",
                ephem_hex
            );
            if let Ok(ephem_bytes) = hex::decode(ephem_hex.trim_start_matches("0x")) {
                if let Ok(ephem_array) = ephem_bytes.try_into() {
                    use praph_circuits::keys::TransactionViewKey;

                    // Use wallet's FVK to derive IVK
                    let my_ivk = fvk.incoming();
                    let ivk_secret_bytes = my_ivk.as_bytes(); // Returns &[u8; 32] (IVK secret)

                    let tvk = TransactionViewKey::derive_receiver(&ephem_array, ivk_secret_bytes);
                    let shared_secret = tvk.shared_secret();

                    decrypt_memo_v1(&enc_bytes, &shared_secret)
                } else {
                    Err("Invalid ephemeral key length".to_string())
                }
            } else {
                Err("Invalid ephemeral key hex".to_string())
            }
        } else {
            eprintln!("[scan_notes_impl] Attempting legacy FVK memo_key decryption");
            // Legacy fallback: decrypt with FVK-derived memo_key
            decrypt_memo_v1(&enc_bytes, &memo_key)
        };

        let plaintext = match plaintext_result {
            Ok(p) => {
                eprintln!(
                    "[scan_notes_impl] Decryption SUCCESS, plaintext_len={}",
                    p.len()
                );
                p
            }
            Err(e) => {
                eprintln!("[scan_notes_impl] Decryption FAILED: {}", e);
                continue;
            }
        };
        let (note_nonce, amount, metadata) = match parse_v1_plaintext(&plaintext) {
            Ok(v) => {
                eprintln!(
                    "[scan_notes_impl] Parsed: nonce_len={} amount={} metadata_len={}",
                    v.0.len(),
                    v.1,
                    v.2.len()
                );
                v
            }
            Err(e) => {
                eprintln!("[scan_notes_impl] parse_v1_plaintext FAILED: {}", e);
                continue;
            }
        };
        if amount == 0 {
            eprintln!("[scan_notes_impl] Skipping: amount is 0");
            continue;
        }

        let memo_str = std::str::from_utf8(&metadata).ok().map(|s| s.to_string());
        let note_nonce_hex = hex::encode(note_nonce);

        let dummy_commitment = fr_from_u64(0);
        let dummy_ivk = IncomingViewingKey::from_bytes([0u8; 32]);
        let note_obj = Note::new(spending_key, dummy_ivk, 0u128, dummy_commitment, note_nonce);
        let nullifier = note_obj.nullifier(note.commitment_index);
        let nullifier_bytes = fr_to_bytes(&nullifier);
        let nullifier_hex = hex::encode(nullifier_bytes);

        let status_req = HelperRequest::GetNullifierStatus {
            nullifier: nullifier_hex.clone(),
        };
        let status_resp = client
            .post(&url)
            .json(&status_req)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status_resp: HelperResponse = status_resp.json().await.map_err(|e| e.to_string())?;
        let spent = match status_resp {
            HelperResponse::GetNullifierStatusResult { exists } => exists,
            HelperResponse::Error { message } => return Err(message),
            _ => false,
        };

        let amount_minor = if amount > i64::MAX as u128 {
            i64::MAX
        } else {
            amount as i64
        };

        db::upsert_note(
            db,
            &note.commitment,
            note.commitment_index,
            &fingerprint_hex,
            &enc_hex,
            amount_minor,
            memo_str.as_deref(),
            Some(&note_nonce_hex),
            now,
            &nullifier_hex,
            spent,
            note.tx_hash.as_deref(),
            note.sender_fingerprint.as_deref(),
        )?;

        max_idx = Some(
            max_idx
                .map(|m| m.max(note.commitment_index))
                .unwrap_or(note.commitment_index),
        );
    }

    // OVK Scanning: Recover outgoing transactions
    // Only perform if we have the client available (already established)
    {
        // OutgoingViewingKey is already available from fvk.outgoing()
        let sender_ovk = fvk.outgoing();
        // FIXED: Query using IVK fingerprint (stored in DB) instead of OVK bytes
        let sender_fp_hex = hex::encode(fvk.fingerprint());

        let req_out = HelperRequest::GetOutgoingMemosBySenderFingerprint {
            sender_fingerprint: sender_fp_hex,
        };

        if let Ok(resp) = client.post(&url).json(&req_out).send().await {
            if let Ok(HelperResponse::GetOutgoingMemosBySenderFingerprintResult { notes }) =
                resp.json().await
            {
                for note in notes {
                    let enc_hex = match note.outgoing_ciphertext {
                        Some(h) => h,
                        None => continue,
                    };
                    let enc_bytes = match hex::decode(enc_hex.trim_start_matches("0x")) {
                        Ok(b) => b,
                        Err(_) => continue,
                    };

                    // Decrypt with outgoing key
                    let plaintext = match decrypt_memo_v1(&enc_bytes, sender_ovk.as_bytes()) {
                        Ok(p) => {
                            eprintln!(
                                "[OVK] decrypt success: plaintext_len={} first_bytes={:02x?}",
                                p.len(),
                                &p[..p.len().min(64)]
                            );
                            p
                        }
                        Err(e) => {
                            eprintln!("[OVK] decrypt failed: {}", e);
                            continue;
                        }
                    };

                    let (_, amount, memo, tx_id, fee_opt, recipient_opt) =
                        match parse_outgoing_metadata(&plaintext) {
                            Ok(v) => {
                                eprintln!(
                                    "[OVK] parse success: amount={} memo={:?} tx_id={:?} fee={:?} recipient={:?}",
                                    v.1, v.2, v.3, v.4, v.5
                                );
                                v
                            }
                            Err(e) => {
                                eprintln!("[OVK] parse failed: {}", e);
                                continue;
                            }
                        };

                    let tx_id_final = if let Some(hash) = note.tx_hash {
                        eprintln!("[OVK] Using L1 tx_hash from helper: {}", hash);
                        hash // Use real L1 hash if available
                    } else {
                        eprintln!("[OVK] No L1 tx_hash, using parsed tx_id: {}", tx_id);
                        // If no hash from helper (old schema?), stick with UUID
                        tx_id
                    };

                    let amount_abs = amount;
                    let amount_str =
                        format!("{}.{:04} PRAF", amount_abs / 10000, amount_abs % 10000);
                    let fee_str = fee_opt.unwrap_or_else(|| "0.0000 PRAF".to_string());

                    // Insert as confirmed
                    // We use the tx_id_final (hash) as the DB ID if possible.
                    // This resolves "tx_id~" display issue if the UI shows the ID.
                    let _ = db::insert_outgoing(
                        db,
                        tx_id_final,
                        active_account_index,
                        amount_str,
                        fee_str,
                        Some(memo),
                        "confirmed",
                        None,
                        recipient_opt.as_deref(),
                    );
                }
            }
        }
    }

    // Check pending transactions and confirm if their nullifiers are on-chain
    let pending_txs = db::get_pending_transactions_with_nullifiers(db)?;
    for (tx_id, nullifiers) in pending_txs {
        if nullifiers.is_empty() {
            continue;
        }

        let mut all_confirmed = true;
        for nullifier_hex in nullifiers {
            let status_req = HelperRequest::GetNullifierStatus {
                nullifier: nullifier_hex.clone(),
            };
            let status_resp = match client.post(&url).json(&status_req).send().await {
                Ok(resp) => resp,
                Err(e) => {
                    eprintln!("Failed to check nullifier status for tx {}: {}", tx_id, e);
                    all_confirmed = false;
                    break;
                }
            };

            let status_resp: HelperResponse = match status_resp.json().await {
                Ok(resp) => resp,
                Err(e) => {
                    eprintln!(
                        "Failed to parse nullifier status response for tx {}: {}",
                        tx_id, e
                    );
                    all_confirmed = false;
                    break;
                }
            };

            let exists = match status_resp {
                HelperResponse::GetNullifierStatusResult { exists } => exists,
                HelperResponse::Error { message } => {
                    eprintln!(
                        "Helper service error checking nullifier for tx {}: {}",
                        tx_id, message
                    );
                    all_confirmed = false;
                    break;
                }
                _ => {
                    eprintln!("Unexpected response checking nullifier for tx {}", tx_id);
                    false
                }
            };

            if !exists {
                all_confirmed = false;
                break;
            }
        }

        if all_confirmed {
            eprintln!("Confirming transaction: {}", tx_id);
            db::confirm_transaction_by_id(db, &tx_id)?;
        }
    }

    let done = SyncMetadata {
        state: SyncState::Idle,
        message: None,
        last_synced_at: Some(crate::unix_ts()),
        last_scanned_height: max_idx.or(current.last_scanned_height).or(Some(0)),
    };
    db::set_sync_metadata(db, &done)?;

    if params.full_rescan {
        // v0 behavior kept for compatibility: confirm any locally pending outgoing txs.
        let _ = db::confirm_pending(db);
        // Note: OVK-based outgoing transaction recovery is already performed above (non-conditional)
        // with proper parse_outgoing_metadata handling of fee and recipient fields.
    }

    Ok(done)
}

#[tauri::command]
pub async fn scan_notes(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    params: ScanNotesParams,
) -> Result<SyncMetadata, String> {
    scan_notes_impl(&wallet, &db, params).await
}

#[tauri::command]
pub fn get_sync_metadata(db: tauri::State<'_, DbState>) -> Result<SyncMetadata, String> {
    db::get_sync_metadata(&db)
}

#[tauri::command]
pub async fn send_transaction(
    app: tauri::AppHandle,
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    params: SendParams,
) -> Result<SendResult, String> {
    use praph_circuits::action::{BridgeAction, OutputAction, SpendAction};
    use praph_circuits::halo2::enabled::{
        create_client_action_proof, load_output_keys, load_spend_keys, ClientActionCircuit,
    };
    use praph_circuits::hash::{fr_from_bytes, fr_to_bytes};
    use praph_circuits::inputs::{
        ClientPrivateInputs, ClientPublicInputs, MAX_ENCRYPTED_MESSAGE_BYTES,
    };
    use praph_circuits::keys::{IncomingViewingKey, SpendingKey, TransactionViewKey};

    use praph_circuits::merkle::MerklePath;
    use praph_circuits::note::Note;
    use rand::RngCore;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    let tx_id = db::random_id("tx");
    let http = reqwest::Client::new(); // Added http client

    let active_account_index = db::get_active_account_index(&db)?;
    let helper = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));

    let amount_display = if params.amount.contains(' ') {
        params.amount.clone()
    } else {
        format!("{} PRAF", params.amount)
    };
    let amount_minor_i64 = parse_amount_minor(&amount_display);
    if amount_minor_i64 <= 0 {
        return Err("amount must be positive".to_string());
    }
    let amount_minor_u128 = amount_minor_i64 as u128;

    let spending_key_bytes = wallet.spending_key_bytes_for_index(active_account_index)?;
    let sender_sk = SpendingKey::from_bytes(spending_key_bytes);
    let sender_fvk = sender_sk.derive_full_viewing_key();

    // Parse recipient address as IVK bytes (address = SS58(IVK))
    // This is the correct approach for Option 2: sender only needs recipient's IVK
    let to_ivk_bytes = parse_recipient_32(&params.to)?;
    let to_ivk = IncomingViewingKey::from_bytes(to_ivk_bytes);

    let sender_fingerprint = hex::encode(sender_fvk.fingerprint());

    // Parse prover tip amount (raw minor units string)
    let prover_tip_amount: u128 = params.prover_tip.parse().unwrap_or(0);
    let prover_tip_i64 = prover_tip_amount as i64;

    // Fetch prover address from prover service
    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9093".to_string());
    let prover_address_result: Result<String, String> = async {
        let resp = http
            .get(format!("{}/address", prover_url.trim_end_matches('/')))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch prover address: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Prover returned status {}", resp.status()));
        }
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        json.get("address")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Missing address in prover response".to_string())
    }
    .await;

    // ProverTip is mandatory (Low/Medium/High), so we require the prover address.
    // If we can't get it, we must fail rather than silently skipping the tip.
    let prover_address_opt = Some(prover_address_result.map_err(|e| {
        format!(
            "Failed to fetch prover address (required for tip): {}. URL: {}",
            e, prover_url
        )
    })?);

    let spendable = db::list_spendable_notes(&db, &sender_fingerprint)?;
    let mut selected = Vec::new();
    let mut total_selected: i64 = 0;
    // We must select enough for Amount + Tip
    let target_amount = amount_minor_i64 + prover_tip_i64;

    for n in spendable {
        if total_selected >= target_amount {
            break;
        }
        selected.push(n);
        total_selected = total_selected.saturating_add(selected.last().unwrap().amount_minor);
    }
    if total_selected < target_amount {
        return Err(format!(
            "insufficient balance: have {}, need {} (amount {} + tip {})",
            total_selected, target_amount, amount_minor_i64, prover_tip_i64
        ));
    }

    // Calculate actual change amount early (needed for OutputAction creation)
    // total_selected - amount - tip
    let change_amount_minor: i64 = total_selected - amount_minor_i64 - prover_tip_i64;
    let change_amount_u128: u128 = if change_amount_minor <= 0 {
        0
    } else {
        change_amount_minor as u128
    };

    // Get state roots directly from L1 node (not helper) to avoid sync lag
    let rpc_url = db::get_node_rpc_url(&db)?;
    let (commitment_root_bytes, nullifier_root_bytes) = get_state_roots_from_node(&rpc_url).await?;

    let commitment_root_fr = fr_from_bytes(&commitment_root_bytes);
    let nullifier_root_fr = fr_from_bytes(&nullifier_root_bytes);

    let spends_req = selected
        .iter()
        .map(|n| SpendRequest {
            commitment_index: n.commitment_index,
            commitment: n.commitment.clone(),
            nullifier: n.nullifier_hex.clone(),
        })
        .collect::<Vec<_>>();
    let witness_resp = http
        .post(&helper_url)
        .json(&HelperRequest::GenerateWitnesses { spends: spends_req })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let witness_resp: HelperResponse = witness_resp.json().await.map_err(|e| e.to_string())?;
    let witnesses = match witness_resp {
        HelperResponse::GenerateWitnessesResult {
            success: true,
            spend_witnesses,
            ..
        } => spend_witnesses,
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("unexpected helper response".to_string()),
    };
    if witnesses.len() != selected.len() {
        return Err("witness count mismatch".to_string());
    }

    fn parse_api_merkle_path(path: ApiMerklePath) -> Result<MerklePath, String> {
        let mut siblings_fr = Vec::with_capacity(path.siblings.len());
        for s in path.siblings {
            let b = hex::decode(s.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            if b.len() != 32 {
                return Err("invalid merkle sibling".to_string());
            }
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&b);
            siblings_fr.push(fr_from_bytes(&arr));
        }
        Ok(MerklePath::new(siblings_fr, path.direction_bits))
    }

    let sender_recipient_commitment = fr_from_bytes(sender_fvk.incoming().as_bytes());
    let mut spend_actions = Vec::with_capacity(selected.len());
    let mut spend_nullifiers = Vec::with_capacity(selected.len());
    for (n, w) in selected.iter().zip(witnesses.into_iter()) {
        let nonce_raw =
            hex::decode(n.nonce_hex.trim_start_matches("0x")).map_err(|e| e.to_string())?;
        if nonce_raw.len() != 32 {
            return Err("invalid note nonce".to_string());
        }
        let mut nonce = [0u8; 32];
        nonce.copy_from_slice(&nonce_raw);

        let spend_note = Note::new(
            sender_sk,
            sender_fvk.incoming().clone(),
            n.amount_minor as u128,
            sender_recipient_commitment,
            nonce,
        );
        let nullifier = spend_note.nullifier(n.commitment_index);
        spend_nullifiers.push(nullifier);

        let commitment_path = parse_api_merkle_path(w.commitment_path)?;
        let nullifier_path = parse_api_merkle_path(w.nullifier_path)?;

        spend_actions.push(SpendAction::new(
            spend_note,
            commitment_path,
            n.commitment_index,
            nullifier_path,
            w.nullifier_index,
        ));
    }

    let mut rng = ChaCha20Rng::from_entropy();
    let mut output_nonce = [0u8; 32];
    rng.fill_bytes(&mut output_nonce);

    // Use IVK bytes for recipient commitment calculation (Option 2)
    let recipient_commitment = fr_from_bytes(&to_ivk_bytes);
    // Use new_for_recipient - sender doesn't know recipient's SK
    let output_note = Note::new_for_recipient(
        to_ivk.clone(),
        amount_minor_u128,
        recipient_commitment,
        output_nonce,
    );
    let output_commitment = output_note.commitment();
    let output_commitment_bytes = fr_to_bytes(&output_commitment);
    let _output_commitment_hex = hex::encode(output_commitment_bytes);

    let mut output_actions = vec![OutputAction {
        note: output_note.clone(),
        enabled: true,
    }];

    let mut output_commitments = vec![output_commitment];

    // Calculate actual change amount (minus prover tip if prover address available)
    let actual_change_amount = change_amount_u128;

    let mut change_note_opt: Option<(Note, [u8; 32])> = None;
    if actual_change_amount > 0 {
        let mut change_nonce = [0u8; 32];
        rng.fill_bytes(&mut change_nonce);
        let change_note = Note::new(
            sender_sk,
            sender_fvk.incoming().clone(),
            actual_change_amount,
            sender_recipient_commitment,
            change_nonce,
        );
        let change_commitment = change_note.commitment();
        let change_commitment_bytes = fr_to_bytes(&change_commitment);
        output_actions.push(OutputAction {
            note: change_note.clone(),
            enabled: true,
        });
        output_commitments.push(change_commitment);
        change_note_opt = Some((change_note, change_commitment_bytes));
    }

    // Add prover tip Output Action (3rd output - encrypted to prover's address)
    let mut _prover_tip_note_opt: Option<(Note, [u8; 32])> = None;
    if let Some(ref prover_address) = prover_address_opt {
        if prover_tip_amount > 0 {
            // Parse prover's SS58 address to get the public key bytes
            // We need to create a SpendingKey from the prover's public key
            // For now, we use the address string directly as the recipient commitment
            let prover_bytes = parse_recipient_32(prover_address)?;
            let prover_sk = SpendingKey::from_bytes(prover_bytes);
            let prover_fvk = prover_sk.derive_full_viewing_key();
            let prover_recipient_commitment = fr_from_bytes(&prover_bytes);

            let mut tip_nonce = [0u8; 32];
            rng.fill_bytes(&mut tip_nonce);
            let tip_note = Note::new(
                prover_sk,
                prover_fvk.incoming().clone(),
                prover_tip_amount,
                prover_recipient_commitment,
                tip_nonce,
            );
            let tip_commitment = tip_note.commitment();
            let tip_commitment_bytes = fr_to_bytes(&tip_commitment);
            output_actions.push(OutputAction {
                note: tip_note.clone(),
                enabled: true,
            });
            output_commitments.push(tip_commitment);
            _prover_tip_note_opt = Some((tip_note, tip_commitment_bytes));
        }
    }

    let encrypted_l2_message = vec![0xFFu8; MAX_ENCRYPTED_MESSAGE_BYTES];
    let mut public_inputs = ClientPublicInputs {
        commitment_root: commitment_root_fr,
        nullifier_root: nullifier_root_fr,
        next_commitment_root: commitment_root_fr,
        next_nullifier_root: nullifier_root_fr,
        spend_nullifiers: spend_nullifiers.clone(),
        output_commitments: output_commitments.clone(),
        encrypted_l2_message: encrypted_l2_message.clone(),
    };
    public_inputs.pad_in_place();

    // change_amount_u128 already calculated above
    // Fee = (max(N_Spend, N_Output) * L1_base_fee) + prover_tip
    let l1_base_fee_per_action = 0.0001_f64; // PRAF per action
                                             // Prover tip value in PRAF (for display/logging fees)
    let prover_tip_val = (prover_tip_amount as f64) / 10000.0;

    let spend_count = spend_actions.iter().filter(|sa| sa.enabled).count() as f64;
    let output_count = output_actions.iter().filter(|oa| oa.enabled).count() as f64;
    let action_count = spend_count.max(output_count);
    let total_fee_praf = (action_count * l1_base_fee_per_action) + prover_tip_val;
    let total_fee_minor = (total_fee_praf * 10_000.0) as u128; // Convert to minor units (u128 for tx_fee)

    let private_inputs = ClientPrivateInputs {
        spend_actions,
        output_actions,
        bridge_action: BridgeAction {
            encrypted_message: encrypted_l2_message.clone(),
            deposit_value: 0,
        },
        tx_fee: 0, // Public fee is 0 (User pays Tip via ZK Output)
    };

    let keys_dir = resolve_keys_dir(Some(&app))?;
    ensure_client_key_files(&keys_dir)?;
    let (spend_params, spend_pk, _spend_vk) = load_spend_keys(&keys_dir).map_err(|e| {
        format!(
            "failed to load spend keys (keys_dir={}): {e:?}",
            keys_dir.display()
        )
    })?;
    let (output_params, output_pk, _output_vk) = load_output_keys(&keys_dir).map_err(|e| {
        format!(
            "failed to load output keys (keys_dir={}): {e:?}",
            keys_dir.display()
        )
    })?;

    let mut action_proofs_json: Vec<serde_json::Value> = Vec::new();

    // Generate spend proofs in parallel using rayon (CPU-bound, independent proofs)
    use rayon::prelude::*;
    let spend_proof_results: Vec<Result<serde_json::Value, String>> = private_inputs
        .spend_actions
        .par_iter()
        .filter(|sa| sa.enabled)
        .map(|spend_action| {
            // Each thread gets its own RNG for proof generation
            let mut thread_rng = rand::thread_rng();
            let nullifier = spend_action.note.nullifier(spend_action.commitment_index);
            let circuit = ClientActionCircuit::from_spend_action(
                commitment_root_fr,
                nullifier_root_fr,
                spend_action.clone(),
            );
            let proof =
                create_client_action_proof(&spend_params, &spend_pk, &circuit, &mut thread_rng)
                    .map_err(|e| format!("failed to generate spend proof: {e:?}"))?;
            let spend_pi = serde_json::json!({
                "commitment_root": hex::encode(fr_to_bytes(&commitment_root_fr)),
                "nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
                "next_commitment_root": hex::encode(fr_to_bytes(&commitment_root_fr)),
                "next_nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
                "action_output": hex::encode(fr_to_bytes(&nullifier)),
            });
            Ok(serde_json::json!({
                "proof": hex::encode(&proof),
                "public_inputs": spend_pi,
                "action_type": "spend",
            }))
        })
        .collect();

    // Collect parallel results, propagating any errors
    for result in spend_proof_results {
        action_proofs_json.push(result?);
    }

    // Pre-calculate next commitment roots using Helper Service (Merkle Logic)
    // This allows the wallet to know the resulting Merkle Root after insertion.
    let mut output_roots = Vec::new();
    let mut outputs_so_far = Vec::new();

    for output_action in private_inputs.output_actions.iter() {
        if !output_action.enabled {
            continue;
        }

        let commitment = output_action.note.commitment();
        let commitment_hex = hex::encode(fr_to_bytes(&commitment));
        outputs_so_far.push(commitment_hex);

        // Call Helper to simulate adding these commitments
        let mut sim_root = commitment_root_fr;
        let sim_req = HelperRequest::SimulateAddCommitments {
            commitments: outputs_so_far.clone(),
        };
        match http.post(&helper_url).json(&sim_req).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(helper_resp) = resp.json::<HelperResponse>().await {
                    if let HelperResponse::SimulateAddCommitmentsResult {
                        new_commitment_root,
                    } = helper_resp
                    {
                        if let Ok(bytes) = hex::decode(new_commitment_root.trim_start_matches("0x"))
                        {
                            if bytes.len() == 32 {
                                let mut arr = [0u8; 32];
                                arr.copy_from_slice(&bytes);
                                sim_root = fr_from_bytes(&arr);
                            }
                        }
                    }
                }
            }
            _ => {
                // If simulation fails, fallback to current root (won't work but prevents crash)
            }
        }
        output_roots.push(sim_root);
    }
    let mut output_root_iter = output_roots.into_iter();

    let mut chained_commitment_root_fr = commitment_root_fr;
    for output_action in private_inputs.output_actions.iter() {
        if !output_action.enabled {
            continue;
        }
        let commitment = output_action.note.commitment();
        // Use pre-calculated Merkle Root from Helper
        let next_commitment_root = output_root_iter
            .next()
            .unwrap_or(chained_commitment_root_fr);
        let circuit = ClientActionCircuit::from_output_action(
            chained_commitment_root_fr,
            nullifier_root_fr,
            next_commitment_root,
            output_action.clone(),
        );
        let proof = create_client_action_proof(&output_params, &output_pk, &circuit, &mut rng)
            .map_err(|e| format!("failed to generate output proof: {e:?}"))?;
        let out_pi = serde_json::json!({
            "commitment_root": hex::encode(fr_to_bytes(&chained_commitment_root_fr)),
            "nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
            "next_commitment_root": hex::encode(fr_to_bytes(&next_commitment_root)),
            "next_nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
            "action_output": hex::encode(fr_to_bytes(&commitment)),
        });
        action_proofs_json.push(serde_json::json!({
            "proof": hex::encode(&proof),
            "public_inputs": out_pi,
            "action_type": "output",
        }));
        chained_commitment_root_fr = next_commitment_root;
    }

    let mut final_public_inputs = public_inputs.clone();
    final_public_inputs.next_commitment_root = chained_commitment_root_fr;
    let public_inputs_json = serde_json::json!({
        "commitment_root": hex::encode(fr_to_bytes(&final_public_inputs.commitment_root)),
        "nullifier_root": hex::encode(fr_to_bytes(&final_public_inputs.nullifier_root)),
        "next_commitment_root": hex::encode(fr_to_bytes(&final_public_inputs.next_commitment_root)),
        "next_nullifier_root": hex::encode(fr_to_bytes(&final_public_inputs.next_nullifier_root)),
        "spend_nullifiers": final_public_inputs.spend_nullifiers.iter().map(|n| hex::encode(fr_to_bytes(n))).collect::<Vec<_>>(),
        "output_commitments": final_public_inputs.output_commitments.iter().map(|c| hex::encode(fr_to_bytes(c))).collect::<Vec<_>>(),
        "encrypted_l2_message": hex::encode(&final_public_inputs.encrypted_l2_message),
    });

    let memo_text = params.memo.clone().unwrap_or_default();
    let memo_plaintext = build_v1_plaintext(&output_nonce, amount_minor_u128, memo_text.as_bytes());
    let mut memo_nonce = [0u8; 12];
    rng.fill_bytes(&mut memo_nonce);

    // ECDH-based memo encryption using TransactionViewKey
    // 1. Generate ephemeral secret for this transaction
    let mut ephemeral_secret = [0u8; 32];
    rng.fill_bytes(&mut ephemeral_secret);

    // 2. Derive shared secret using sender's ephemeral key + recipient's IVK
    let tvk = TransactionViewKey::derive_sender(&ephemeral_secret, &to_ivk);
    let ephemeral_public = tvk.ephemeral_public();

    // 3. Encrypt memo with shared secret (instead of memo_key)
    let encrypted_memo = encrypt_memo_v1(&memo_plaintext, tvk.shared_secret(), &memo_nonce)?;

    // Use only prover tip as the user-facing fee (network fees are subsidized/handled by prover)
    let fee = format!("{:.4} PRAF", prover_tip_val);

    // OVK: Build outgoing metadata for sender-side recovery
    // Contains: recipient IVK (32 bytes) + amount (16 bytes) + memo text + \0 + tx_id + \0 + fee + \0 + recipient_address
    let mut outgoing_plaintext = Vec::with_capacity(48 + memo_text.len() + 1 + tx_id.len());
    outgoing_plaintext.extend_from_slice(&to_ivk_bytes); // 32 bytes: recipient IVK (used as fingerprint)
    outgoing_plaintext.extend_from_slice(&amount_minor_u128.to_le_bytes()); // 16 bytes: amount
    outgoing_plaintext.extend_from_slice(memo_text.as_bytes()); // variable: memo
    outgoing_plaintext.push(0u8); // Separator
    outgoing_plaintext.extend_from_slice(tx_id.as_bytes()); // variable: tx_id
    outgoing_plaintext.push(0u8); // Separator
    outgoing_plaintext.extend_from_slice(fee.as_bytes()); // variable: fee
    outgoing_plaintext.push(0u8); // Separator
    outgoing_plaintext.extend_from_slice(params.to.as_bytes()); // variable: recipient_address

    // Encrypt with sender's OVK-derived key (using OVK as symmetric key like memo_key)
    let mut outgoing_nonce = [0u8; 12];
    rng.fill_bytes(&mut outgoing_nonce);
    let outgoing_ciphertext = encrypt_memo_v1(
        &outgoing_plaintext,
        sender_fvk.outgoing().as_bytes(),
        &outgoing_nonce,
    )?;

    let mut output_memos_json = Vec::new();
    output_memos_json.push(serde_json::json!({
        "note_commitment": hex::encode(output_commitment_bytes),
        "fingerprint": hex::encode(&to_ivk_bytes), // IVK bytes as fingerprint
        "memo": hex::encode(encrypted_memo),
        "ephemeral_public": hex::encode(ephemeral_public), // For receiver ECDH decryption
        "sender_fingerprint": hex::encode(sender_fvk.fingerprint()),
        "outgoing_ciphertext": hex::encode(&outgoing_ciphertext),
    }));

    if let Some((change_note, change_commitment_bytes)) = &change_note_opt {
        let change_plaintext =
            build_v1_plaintext(&change_note.nonce, change_note.amount, b"change");
        let mut change_nonce = [0u8; 12];
        rng.fill_bytes(&mut change_nonce);
        let encrypted_change = encrypt_memo_v1(
            &change_plaintext,
            sender_fvk.memo_key().as_bytes(),
            &change_nonce,
        )?;
        output_memos_json.push(serde_json::json!({
            "note_commitment": hex::encode(change_commitment_bytes),
            "fingerprint": hex::encode(sender_fvk.fingerprint()),
            "memo": hex::encode(encrypted_change),
        }));
    }

    // Add Prover Tip Memo so Prover can find/decrypt it
    if let Some((tip_note, tip_commitment_bytes)) = &_prover_tip_note_opt {
        if let Some(ref prover_address) = prover_address_opt {
            // Prover IVK bytes from address
            let prover_bytes = parse_recipient_32(prover_address)?;
            let tip_plaintext =
                build_v1_plaintext(&tip_note.nonce, prover_tip_amount, b"prover tip");
            let mut tip_nonce = [0u8; 12];
            rng.fill_bytes(&mut tip_nonce);

            // Encrypt for Prover using ECDH (TVK)
            let mut tip_ephemeral_secret = [0u8; 32];
            rng.fill_bytes(&mut tip_ephemeral_secret);
            let prover_ivk_obj = IncomingViewingKey::from_bytes(prover_bytes);
            let tip_tvk = TransactionViewKey::derive_sender(&tip_ephemeral_secret, &prover_ivk_obj);
            let tip_ephemeral_public = tip_tvk.ephemeral_public();

            let encrypted_tip =
                encrypt_memo_v1(&tip_plaintext, tip_tvk.shared_secret(), &tip_nonce)?;

            output_memos_json.push(serde_json::json!({
                "note_commitment": hex::encode(tip_commitment_bytes),
                "fingerprint": hex::encode(&prover_bytes), // Prover IVK as fingerprint
                "memo": hex::encode(encrypted_tip),
                "ephemeral_public": hex::encode(tip_ephemeral_public),
                "sender_fingerprint": hex::encode(sender_fvk.fingerprint()),
            }));
        }
    }

    let prover_tip = prover_tip_amount;

    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9093".to_string());
    let submit_request = serde_json::json!({
        "public_inputs": public_inputs_json,
        "action_proofs": serde_json::Value::Array(action_proofs_json),
        "output_memos": serde_json::Value::Array(output_memos_json),
        "prover_tip": prover_tip,
    });
    let submit_resp = http
        .post(format!("{}/submit", prover_url.trim_end_matches('/')))
        .json(&submit_request)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !submit_resp.status().is_success() {
        let status = submit_resp.status();
        let text = submit_resp.text().await.unwrap_or_default();
        return Err(format!(
            "prover rejected submission (status {status}): {text}"
        ));
    }

    // Fee calculation logic moved up for OVK
    // Just reusing usage variables if needed or they can be removed if strictly local
    // let prover_tip = ... (already calculated above)

    let nullifier_hexs: Vec<String> = spend_nullifiers
        .iter()
        .map(|n| hex::encode(fr_to_bytes(n)))
        .collect();

    db::insert_outgoing(
        &db,
        tx_id.clone(),
        active_account_index,
        amount_display,
        fee,
        params.memo.clone(),
        "pending",
        Some(nullifier_hexs),
        Some(&params.to), // Recipient SS58 address
    )?;

    // Note: We don't mark notes as spent here. They will be marked as spent
    // when the transaction is confirmed and scan_notes_impl detects the nullifiers on-chain.

    // Poll helper-service for tx_hash (commitment status polling)
    // We poll the output commitment to get the L1 tx_hash
    let output_commitment_hex = hex::encode(output_commitment_bytes);
    let helper_url_base = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper_url_base.trim_end_matches('/'));

    // Spawn async task to poll for tx_hash and update DB
    let tx_id_clone = tx_id.clone();
    let db_path_clone = db.db_path.clone();
    tokio::spawn(async move {
        let db_clone = DbState {
            db_path: db_path_clone,
        };
        let http = reqwest::Client::new();
        let max_attempts = 30; // Poll for up to 30 seconds

        for attempt in 1..=max_attempts {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

            let request = HelperRequest::GetCommitmentStatus {
                commitment: output_commitment_hex.clone(),
            };

            if let Ok(resp) = http.post(&helper_url).json(&request).send().await {
                if let Ok(helper_resp) = resp.json::<HelperResponse>().await {
                    if let HelperResponse::CommitmentStatusResult {
                        tx_hash: Some(hash),
                        ..
                    } = helper_resp
                    {
                        eprintln!("✅ Got tx_hash after {} attempts: {}", attempt, hash);
                        // Update transaction ID with L1 tx_hash
                        if let Err(e) = db::update_outgoing_tx_hash(&db_clone, &tx_id_clone, &hash)
                        {
                            eprintln!("Failed to update tx_hash: {}", e);
                        }
                        return;
                    }
                }
            }
        }
        eprintln!(
            "⚠️  Tx hash polling timeout after {} attempts for tx {}",
            max_attempts, tx_id_clone
        );
    });

    Ok(SendResult { tx_id })
}

#[tauri::command]
pub async fn mint_dev_faucet(
    app: tauri::AppHandle,
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    params: MintDevFaucetParams,
) -> Result<MintDevFaucetResult, String> {
    use praph_circuits::action::OutputAction;
    use praph_circuits::halo2::enabled::{
        create_client_action_proof, load_output_keys, ClientActionCircuit,
    };
    use praph_circuits::hash::{fr_from_bytes, fr_to_bytes};
    use praph_circuits::inputs::{ClientPublicInputs, MAX_ENCRYPTED_MESSAGE_BYTES};
    use praph_circuits::keys::{IncomingViewingKey, SpendingKey, TransactionViewKey};
    use praph_circuits::merkle::MerklePath;
    use praph_circuits::note::Note;
    use rand::RngCore;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    let tx_id = db::random_id("mint");

    let amount_display = if params.amount.contains(' ') {
        params.amount.clone()
    } else {
        format!("{} PRAF", params.amount)
    };
    let amount_minor_i64 = parse_amount_minor(&amount_display);
    if amount_minor_i64 <= 0 {
        return Err("amount must be positive".to_string());
    }
    let amount_minor_u128 = amount_minor_i64 as u128;

    let active_account_index = db::get_active_account_index(&db)?;
    let spending_key_bytes = wallet.spending_key_bytes_for_index(active_account_index)?;
    let to_sk = SpendingKey::from_bytes(spending_key_bytes);
    let to_fvk = to_sk.derive_full_viewing_key();

    let helper = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));
    let http = reqwest::Client::new();

    // Get state roots directly from L1 node (not helper) to avoid sync lag
    let rpc_url = db::get_node_rpc_url(&db)?;
    let (commitment_root_bytes, nullifier_root_bytes) = get_state_roots_from_node(&rpc_url).await?;

    let commitment_root_fr = fr_from_bytes(&commitment_root_bytes);
    let nullifier_root_fr = fr_from_bytes(&nullifier_root_bytes);

    let mut rng = ChaCha20Rng::from_entropy();
    let mut note_nonce = [0u8; 32];
    rng.fill_bytes(&mut note_nonce);

    // For self-mint: use IVK as recipient_commitment basis (consistent with new protocol)
    let to_ivk = to_fvk.incoming();
    let to_ivk_bytes = *to_ivk.as_bytes();
    let recipient_commitment = fr_from_bytes(&to_ivk_bytes);
    // Minting to self - we know our own SK, so use Note::new
    let output_note = Note::new(
        to_sk,
        to_ivk.clone(),
        amount_minor_u128,
        recipient_commitment,
        note_nonce,
    );
    let output_commitment = output_note.commitment();
    let output_commitment_bytes = fr_to_bytes(&output_commitment);
    let output_commitment_hex = hex::encode(output_commitment_bytes);
    let fingerprint_hex = hex::encode(&to_ivk_bytes); // IVK bytes as fingerprint

    // Compute the next commitment root using helper-service's commitment tree.
    // This removes the "fresh chain" limitation by inserting at the current next index.
    let next_index_resp = http
        .post(&helper_url)
        .json(&HelperRequest::GetNextCommitmentIndex)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let next_index_resp: HelperResponse =
        next_index_resp.json().await.map_err(|e| e.to_string())?;
    let next_index = match next_index_resp {
        HelperResponse::GetNextCommitmentIndexResult { commitment_index } => commitment_index,
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("unexpected helper response (GetNextCommitmentIndex)".to_string()),
    };

    let path_resp = http
        .post(&helper_url)
        .json(&HelperRequest::GetCommitmentPathForIndex {
            commitment_index: next_index,
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let path_resp: HelperResponse = path_resp.json().await.map_err(|e| e.to_string())?;
    let api_path = match path_resp {
        HelperResponse::GetCommitmentPathForIndexResult {
            commitment_path, ..
        } => commitment_path,
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("unexpected helper response (GetCommitmentPathForIndex)".to_string()),
    };

    let siblings_fr = api_path
        .siblings
        .iter()
        .map(|h| {
            let bytes = hex::decode(h).map_err(|_| "invalid sibling hex".to_string())?;
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| "invalid sibling length".to_string())?;
            Ok(fr_from_bytes(&arr))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let merkle_path = MerklePath::new(siblings_fr, api_path.direction_bits);
    let next_commitment_root_fr = merkle_path.root(output_commitment);

    let output_action = OutputAction {
        note: output_note.clone(),
        enabled: true,
    };

    let encrypted_l2_message = vec![0u8; MAX_ENCRYPTED_MESSAGE_BYTES];
    let mut public_inputs = ClientPublicInputs {
        commitment_root: commitment_root_fr,
        nullifier_root: nullifier_root_fr,
        next_commitment_root: next_commitment_root_fr,
        next_nullifier_root: nullifier_root_fr,
        spend_nullifiers: vec![],
        output_commitments: vec![output_commitment],
        encrypted_l2_message: encrypted_l2_message.clone(),
    };
    public_inputs.pad_in_place();

    let keys_dir = resolve_keys_dir(Some(&app))?;
    ensure_client_key_files(&keys_dir)?;
    let (output_params, output_pk, _output_vk) = load_output_keys(&keys_dir).map_err(|e| {
        format!(
            "failed to load output keys (keys_dir={}): {e:?}",
            keys_dir.display()
        )
    })?;

    let circuit = ClientActionCircuit::from_output_action(
        commitment_root_fr,
        nullifier_root_fr,
        next_commitment_root_fr,
        output_action,
    );
    let proof = create_client_action_proof(&output_params, &output_pk, &circuit, &mut rng)
        .map_err(|e| format!("failed to generate output proof: {e:?}"))?;

    let memo_text = params.memo.clone().unwrap_or_default();
    let memo_plaintext = build_v1_plaintext(&note_nonce, amount_minor_u128, memo_text.as_bytes());
    let mut memo_nonce = [0u8; 12];
    rng.fill_bytes(&mut memo_nonce);

    // TVK-based ECDH memo encryption (consistent with send_transaction)
    let mut ephemeral_secret = [0u8; 32];
    rng.fill_bytes(&mut ephemeral_secret);
    let tvk = TransactionViewKey::derive_sender(&ephemeral_secret, to_ivk);
    let ephemeral_public = tvk.ephemeral_public();
    let encrypted_memo = encrypt_memo_v1(&memo_plaintext, tvk.shared_secret(), &memo_nonce)?;

    let public_inputs_json = serde_json::json!({
        "commitment_root": hex::encode(fr_to_bytes(&public_inputs.commitment_root)),
        "nullifier_root": hex::encode(fr_to_bytes(&public_inputs.nullifier_root)),
        "next_commitment_root": hex::encode(fr_to_bytes(&public_inputs.next_commitment_root)),
        "next_nullifier_root": hex::encode(fr_to_bytes(&public_inputs.next_nullifier_root)),
        "spend_nullifiers": public_inputs.spend_nullifiers.iter().map(|n| hex::encode(fr_to_bytes(n))).collect::<Vec<_>>(),
        "output_commitments": public_inputs.output_commitments.iter().map(|c| hex::encode(fr_to_bytes(c))).collect::<Vec<_>>(),
        "encrypted_l2_message": hex::encode(&public_inputs.encrypted_l2_message),
    });

    let output_memos_json = vec![serde_json::json!({
        "note_commitment": hex::encode(output_commitment_bytes),
        "fingerprint": hex::encode(&to_ivk_bytes), // IVK bytes as fingerprint
        "memo": hex::encode(encrypted_memo),
        "ephemeral_public": hex::encode(ephemeral_public), // For receiver ECDH decryption
        "sender_fingerprint": hex::encode(to_fvk.outgoing().as_bytes()),
    })];

    let prover_tip: u128 = params.prover_tip.parse().unwrap_or(0);

    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9093".to_string());
    let submit_request = serde_json::json!({
        "proof": hex::encode(&proof),
        "public_inputs": public_inputs_json,
        "output_memos": output_memos_json,
        "prover_tip": prover_tip,
        "dev_faucet": true,
    });
    let submit_resp = http
        .post(format!("{}/submit", prover_url.trim_end_matches('/')))
        .json(&submit_request)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !submit_resp.status().is_success() {
        let status = submit_resp.status();
        let text = submit_resp.text().await.unwrap_or_default();
        return Err(format!(
            "prover rejected submission (status {status}): {text}"
        ));
    }

    // Soft-confirmation: Return immediately after Prover accepts.
    // L1 indexing poll is moved to background so the UI feels instant.
    // Balance will update when user refreshes or periodic sync runs.
    let helper_url_clone = helper_url.clone();
    let fingerprint_clone = fingerprint_hex.clone();
    let commitment_clone = output_commitment_hex.clone();

    tokio::spawn(async move {
        use tokio::time::{sleep, Duration, Instant};
        let http = reqwest::Client::new();
        let deadline = Instant::now() + Duration::from_secs(60);

        loop {
            let resp = http
                .post(&helper_url_clone)
                .json(&HelperRequest::GetMemosByFingerprint {
                    fingerprint: fingerprint_clone.clone(),
                })
                .send()
                .await;

            if let Ok(r) = resp {
                if let Ok(parsed) = r.json::<HelperResponse>().await {
                    if let HelperResponse::GetMemosByFingerprintResult { notes } = parsed {
                        if notes.iter().any(|n| n.commitment == commitment_clone) {
                            eprintln!("✅ Mint indexed on L1. Balance will update on next sync.");
                            break;
                        }
                    }
                }
            }

            if Instant::now() >= deadline {
                eprintln!("⚠️ Background mint indexing poll timed out (60s).");
                break;
            }
            sleep(Duration::from_secs(2)).await;
        }
    });

    Ok(MintDevFaucetResult { tx_id })
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
    // Bridge deposit is currently account-agnostic; treat it as account 0.
    db::insert_outgoing(
        &db,
        tx_id.clone(),
        0,
        amount,
        fee,
        memo,
        "pending",
        None,
        Some(&params.l2_address),
    )?;
    Ok(BridgeDepositResult { tx_id })
}

#[tauri::command]
pub fn wallet_status(wallet: tauri::State<'_, WalletState>) -> Result<WalletStatus, String> {
    wallet.status()
}

#[tauri::command]
pub fn wallet_status_db(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<WalletStatus, String> {
    let mut st = wallet.status()?;
    if !st.has_wallet {
        if db::get_encrypted_seed(&db)?.is_some() {
            st.has_wallet = true;
        }
    }
    Ok(st)
}

#[tauri::command]
pub fn wallet_create(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    password: String,
) -> Result<WalletCreateResult, String> {
    let (res, enc) = wallet.create_with_encrypted_seed(password)?;
    let _ = db::set_encrypted_seed(&db, enc);
    let _ = db::set_account_count(&db, 1);
    let _ = db::set_active_account_index(&db, 0);
    let _ = db::set_account_name_for_index(&db, 0, "Account 1".to_string());
    if let Ok(addr) = wallet.generate_address() {
        let _ = db::set_receive_address_for_index(&db, 0, addr.address);
    }
    Ok(res)
}

#[tauri::command]
pub async fn wallet_import(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    mnemonic: String,
    password: String,
) -> Result<(), String> {
    let enc = wallet.import_with_encrypted_seed(mnemonic, password)?;
    let _ = db::set_encrypted_seed(&db, enc);

    // Account discovery loop
    let mut found_count = 0;
    let mut consecutive_empty = 0;
    // Check up to 50 accounts, stop if 3 consecutive empty
    for i in 0..50 {
        use praph_circuits::keys::SpendingKey;

        // Derive key for this index
        // Since wallet is unlocked by import, valid to call spending_key_bytes_for_index
        let spending_key_bytes = match wallet.spending_key_bytes_for_index(i) {
            Ok(k) => k,
            Err(_) => break, // Should not happen if seed is set
        };
        let sk = SpendingKey::from_bytes(spending_key_bytes);
        let fvk = sk.derive_full_viewing_key();
        let fingerprint = hex::encode(fvk.fingerprint());
        let sender_fingerprint = hex::encode(fvk.outgoing().as_bytes());

        // Check activity via Helper
        let helper_url = db::get_helper_service_url(&db)?;
        let client = reqwest::Client::new();
        let url = format!("{}/api/v1/helper", helper_url.trim_end_matches('/'));

        let req_in = HelperRequest::GetMemosByFingerprint {
            fingerprint: fingerprint.clone(),
        };
        let req_out = HelperRequest::GetOutgoingMemosBySenderFingerprint {
            sender_fingerprint: sender_fingerprint.clone(),
        };

        let resp_in = client.post(&url).json(&req_in).send().await.ok();
        let resp_out = client.post(&url).json(&req_out).send().await.ok();

        let mut active = false;

        if let Some(r) = resp_in {
            if let Ok(HelperResponse::GetMemosByFingerprintResult { notes }) = r.json().await {
                if !notes.is_empty() {
                    active = true;
                }
            }
        }
        if !active {
            if let Some(r) = resp_out {
                if let Ok(HelperResponse::GetOutgoingMemosBySenderFingerprintResult { notes }) =
                    r.json().await
                {
                    if !notes.is_empty() {
                        active = true;
                    }
                }
            }
        }

        // Always include account 0
        if i == 0 {
            active = true;
        }

        if active {
            found_count = i + 1;
            consecutive_empty = 0;
            let _ = db::set_account_name_for_index(&db, i, format!("Account {}", i + 1));
            // Pre-generate address
            let _ = wallet.spending_key_bytes_for_index(i);
            // Wallet internally caches/manages address generation if needed?
            // Actually wallet.generate_address generates for active account?
            // Need to change active account to generate address?
            // generate_address uses active account index.
            let _ = db::set_active_account_index(&db, i);
            if let Ok(addr) = wallet.generate_address() {
                let _ = db::set_receive_address_for_index(&db, i, addr.address);
            }
        } else {
            consecutive_empty += 1;
            if consecutive_empty >= 2 {
                break;
            }
        }
    }

    let _ = db::set_account_count(&db, found_count.max(1));
    let _ = db::set_active_account_index(&db, 0);

    Ok(())
}

#[tauri::command]
pub fn wallet_unlock(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    password: String,
) -> Result<(), String> {
    match wallet.unlock(password.clone()) {
        Ok(()) => Ok(()),
        Err(e) => {
            if e.contains("Wallet seed not found in secure storage") {
                if let Some(enc) = db::get_encrypted_seed(&db)? {
                    return wallet.unlock_with_encrypted_seed(&enc, password);
                }
            }
            Err(e)
        }
    }
}

#[tauri::command]
pub fn debug_probe_seed_entries(
    wallet: tauri::State<'_, WalletState>,
) -> Result<Vec<String>, String> {
    let found = wallet.probe_seed_entries()?;
    Ok(found
        .into_iter()
        .map(|(service, username)| format!("{service}::{username}"))
        .collect())
}

#[tauri::command]
pub fn debug_probe_seed_entries_verbose(
    wallet: tauri::State<'_, WalletState>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let (candidates, found, errors) = wallet.probe_seed_entries_verbose()?;
    let mut out = std::collections::HashMap::new();
    out.insert(
        "candidates".to_string(),
        candidates
            .into_iter()
            .map(|(s, u)| format!("{s}::{u}"))
            .collect(),
    );
    out.insert(
        "found".to_string(),
        found
            .into_iter()
            .map(|(s, u)| format!("{s}::{u}"))
            .collect(),
    );
    out.insert("errors".to_string(), errors);
    Ok(out)
}

#[tauri::command]
pub fn wallet_lock(wallet: tauri::State<'_, WalletState>) -> Result<(), String> {
    wallet.lock()
}

#[tauri::command]
pub fn wallet_logout(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let _ = wallet.delete_seed_from_secure_storage();
    let _ = wallet.lock();
    db::reset_wallet_data(&db)?;
    Ok(())
}

#[tauri::command]
pub fn generate_address(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<AddressResult, String> {
    let active = db::get_active_account_index(&db)?;
    if let Some(address) = db::get_receive_address_for_index(&db, active)? {
        // Legacy demo format used `praph1...` (not SS58). Regenerate if detected.
        if !address.starts_with("praph1") {
            return Ok(AddressResult { address });
        }
    }
    let res = wallet.generate_address_for_index(active)?;
    db::set_receive_address_for_index(&db, active, res.address.clone())?;
    Ok(res)
}

#[tauri::command]
pub fn get_accounts_state(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<AccountsState, String> {
    let count = db::get_account_count(&db)?;
    let active = db::get_active_account_index(&db)?;
    let mut accounts = Vec::new();

    for idx in 0..count {
        let name = db::get_account_name_for_index(&db, idx)?
            .unwrap_or_else(|| format!("Account {}", idx + 1));
        let address = match db::get_receive_address_for_index(&db, idx)? {
            Some(a) if !a.is_empty() && !a.starts_with("praph1") => a,
            _ => {
                let a = wallet.generate_address_for_index(idx)?.address;
                db::set_receive_address_for_index(&db, idx, a.clone())?;
                a
            }
        };

        let zk_address = wallet.generate_zk_address_for_index(idx)?;

        accounts.push(AccountInfo {
            index: idx,
            name,
            address,
            zk_address,
            is_active: idx == active,
        });
    }

    Ok(AccountsState {
        accounts,
        active_account_index: active,
    })
}

#[tauri::command]
pub fn create_account(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<AccountsState, String> {
    create_account_named(wallet, db, None)
}

#[tauri::command]
pub fn create_account_named(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    name: Option<String>,
) -> Result<AccountsState, String> {
    let count = db::get_account_count(&db)?;
    let new_index = count;
    db::set_account_count(&db, count.saturating_add(1))?;

    let nm = name.unwrap_or_else(|| format!("Account {}", new_index + 1));
    db::set_account_name_for_index(&db, new_index, nm)?;

    let address = wallet.generate_address_for_index(new_index)?.address;
    db::set_receive_address_for_index(&db, new_index, address)?;

    // Keep active account unchanged.
    get_accounts_state(wallet, db)
}

#[tauri::command]
pub fn switch_account(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    account_index: u32,
) -> Result<AccountsState, String> {
    let count = db::get_account_count(&db)?;
    if account_index >= count {
        return Err("Account index out of range".to_string());
    }
    db::set_active_account_index(&db, account_index)?;

    // Ensure address exists for this account.
    if db::get_receive_address_for_index(&db, account_index)?.is_none() {
        let address = wallet.generate_address_for_index(account_index)?.address;
        db::set_receive_address_for_index(&db, account_index, address)?;
    }

    get_accounts_state(wallet, db)
}

#[tauri::command]
pub fn rename_account(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    account_index: u32,
    new_name: String,
) -> Result<AccountsState, String> {
    let count = db::get_account_count(&db)?;
    if account_index >= count {
        return Err("Account index out of range".to_string());
    }
    db::set_account_name_for_index(&db, account_index, new_name)?;
    get_accounts_state(wallet, db)
}

#[tauri::command]
pub async fn discover_accounts(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<Vec<AccountInfo>, String> {
    // Start from index 0 and check if each account has any transaction history
    // Stop when we find 20 consecutive unused accounts (BIP-44 gap limit)
    const GAP_LIMIT: u32 = 20;
    let mut discovered_accounts = Vec::new();
    let mut gap_count = 0u32;
    let mut index = 0u32;

    let helper = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));
    let http = reqwest::Client::new();

    while gap_count < GAP_LIMIT && index < 1000 {
        // Derive the fingerprint for this account
        let fingerprint = wallet.fingerprint_hex_for_index(index)?;

        // Query helper service for any notes with this fingerprint
        let req = HelperRequest::GetMemosByFingerprint {
            fingerprint: fingerprint.clone(),
        };

        let resp = match http.post(&helper_url).json(&req).send().await {
            Ok(r) => r,
            Err(_) => {
                // Network error, stop discovery
                break;
            }
        };

        let resp: HelperResponse = match resp.json().await {
            Ok(r) => r,
            Err(_) => break,
        };

        let has_transactions = match resp {
            HelperResponse::GetMemosByFingerprintResult { notes } => !notes.is_empty(),
            _ => false,
        };

        if has_transactions {
            // Account is used, add it to discovered list
            gap_count = 0;

            // Get or create account name
            let name = db::get_account_name_for_index(&db, index)?
                .unwrap_or_else(|| format!("Account {}", index + 1));

            // Ensure address is stored
            let address = wallet.generate_address_for_index(index)?.address;
            let _ = db::set_receive_address_for_index(&db, index, address.clone());
            let _ = db::set_account_name_for_index(&db, index, name.clone());

            let zk_address = wallet.generate_zk_address_for_index(index)?;

            discovered_accounts.push(AccountInfo {
                index,
                name,
                address,
                zk_address,
                is_active: false,
            });
        } else {
            gap_count += 1;
        }

        index += 1;
    }

    // Update account count to include all discovered accounts
    if !discovered_accounts.is_empty() {
        let max_index = discovered_accounts
            .iter()
            .map(|a| a.index)
            .max()
            .unwrap_or(0);
        let new_count = max_index + 1;
        let current_count = db::get_account_count(&db)?;
        if new_count > current_count {
            db::set_account_count(&db, new_count)?;
        }
    }

    Ok(discovered_accounts)
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

// =============================================================================
// L2 ETH Wallet Commands
// =============================================================================

use crate::types::{L2AddressResult, L2Balance, L2Config, L2SendParams, L2SendResult};

/// Get L2 ETH address for the active account
#[tauri::command]
pub fn get_l2_address(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<L2AddressResult, String> {
    let active = db::get_active_account_index(&db)?;
    let l1_address = wallet.generate_address_for_index(active)?.address;
    let l2_address = wallet.eth_address_for_index(active)?;
    Ok(L2AddressResult {
        l1_address,
        l2_address,
    })
}

/// Get L2 balance (ETH and wPRAF) for the active account
#[tauri::command]
pub async fn get_l2_balance(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<L2Balance, String> {
    let active = db::get_active_account_index(&db)?;
    let eth_address = wallet.eth_address_for_index(active)?;

    // Get L2 RPC URL from settings or use default
    let l2_rpc_url =
        db::get_l2_rpc_url(&db).unwrap_or_else(|_| "http://localhost:8545".to_string());
    let wpraf_address = db::get_wpraf_address(&db).ok();

    let config = crate::l2_client::L2Config {
        rpc_url: l2_rpc_url,
        wpraf_address,
        bridge_address: None,
        chain_id: 1337,
    };

    let client = crate::l2_client::L2Client::new(config)?;
    let balance = client.get_balance(&eth_address).await?;

    Ok(L2Balance {
        praf: balance.praf,
        wpraf: balance.wpraf,
        address: eth_address,
    })
}

/// Send L2 transaction (ETH or wPRAF)
#[tauri::command]
pub async fn send_l2_transaction(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    params: L2SendParams,
) -> Result<L2SendResult, String> {
    let active = db::get_active_account_index(&db)?;
    let private_key = wallet.derive_eth_key(active)?;

    // Get L2 config
    let l2_rpc_url =
        db::get_l2_rpc_url(&db).unwrap_or_else(|_| "http://localhost:8545".to_string());
    let wpraf_address = db::get_wpraf_address(&db).ok();

    let config = crate::l2_client::L2Config {
        rpc_url: l2_rpc_url,
        wpraf_address,
        bridge_address: None,
        chain_id: 1337,
    };

    let client = crate::l2_client::L2Client::new(config)?;
    let l2_params = crate::l2_client::L2SendParams {
        to: params.to,
        amount: params.amount,
        token: params.token,
        gas_price: None,
    };

    let result = client.send_transaction(l2_params, &private_key).await?;

    Ok(L2SendResult {
        tx_hash: result.tx_hash,
        status: result.status,
    })
}

/// Get L2 configuration
#[tauri::command]
pub fn get_l2_config(db: tauri::State<'_, DbState>) -> Result<L2Config, String> {
    let rpc_url = db::get_l2_rpc_url(&db).unwrap_or_else(|_| "http://localhost:8545".to_string());
    let wpraf_address = db::get_wpraf_address(&db).ok();
    let bridge_address = db::get_bridge_address(&db).ok();

    Ok(L2Config {
        rpc_url,
        wpraf_address,
        bridge_address,
        chain_id: 1337,
    })
}

/// Set L2 RPC URL
#[tauri::command]
pub fn set_l2_rpc_url(db: tauri::State<'_, DbState>, url: String) -> Result<(), String> {
    db::set_l2_rpc_url(&db, url)
}

/// Set wPRAF contract address
#[tauri::command]
pub fn set_wpraf_address(db: tauri::State<'_, DbState>, address: String) -> Result<(), String> {
    db::set_wpraf_address(&db, address)
}

/// Set Bridge contract address
#[tauri::command]
pub fn set_bridge_address(db: tauri::State<'_, DbState>, address: String) -> Result<(), String> {
    db::set_bridge_address(&db, address)
}

/// Withdraw L2 funds (burn wPRAF)
#[tauri::command]
pub async fn withdraw_l2_funds(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    amount: String,
) -> Result<String, String> {
    let active = db::get_active_account_index(&db)?;
    let private_key = wallet.derive_eth_key(active)?;

    // Get L2 config
    let l2_rpc_url =
        db::get_l2_rpc_url(&db).unwrap_or_else(|_| "http://localhost:8545".to_string());
    let wpraf_address = db::get_wpraf_address(&db).ok();
    // Bridge address not needed for burn, but good to have in config
    let bridge_address = db::get_bridge_address(&db).ok();

    let config = crate::l2_client::L2Config {
        rpc_url: l2_rpc_url,
        wpraf_address,
        bridge_address,
        chain_id: 1337,
    };

    let client = crate::l2_client::L2Client::new(config)?;
    let tx_hash = client.burn_wpraf(amount, &private_key).await?;

    Ok(tx_hash)
}

#[tauri::command]
pub async fn get_fee_estimates() -> Result<crate::types::FeeEstimates, String> {
    // 1. Get Prover URL (env or default)
    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9093".to_string());

    // 2. Default fallback
    let default_estimates = crate::types::FeeEstimates {
        base_fee: 1,
        min_tip_per_action: 1,
        average_tip: 5,
    };

    // 3. Fetch
    let client = reqwest::Client::new();
    let url = format!("{}/fee-estimate", prover_url);

    match client.get(&url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<crate::types::FeeEstimates>().await {
                    Ok(est) => Ok(est),
                    Err(e) => {
                        println!("Failed to parse fee estimates: {}. Using defaults.", e);
                        Ok(default_estimates)
                    }
                }
            } else {
                println!(
                    "Prover returned error for fee estimate: {}. Using defaults.",
                    resp.status()
                );
                Ok(default_estimates)
            }
        }
        Err(e) => {
            println!(
                "Failed to contact prover for fee estimate: {}. Using defaults.",
                e
            );
            Ok(default_estimates)
        }
    }
}
