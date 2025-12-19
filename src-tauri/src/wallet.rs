use crate::types::{AddressResult, TvkResult, ViewingKeysResult, WalletCreateResult, WalletStatus};
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

pub struct WalletState {
    pub keyring_service: String,
    pub keyring_username: String,
    pub unlocked_seed: Mutex<Option<Zeroizing<Vec<u8>>>>,
}

fn derive_key_hex(seed: &[u8], salt_16: &[u8; 16]) -> Result<String, String> {
    let mut out = [0u8; 32];
    Argon2::default()
        .hash_password_into(seed, salt_16, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(to_hex(&out))
}

fn salt16_from_str(s: &str) -> [u8; 16] {
    let mut salt = [0u8; 16];
    let bytes = s.as_bytes();
    for (i, b) in bytes.iter().take(16).enumerate() {
        salt[i] = *b;
    }
    salt
}

impl WalletState {
    fn entry(&self) -> Result<Entry, String> {
        Entry::new(&self.keyring_service, &self.keyring_username).map_err(|e| e.to_string())
    }

    pub fn status(&self) -> Result<WalletStatus, String> {
        let entry = self.entry()?;
        let has_wallet = match entry.get_password() {
            Ok(_) => true,
            Err(keyring::Error::NoEntry) => false,
            Err(e) => return Err(e.to_string()),
        };

        let is_unlocked = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?
            .is_some();

        Ok(WalletStatus {
            has_wallet,
            is_unlocked,
        })
    }

    pub fn create(&self, password: String) -> Result<WalletCreateResult, String> {
        let mut rng = rand::thread_rng();
        let mnemonic = Mnemonic::generate_in_with(&mut rng, Language::English, 24)
            .map_err(|e| e.to_string())?;
        let seed = mnemonic.to_seed_normalized("");
        let enc = encrypt_seed(&seed, &password)?;
        self.entry()?.set_password(&enc).map_err(|e| e.to_string())?;

        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(seed.to_vec()));

        Ok(WalletCreateResult {
            mnemonic: mnemonic.to_string(),
        })
    }

    pub fn import(&self, mnemonic: String, password: String) -> Result<(), String> {
        let mnemonic = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
            .map_err(|e| e.to_string())?;
        let seed = mnemonic.to_seed_normalized("");
        let enc = encrypt_seed(&seed, &password)?;
        self.entry()?.set_password(&enc).map_err(|e| e.to_string())?;

        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(seed.to_vec()));
        Ok(())
    }

    pub fn unlock(&self, password: String) -> Result<(), String> {
        let enc = self.entry()?.get_password().map_err(|e| e.to_string())?;
        let seed = decrypt_seed(&enc, &password)?;
        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(seed));
        Ok(())
    }

    pub fn lock(&self) -> Result<(), String> {
        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = None;
        Ok(())
    }

    pub fn generate_address(&self) -> Result<AddressResult, String> {
        let guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        let seed = guard.as_ref().ok_or_else(|| "Wallet is locked".to_string())?;
        let hex = to_hex(&seed[..std::cmp::min(seed.len(), 20)]);
        Ok(AddressResult {
            address: format!("praph1{}", hex),
        })
    }

    pub fn export_viewing_keys(&self, password: String) -> Result<ViewingKeysResult, String> {
        let enc = self.entry()?.get_password().map_err(|e| e.to_string())?;
        let seed = Zeroizing::new(decrypt_seed(&enc, &password)?);

        let fvk = derive_key_hex(&seed, b"praph_fvk_salt__")?;
        let ivk = derive_key_hex(&seed, b"praph_ivk_salt__")?;
        let ovk = derive_key_hex(&seed, b"praph_ovk_salt__")?;

        Ok(ViewingKeysResult { fvk, ivk, ovk })
    }

    pub fn export_tvk(&self, tx_id: String, password: String) -> Result<TvkResult, String> {
        let enc = self.entry()?.get_password().map_err(|e| e.to_string())?;
        let seed = Zeroizing::new(decrypt_seed(&enc, &password)?);

        let salt = salt16_from_str(&tx_id);
        let tvk = derive_key_hex(&seed, &salt)?;
        Ok(TvkResult { tvk })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedSeed {
    kdf: String,
    salt_b64: String,
    nonce_b64: String,
    ciphertext_b64: String,
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

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
