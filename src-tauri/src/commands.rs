use crate::db;
use crate::db::DbState;
use crate::types::{
    AddressResult, AppInfo, Balance, BridgeDepositParams, BridgeDepositResult, ScanNotesParams,
    SendParams, SendResult, Settings, SyncMetadata, SyncState, TxSummary, WalletCreateResult,
    WalletStatus,
};
use crate::wallet::WalletState;
use serde::{Deserialize, Serialize};

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
    GetNullifierStatus { nullifier: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum HelperResponse {
    GetMemosByFingerprintResult { notes: Vec<EncryptedNoteResponse> },
    GetNullifierStatusResult { exists: bool },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedNoteResponse {
    pub commitment: String,
    pub commitment_index: u64,
    pub encrypted_memo: Option<String>,
    pub fingerprint: String,
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

    let spending_key_bytes = {
        let guard = wallet
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        let seed = guard.as_ref().ok_or_else(|| "Wallet is locked".to_string())?;
        if seed.len() < 32 {
            return Err("Seed too short".to_string());
        }
        let mut out = [0u8; 32];
        out.copy_from_slice(&seed[..32]);
        out
    };
    let spending_key = SpendingKey::from_bytes(spending_key_bytes);
    let fvk = spending_key.derive_full_viewing_key();
    let fingerprint_hex = hex::encode(fvk.fingerprint());
    let memo_key = *fvk.memo_key().as_bytes();

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
        let enc_hex = match note.encrypted_memo {
            Some(h) => h,
            None => continue,
        };
        let enc_bytes = hex::decode(enc_hex.trim_start_matches("0x")).map_err(|e| e.to_string())?;
        let plaintext = match decrypt_memo_v1(&enc_bytes, &memo_key) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let (note_nonce, amount, metadata) = match parse_v1_plaintext(&plaintext) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if amount == 0 {
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
        )?;

        max_idx = Some(max_idx.map(|m| m.max(note.commitment_index)).unwrap_or(note.commitment_index));
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
    db: tauri::State<'_, DbState>,
    password: String,
) -> Result<WalletCreateResult, String> {
    let res = wallet.create(password)?;
    if let Ok(addr) = wallet.generate_address() {
        let _ = db::set_receive_address(&db, addr.address);
    }
    Ok(res)
}

#[tauri::command]
pub fn wallet_import(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    mnemonic: String,
    password: String,
) -> Result<(), String> {
    wallet.import(mnemonic, password)?;
    if let Ok(addr) = wallet.generate_address() {
        let _ = db::set_receive_address(&db, addr.address);
    }
    Ok(())
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
pub fn generate_address(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<AddressResult, String> {
    if let Some(address) = db::get_receive_address(&db)? {
        return Ok(AddressResult { address });
    }
    let res = wallet.generate_address()?;
    db::set_receive_address(&db, res.address.clone())?;
    Ok(res)
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
