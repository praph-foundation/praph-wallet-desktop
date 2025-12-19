use crate::db;
use crate::db::DbState;
use crate::types::{
    AddressResult, AppInfo, Balance, BridgeDepositParams, BridgeDepositResult, ScanNotesParams,
    MintDevFaucetParams, MintDevFaucetResult, SendParams, SendResult, Settings, SyncMetadata,
    SyncState, TxSummary, WalletCreateResult, WalletStatus,
};
use crate::wallet::WalletState;
use serde::{Deserialize, Serialize};
use tauri::Manager;

fn resolve_keys_dir(app: Option<&tauri::AppHandle>) -> Result<std::path::PathBuf, String> {
    use std::path::PathBuf;

    if let Ok(v) = std::env::var("PRAPH_CLIENT_KEYS_DIR") {
        if !v.trim().is_empty() {
            return Ok(PathBuf::from(v));
        }
    }
    if let Ok(v) = std::env::var("PRAPH_KEYS_DIR") {
        if !v.trim().is_empty() {
            return Ok(PathBuf::from(v));
        }
    }

    // Prefer bundled resources/keys when available.
    if let Some(app) = app {
        use tauri::path::BaseDirectory;
        if let Ok(p) = app.path().resolve("keys", BaseDirectory::Resource) {
            if p.is_dir() {
                return Ok(p);
            }
        }
        if let Ok(p) = app.path().resolve("resources/keys", BaseDirectory::Resource) {
            if p.is_dir() {
                return Ok(p);
            }
        }
    }

    // Fallbacks: current working directory ./keys, or sibling PRAPH repo ../PRAPH/keys.
    let cwd_keys = PathBuf::from("./keys");
    if cwd_keys.is_dir() {
        return Ok(cwd_keys);
    }

    if let Ok(cwd) = std::env::current_dir() {
        let sibling = cwd.join("../PRAPH/keys");
        if sibling.is_dir() {
            return Ok(sibling);
        }
    }

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
        return Err(format!("SS58 prefix mismatch (expected {expected_prefix}, got {prefix})"));
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

#[tauri::command]
pub async fn get_balance(
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
) -> Result<Balance, String> {
    // Sync from helper-service so balance reflects the latest server-visible notes/nullifiers.
    let _ = scan_notes_impl(&wallet, &db, ScanNotesParams { full_rescan: false }).await?;
    Ok(db::get_balance(&db)?)
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
    GetStateRoots,
    GenerateWitnesses { spends: Vec<SpendRequest> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum HelperResponse {
    GetMemosByFingerprintResult { notes: Vec<EncryptedNoteResponse> },
    GetNullifierStatusResult { exists: bool },
    StateRootsResult {
        commitment_root: String,
        nullifier_root: String,
    },
    GenerateWitnessesResult {
        spend_witnesses_count: usize,
        spend_witnesses: Vec<ApiSpendWitness>,
        success: bool,
    },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedNoteResponse {
    pub commitment: String,
    pub commitment_index: u64,
    pub encrypted_memo: Option<String>,
    pub fingerprint: String,
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
pub async fn send_transaction(
    app: tauri::AppHandle,
    wallet: tauri::State<'_, WalletState>,
    db: tauri::State<'_, DbState>,
    params: SendParams,
) -> Result<SendResult, String> {
    use praph_circuits::action::{BridgeAction, OutputAction, SpendAction};
    use praph_circuits::hash::{fr_from_bytes, fr_to_bytes, poseidon_hash};
    use praph_circuits::inputs::{ClientPrivateInputs, ClientPublicInputs, MAX_ENCRYPTED_MESSAGE_BYTES};
    use praph_circuits::keys::SpendingKey;
    use praph_circuits::merkle::MerklePath;
    use praph_circuits::note::Note;
    use praph_circuits::halo2::enabled::{create_client_action_proof, load_output_keys, load_spend_keys, ClientActionCircuit};
    use rand::RngCore;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    let tx_id = db::random_id("tx");

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

    let fee = "0.0100 PRAF".to_string();

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
    let sender_sk = SpendingKey::from_bytes(spending_key_bytes);
    let sender_fvk = sender_sk.derive_full_viewing_key();

    let to_bytes = parse_recipient_32(&params.to)?;
    let to_sk = SpendingKey::from_bytes(to_bytes);
    let to_fvk = to_sk.derive_full_viewing_key();

    let spendable = db::list_spendable_notes(&db)?;
    let mut selected = Vec::new();
    let mut total_selected: i64 = 0;
    for n in spendable {
        if total_selected >= amount_minor_i64 {
            break;
        }
        selected.push(n);
        total_selected = total_selected.saturating_add(selected.last().unwrap().amount_minor);
    }
    if total_selected < amount_minor_i64 {
        return Err("insufficient balance".to_string());
    }
    let change_amount_minor: i64 = total_selected - amount_minor_i64;
    let change_amount_u128: u128 = if change_amount_minor <= 0 { 0 } else { change_amount_minor as u128 };

    let helper = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));
    let http = reqwest::Client::new();

    let roots_resp = http
        .post(&helper_url)
        .json(&HelperRequest::GetStateRoots)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let roots_resp: HelperResponse = roots_resp.json().await.map_err(|e| e.to_string())?;
    let (commitment_root_bytes, nullifier_root_bytes) = match roots_resp {
        HelperResponse::StateRootsResult {
            commitment_root,
            nullifier_root,
        } => {
            let c = hex::decode(commitment_root.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            let n = hex::decode(nullifier_root.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            if c.len() != 32 || n.len() != 32 {
                return Err("invalid state roots".to_string());
            }
            let mut c_arr = [0u8; 32];
            c_arr.copy_from_slice(&c);
            let mut n_arr = [0u8; 32];
            n_arr.copy_from_slice(&n);
            (c_arr, n_arr)
        }
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("unexpected helper response".to_string()),
    };
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

    let sender_recipient_commitment = fr_from_bytes(&spending_key_bytes);
    let mut spend_actions = Vec::with_capacity(selected.len());
    let mut spend_nullifiers = Vec::with_capacity(selected.len());
    for (n, w) in selected.iter().zip(witnesses.into_iter()) {
        let nonce_raw = hex::decode(n.nonce_hex.trim_start_matches("0x")).map_err(|e| e.to_string())?;
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

    let recipient_commitment = fr_from_bytes(&to_bytes);
    let output_note = Note::new(
        to_sk,
        to_fvk.incoming().clone(),
        amount_minor_u128,
        recipient_commitment,
        output_nonce,
    );
    let output_commitment = output_note.commitment();
    let output_commitment_bytes = fr_to_bytes(&output_commitment);
    let output_commitment_hex = hex::encode(output_commitment_bytes);

    let mut output_actions = vec![OutputAction {
        note: output_note.clone(),
        enabled: true,
    }];

    let mut output_commitments = vec![output_commitment];

    let mut change_note_opt: Option<(Note, [u8; 32])> = None;
    if change_amount_u128 > 0 {
        let mut change_nonce = [0u8; 32];
        rng.fill_bytes(&mut change_nonce);
        let change_note = Note::new(
            sender_sk,
            sender_fvk.incoming().clone(),
            change_amount_u128,
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

    let private_inputs = ClientPrivateInputs {
        spend_actions,
        output_actions,
        bridge_action: BridgeAction {
            encrypted_message: encrypted_l2_message.clone(),
            deposit_value: 0,
        },
        tx_fee: 0,
    };

    let keys_dir = resolve_keys_dir(Some(&app))?;
    ensure_client_key_files(&keys_dir)?;
    let (spend_params, spend_pk, _spend_vk) = load_spend_keys(&keys_dir)
        .map_err(|e| format!("failed to load spend keys (keys_dir={}): {e:?}", keys_dir.display()))?;
    let (output_params, output_pk, _output_vk) = load_output_keys(&keys_dir)
        .map_err(|e| format!("failed to load output keys (keys_dir={}): {e:?}", keys_dir.display()))?;

    let mut action_proofs_json: Vec<serde_json::Value> = Vec::new();

    for spend_action in private_inputs.spend_actions.iter() {
        if !spend_action.enabled {
            continue;
        }
        let nullifier = spend_action.note.nullifier(spend_action.commitment_index);
        let circuit = ClientActionCircuit::from_spend_action(
            commitment_root_fr,
            nullifier_root_fr,
            spend_action.clone(),
        );
        let proof = create_client_action_proof(&spend_params, &spend_pk, &circuit, &mut rng)
            .map_err(|e| format!("failed to generate spend proof: {e:?}"))?;
        let spend_pi = serde_json::json!({
            "commitment_root": hex::encode(fr_to_bytes(&commitment_root_fr)),
            "nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
            "next_commitment_root": hex::encode(fr_to_bytes(&commitment_root_fr)),
            "next_nullifier_root": hex::encode(fr_to_bytes(&nullifier_root_fr)),
            "action_output": hex::encode(fr_to_bytes(&nullifier)),
        });
        action_proofs_json.push(serde_json::json!({
            "proof": hex::encode(&proof),
            "public_inputs": spend_pi,
            "action_type": "spend",
        }));
    }

    let mut chained_commitment_root_fr = commitment_root_fr;
    for output_action in private_inputs.output_actions.iter() {
        if !output_action.enabled {
            continue;
        }
        let commitment = output_action.note.commitment();
        let next_commitment_root = poseidon_hash(&[chained_commitment_root_fr, commitment]);
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
    let encrypted_memo = encrypt_memo_v1(&memo_plaintext, to_fvk.memo_key().as_bytes(), &memo_nonce)?;
    let mut output_memos_json = Vec::new();
    output_memos_json.push(serde_json::json!({
        "note_commitment": hex::encode(output_commitment_bytes),
        "fingerprint": hex::encode(to_fvk.fingerprint()),
        "memo": hex::encode(encrypted_memo),
    }));

    if let Some((change_note, change_commitment_bytes)) = &change_note_opt {
        let change_plaintext = build_v1_plaintext(&change_note.nonce, change_amount_u128, b"change");
        let mut change_nonce = [0u8; 12];
        rng.fill_bytes(&mut change_nonce);
        let encrypted_change =
            encrypt_memo_v1(&change_plaintext, sender_fvk.memo_key().as_bytes(), &change_nonce)?;
        output_memos_json.push(serde_json::json!({
            "note_commitment": hex::encode(change_commitment_bytes),
            "fingerprint": hex::encode(sender_fvk.fingerprint()),
            "memo": hex::encode(encrypted_change),
        }));
    }

    let prover_tip = match params.prover_tip {
        crate::types::ProverTip::Low => 0u128,
        crate::types::ProverTip::Medium => 1u128,
        crate::types::ProverTip::High => 3u128,
    };

    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9091".to_string());
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
        return Err(format!("prover rejected submission (status {status}): {text}"));
    }

    db::insert_outgoing(&db, tx_id.clone(), amount_display, fee, params.memo.clone())?;
    let spent_commitments = selected.into_iter().map(|n| n.commitment).collect::<Vec<_>>();
    db::mark_notes_spent(&db, &spent_commitments)?;

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
    use praph_circuits::hash::{fr_from_bytes, fr_to_bytes, poseidon_hash_two};
    use praph_circuits::inputs::{ClientPublicInputs, MAX_ENCRYPTED_MESSAGE_BYTES};
    use praph_circuits::keys::SpendingKey;
    use praph_circuits::merkle::{empty_leaf, MERKLE_TREE_DEPTH};
    use praph_circuits::note::Note;
    use praph_circuits::halo2::enabled::{create_client_action_proof, load_output_keys, ClientActionCircuit};
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
    let to_sk = SpendingKey::from_bytes(spending_key_bytes);
    let to_fvk = to_sk.derive_full_viewing_key();

    let helper = db::get_helper_service_url(&db)?;
    let helper_url = format!("{}/api/v1/helper", helper.trim_end_matches('/'));
    let http = reqwest::Client::new();

    let roots_resp = http
        .post(&helper_url)
        .json(&HelperRequest::GetStateRoots)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let roots_resp: HelperResponse = roots_resp.json().await.map_err(|e| e.to_string())?;
    let (commitment_root_bytes, nullifier_root_bytes) = match roots_resp {
        HelperResponse::StateRootsResult {
            commitment_root,
            nullifier_root,
        } => {
            let c = hex::decode(commitment_root.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            let n = hex::decode(nullifier_root.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            if c.len() != 32 || n.len() != 32 {
                return Err("invalid state roots".to_string());
            }
            let mut c_arr = [0u8; 32];
            c_arr.copy_from_slice(&c);
            let mut n_arr = [0u8; 32];
            n_arr.copy_from_slice(&n);
            (c_arr, n_arr)
        }
        HelperResponse::Error { message } => return Err(message),
        _ => return Err("unexpected helper response".to_string()),
    };

    let commitment_root_fr = fr_from_bytes(&commitment_root_bytes);
    let nullifier_root_fr = fr_from_bytes(&nullifier_root_bytes);

    let mut rng = ChaCha20Rng::from_entropy();
    let mut note_nonce = [0u8; 32];
    rng.fill_bytes(&mut note_nonce);

    let recipient_commitment = fr_from_bytes(&spending_key_bytes);
    let output_note = Note::new(
        to_sk,
        to_fvk.incoming().clone(),
        amount_minor_u128,
        recipient_commitment,
        note_nonce,
    );
    let output_commitment = output_note.commitment();
    let output_commitment_bytes = fr_to_bytes(&output_commitment);
    let output_commitment_hex = hex::encode(output_commitment_bytes);
    let fingerprint_hex = hex::encode(to_fvk.fingerprint());

    // NOTE: This dev faucet mint implementation currently only supports the
    // first insertion (commitment index 0) on a fresh chain, because the wallet
    // does not yet have output insertion witnesses for arbitrary indices.
    let mut empty_roots = Vec::with_capacity(MERKLE_TREE_DEPTH + 1);
    empty_roots.push(empty_leaf());
    for i in 0..MERKLE_TREE_DEPTH {
        let prev = empty_roots[i];
        empty_roots.push(poseidon_hash_two(&prev, &prev));
    }

    let empty_commitment_root = empty_roots[MERKLE_TREE_DEPTH];
    if commitment_root_fr != empty_commitment_root {
        return Err(format!(
            "dev faucet mint currently requires a fresh chain (empty commitment tree). Current commitment_root={} . Restart testnet (purge) and try again.",
            hex::encode(fr_to_bytes(&commitment_root_fr))
        ));
    }

    let mut next_commitment_root_fr = poseidon_hash_two(&output_commitment, &empty_leaf());
    for level in 1..MERKLE_TREE_DEPTH {
        next_commitment_root_fr = poseidon_hash_two(&next_commitment_root_fr, &empty_roots[level]);
    }

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
    let (output_params, output_pk, _output_vk) = load_output_keys(&keys_dir)
        .map_err(|e| format!("failed to load output keys (keys_dir={}): {e:?}", keys_dir.display()))?;

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
    let encrypted_memo = encrypt_memo_v1(&memo_plaintext, to_fvk.memo_key().as_bytes(), &memo_nonce)?;

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
        "fingerprint": hex::encode(to_fvk.fingerprint()),
        "memo": hex::encode(encrypted_memo),
    })];

    let prover_tip = match params.prover_tip {
        crate::types::ProverTip::Low => 0u128,
        crate::types::ProverTip::Medium => 1u128,
        crate::types::ProverTip::High => 3u128,
    };

    let prover_url = std::env::var("PRAPH_PROVER_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9091".to_string());
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
        return Err(format!("prover rejected submission (status {status}): {text}"));
    }

    // Wait for helper-service to index the minted commitment before scanning.
    // Otherwise scan_notes may return no notes and the UI won't show updated balance.
    {
        use tokio::time::{sleep, Duration, Instant};
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            let resp = http
                .post(&helper_url)
                .json(&HelperRequest::GetMemosByFingerprint {
                    fingerprint: fingerprint_hex.clone(),
                })
                .send()
                .await;

            if let Ok(r) = resp {
                if let Ok(parsed) = r.json::<HelperResponse>().await {
                    match parsed {
                        HelperResponse::GetMemosByFingerprintResult { notes } => {
                            if notes.iter().any(|n| n.commitment == output_commitment_hex) {
                                break;
                            }
                        }
                        HelperResponse::Error { message } => {
                            return Err(format!("helper-service error while waiting for mint indexing: {message}"));
                        }
                        _ => {}
                    }
                }
            }

            if Instant::now() >= deadline {
                return Err(format!(
                    "timeout waiting for helper-service to index minted note_commitment={}",
                    output_commitment_hex
                ));
            }
            sleep(Duration::from_secs(2)).await;
        }
    }

    let _ = scan_notes_impl(&wallet, &db, ScanNotesParams { full_rescan: false }).await?;
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
        // Legacy demo format used `praph1...` (not SS58). Regenerate if detected.
        if !address.starts_with("praph1") {
            return Ok(AddressResult { address });
        }
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
