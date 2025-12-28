use crate::types::{AddressResult, TvkResult, ViewingKeysResult, WalletCreateResult, WalletStatus};
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use base64::prelude::*;
use bip39::{Language, Mnemonic};
use k256::elliptic_curve::sec1::ToEncodedPoint;
use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use zeroize::Zeroizing;

fn ss58check_encode(prefix: u16, account_id_32: &[u8; 32]) -> Result<String, String> {
    use blake2::digest::Digest;
    use blake2::Blake2b512;

    // SS58 format for prefix < 64: single byte.
    if prefix >= 64 {
        return Err("SS58 prefix >= 64 not supported".to_string());
    }
    let prefix_byte = prefix as u8;

    let mut data = Vec::with_capacity(1 + 32 + 2);
    data.push(prefix_byte);
    data.extend_from_slice(account_id_32);

    // Checksum: first 2 bytes of blake2b("SS58PRE" ++ data)
    let mut hasher = Blake2b512::new();
    hasher.update(b"SS58PRE");
    hasher.update(&data);
    let hash = hasher.finalize();
    data.extend_from_slice(&hash[..2]);

    Ok(bs58::encode(data).into_string())
}

pub struct WalletState {
    pub keyring_service: String,
    pub keyring_service_fallbacks: Vec<String>,
    pub keyring_username: String,
    pub keyring_username_fallbacks: Vec<String>,
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
    fn entry_for_service_and_username(
        &self,
        service: &str,
        username: &str,
    ) -> Result<Entry, String> {
        Entry::new(service, username).map_err(|e| e.to_string())
    }

    fn entry_primary(&self) -> Result<Entry, String> {
        self.entry_for_service_and_username(&self.keyring_service, &self.keyring_username)
    }

    fn persist_encrypted_seed_primary(&self, enc: &str) -> Result<(), String> {
        // Write then read-back to ensure the OS keychain actually persisted the item.
        // This catches cases where set_password returns Ok but nothing is stored due to
        // environment/permission/sandbox issues.
        let entry = self.entry_primary()?;
        entry.set_password(enc).map_err(|e| {
            let msg = e.to_string();
            eprintln!(
                "keychain set_password failed service={} username={}: {}",
                self.keyring_service, self.keyring_username, msg
            );
            msg
        })?;
        match entry.get_password() {
            Ok(read_back) => {
                if read_back != enc {
                    eprintln!(
                        "keychain persist verification mismatch service={} username={}: read_back_len={} expected_len={}",
                        self.keyring_service,
                        self.keyring_username,
                        read_back.len(),
                        enc.len()
                    );
                    return Err(
                        "Failed to persist wallet seed to secure storage (keychain verification mismatch)"
                            .to_string(),
                    );
                }
                eprintln!(
                    "keychain persist verification OK service={} username={} len={}",
                    self.keyring_service,
                    self.keyring_username,
                    read_back.len()
                );
                Ok(())
            }
            Err(e) => {
                eprintln!(
                    "keychain persist verification failed for service={} username={}: {}",
                    self.keyring_service, self.keyring_username, e
                );
                Err(format!(
                    "Failed to persist wallet seed to secure storage (keychain write verification failed): {e}"
                ))
            }
        }
    }

    pub fn debug_keychain_roundtrip(&self) -> Result<String, String> {
        let service = format!("{}.debug", self.keyring_service);
        let username = "keychain_roundtrip_test";
        let payload = format!("test_{}", crate::unix_ts());

        let entry = self.entry_for_service_and_username(&service, username)?;
        entry.set_password(&payload).map_err(|e| e.to_string())?;
        let got = entry.get_password().map_err(|e| e.to_string())?;
        if got != payload {
            return Err("Keychain roundtrip mismatch".to_string());
        }
        Ok(format!("OK service={service} username={username}"))
    }

    pub fn debug_wallet_seed_storage_status(
        &self,
    ) -> Result<(bool, bool, Vec<String>, Vec<String>, Vec<String>), String> {
        // returns:
        // (primary_readable, scan_found, services, usernames, errors)
        let services = self.candidate_services();
        let usernames = self.candidate_usernames();

        let mut errors: Vec<String> = Vec::new();

        let primary_readable = match self.entry_primary()?.get_password() {
            Ok(_) => true,
            Err(keyring::Error::NoEntry) => false,
            Err(e) => {
                errors.push(format!(
                    "primary get_password error service={} username={}: {e}",
                    self.keyring_service, self.keyring_username
                ));
                false
            }
        };

        let mut scan_found = false;
        for service in services.iter() {
            for username in usernames.iter() {
                let entry = self.entry_for_service_and_username(service, username)?;
                match entry.get_password() {
                    Ok(_) => {
                        scan_found = true;
                        break;
                    }
                    Err(keyring::Error::NoEntry) => {}
                    Err(e) => errors.push(format!(
                        "scan get_password error service={service} username={username}: {e}"
                    )),
                }
            }
            if scan_found {
                break;
            }
        }

        Ok((primary_readable, scan_found, services, usernames, errors))
    }

    fn candidate_services(&self) -> Vec<String> {
        let mut out = Vec::with_capacity(1 + self.keyring_service_fallbacks.len());
        out.push(self.keyring_service.clone());
        for s in &self.keyring_service_fallbacks {
            if !out.contains(s) {
                out.push(s.clone());
            }
        }
        out
    }

    fn candidate_usernames(&self) -> Vec<String> {
        let mut out = Vec::with_capacity(1 + self.keyring_username_fallbacks.len());
        out.push(self.keyring_username.clone());
        for u in &self.keyring_username_fallbacks {
            if !out.contains(u) {
                out.push(u.clone());
            }
        }
        out
    }

    fn load_encrypted_seed_from_any_entry(&self) -> Result<((String, String), String), String> {
        // returns ((service_name, username), encrypted_payload_json)
        let services = self.candidate_services();
        let usernames = self.candidate_usernames();

        let mut non_noentry_errors: Vec<String> = Vec::new();
        for service in services.iter() {
            for username in usernames.iter() {
                let entry = self.entry_for_service_and_username(&service, &username)?;
                match entry.get_password() {
                    Ok(enc) => {
                        if enc.trim().is_empty() {
                            continue;
                        }
                        return Ok(((service.clone(), username.clone()), enc));
                    }
                    Err(keyring::Error::NoEntry) => continue,
                    Err(e) => {
                        non_noentry_errors.push(format!(
                            "keychain get_password error service={service} username={username}: {e}"
                        ));
                        continue;
                    }
                }
            }
        }

        let debug_enabled = std::env::var("PRAPH_WALLET_DEBUG").ok().as_deref() == Some("1");
        if debug_enabled {
            eprintln!(
                "wallet seed lookup: no entry found. candidates services={:?} usernames={:?}",
                services, usernames
            );
            if !non_noentry_errors.is_empty() {
                eprintln!(
                    "wallet seed lookup: encountered non-NoEntry keychain errors: {:?}",
                    non_noentry_errors
                );
            }
        }
        Err("Wallet seed not found in secure storage. Please create/import again.".to_string())
    }

    pub fn probe_seed_entries(&self) -> Result<Vec<(String, String)>, String> {
        let mut found = Vec::new();
        for service in self.candidate_services() {
            for username in self.candidate_usernames() {
                let entry = self.entry_for_service_and_username(&service, &username)?;
                match entry.get_password() {
                    Ok(_) => found.push((service.clone(), username.clone())),
                    Err(keyring::Error::NoEntry) => {}
                    Err(_e) => {}
                }
            }
        }
        Ok(found)
    }

    pub fn probe_seed_entries_verbose(
        &self,
    ) -> Result<(Vec<(String, String)>, Vec<(String, String)>, Vec<String>), String> {
        // returns (candidates, found, errors)
        let services = self.candidate_services();
        let usernames = self.candidate_usernames();

        let mut candidates = Vec::new();
        for s in &services {
            for u in &usernames {
                candidates.push((s.clone(), u.clone()));
            }
        }

        let mut found = Vec::new();
        let mut errors = Vec::new();
        for (service, username) in candidates.iter() {
            let entry = self.entry_for_service_and_username(service, username)?;
            match entry.get_password() {
                Ok(_) => found.push((service.clone(), username.clone())),
                Err(keyring::Error::NoEntry) => {}
                Err(e) => errors.push(format!("service={service} username={username} error={e}",)),
            }
        }
        Ok((candidates, found, errors))
    }

    pub fn status(&self) -> Result<WalletStatus, String> {
        let has_wallet = self.load_encrypted_seed_from_any_entry().is_ok();

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

    pub fn create_with_encrypted_seed(
        &self,
        password: String,
    ) -> Result<(WalletCreateResult, String), String> {
        let password = password.trim().to_string();
        let mut rng = rand::thread_rng();
        let mnemonic = Mnemonic::generate_in_with(&mut rng, Language::English, 24)
            .map_err(|e| e.to_string())?;
        // Store ENTROPY (32 bytes) instead of SEED (64 bytes).
        // This is crucial for matching Substrate's standard sr25519 derivation which uses entropy.
        let entropy = mnemonic.to_entropy();
        let enc = encrypt_seed(&entropy, &password)?;
        eprintln!(
            "keychain write seed (entropy): service={} username={} (create)",
            self.keyring_service, self.keyring_username
        );
        self.persist_encrypted_seed_primary(&enc)?;

        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(entropy));

        Ok((
            WalletCreateResult {
                mnemonic: mnemonic.to_string(),
            },
            enc,
        ))
    }

    pub fn create(&self, password: String) -> Result<WalletCreateResult, String> {
        let (res, _enc) = self.create_with_encrypted_seed(password)?;
        Ok(res)
    }

    pub fn import_with_encrypted_seed(
        &self,
        mnemonic: String,
        password: String,
    ) -> Result<String, String> {
        let password = password.trim().to_string();
        let mnemonic = Mnemonic::parse_in_normalized(Language::English, &mnemonic)
            .map_err(|e| e.to_string())?;
        // Store ENTROPY (32 bytes)
        let entropy = mnemonic.to_entropy();
        let enc = encrypt_seed(&entropy, &password)?;
        eprintln!(
            "keychain write seed (entropy): service={} username={} (import)",
            self.keyring_service, self.keyring_username
        );
        self.persist_encrypted_seed_primary(&enc)?;

        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(entropy));
        Ok(enc)
    }

    pub fn import(&self, mnemonic: String, password: String) -> Result<(), String> {
        let _enc = self.import_with_encrypted_seed(mnemonic, password)?;
        Ok(())
    }

    pub fn unlock_with_encrypted_seed(&self, enc: &str, password: String) -> Result<(), String> {
        let password = password.trim().to_string();
        let seed = decrypt_seed(enc, &password)?;
        let mut guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        *guard = Some(Zeroizing::new(seed));
        Ok(())
    }

    pub fn unlock(&self, password: String) -> Result<(), String> {
        let password = password.trim().to_string();
        let ((service, _username), enc) = self.load_encrypted_seed_from_any_entry()?;
        let seed = decrypt_seed(&enc, &password)?;

        // If the entry was found under a legacy service name, migrate it to the primary.
        // If found under any legacy (service, username), migrate it to primary.
        if service != self.keyring_service {
            let _ = self
                .entry_primary()
                .and_then(|e| e.set_password(&enc).map_err(|e| e.to_string()));
        } else {
            // Service matches; still ensure primary username is populated.
            let _ = self
                .entry_primary()
                .and_then(|e| e.set_password(&enc).map_err(|e| e.to_string()));
        }
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

    pub fn delete_seed_from_secure_storage(&self) -> Result<(), String> {
        // Best-effort: remove any entries across candidate services/usernames.
        for service in self.candidate_services() {
            for username in self.candidate_usernames() {
                let entry = self.entry_for_service_and_username(&service, &username)?;
                // This keyring crate version does not expose a delete API.
                // Overwrite with empty string and treat empty as missing in reads.
                let _ = entry.set_password("");
            }
        }

        // Also clear in-memory seed.
        let _ = self.lock();
        Ok(())
    }

    fn derive_account_id(entropy: &[u8], account_index: u32) -> Result<[u8; 32], String> {
        use sp_core::{sr25519, Pair};

        // Reconstruct Mnemonic from ENTROPY (stored as 'seed' in wallet state)
        if entropy.len() != 32 {
            return Err(format!(
                "Invalid entropy length: {} (expected 32)",
                entropy.len()
            ));
        }
        let mnemonic = bip39::Mnemonic::from_entropy(entropy)
            .map_err(|e| format!("Invalid entropy: {}", e))?;
        let phrase = mnemonic.to_string();

        // Substrate standard derivation using PHRASE
        // "phrase //index"
        // This invokes Substrate's internal BIP39->Seed logic, matching 'praph-node key inspect'
        let derive_path = if account_index == 0 {
            phrase.to_string()
        } else {
            format!("{}//{}", phrase, account_index)
        };

        // Create pair from format string
        let derived_pair = sr25519::Pair::from_string(&derive_path, None)
            .map_err(|e| format!("Failed to derive sr25519 pair: {:?}", e))?;

        // 3. Use the first 32 bytes of the SECRET KEY as SpendingKey
        // The sr25519 secret key is 64 bytes (secret + nonce).
        // Substrate uses the first 32 bytes as the "mini secret" or scalar source.
        let full_secret = derived_pair.as_ref().secret.to_bytes();
        let mut secret_32 = [0u8; 32];
        secret_32.copy_from_slice(&full_secret[0..32]);

        Ok(secret_32)
    }

    /// Helper to get full sr25519 pair for an index (for public key extraction)
    fn derive_sr25519_pair(
        entropy: &[u8],
        account_index: u32,
    ) -> Result<sp_core::sr25519::Pair, String> {
        use sp_core::{sr25519, Pair};

        if entropy.len() != 32 {
            return Err(format!(
                "Invalid entropy length: {} (expected 32)",
                entropy.len()
            ));
        }
        let mnemonic = bip39::Mnemonic::from_entropy(entropy)
            .map_err(|e| format!("Invalid entropy: {}", e))?;
        let phrase = mnemonic.to_string();

        let derive_path = if account_index == 0 {
            phrase.to_string()
        } else {
            format!("{}//{}", phrase, account_index)
        };

        sr25519::Pair::from_string(&derive_path, None)
            .map_err(|e| format!("Failed to derive sr25519 pair: {:?}", e))
    }

    pub fn spending_key_bytes_for_index(&self, account_index: u32) -> Result<[u8; 32], String> {
        let guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        let seed = guard
            .as_ref()
            .ok_or_else(|| "Wallet is locked".to_string())?;
        Self::derive_account_id(seed, account_index)
    }

    pub fn fingerprint_hex_for_index(&self, account_index: u32) -> Result<String, String> {
        use praph_circuits::keys::SpendingKey;
        let sk_bytes = self.spending_key_bytes_for_index(account_index)?;
        let sk = SpendingKey::from_bytes(sk_bytes);
        let fvk = sk.derive_full_viewing_key();
        // Use IVK bytes as fingerprint (consistent with new address system)
        Ok(hex::encode(fvk.incoming().as_bytes()))
    }

    pub fn generate_address_for_index(&self, account_index: u32) -> Result<AddressResult, String> {
        // Option 2: SS58 Address = IVK
        // This ensures that the address displayed in the wallet (and used by senders) matches
        // the Incoming Viewing Key (IVK) used by the recipient to scan for notes.
        // Previously, this used sr25519 public key, which caused a mismatch where funds were sent
        // to an address the recipient wasn't scanning.
        let address = self.generate_zk_address_for_index(account_index)?;
        Ok(AddressResult { address })
    }

    pub fn generate_zk_address_for_index(&self, account_index: u32) -> Result<String, String> {
        use praph_circuits::keys::SpendingKey;

        let guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        let seed = guard
            .as_ref()
            .ok_or_else(|| "Wallet is locked".to_string())?;

        // Derive SpendingKey -> FVK -> IVK
        let sk_bytes = Self::derive_account_id(seed, account_index)?;
        let sk = SpendingKey::from_bytes(sk_bytes);
        let fvk = sk.derive_full_viewing_key();
        let ivk = fvk.incoming();

        // Encode IVK as SS58 address (prefix 42 for PRAPH)
        let address = ss58check_encode(42, ivk.as_bytes())?;
        Ok(address)
    }

    pub fn generate_address(&self) -> Result<AddressResult, String> {
        self.generate_address_for_index(0)
    }

    pub fn export_viewing_keys(&self, password: String) -> Result<ViewingKeysResult, String> {
        let password = password.trim().to_string();
        let (_k, enc) = self.load_encrypted_seed_from_any_entry()?;
        let seed = Zeroizing::new(decrypt_seed(&enc, &password)?);

        let fvk = derive_key_hex(&seed, b"praph_fvk_salt__")?;
        let ivk = derive_key_hex(&seed, b"praph_ivk_salt__")?;
        let ovk = derive_key_hex(&seed, b"praph_ovk_salt__")?;

        Ok(ViewingKeysResult { fvk, ivk, ovk })
    }

    pub fn export_tvk(&self, tx_id: String, password: String) -> Result<TvkResult, String> {
        let password = password.trim().to_string();
        let (_k, enc) = self.load_encrypted_seed_from_any_entry()?;
        let seed = Zeroizing::new(decrypt_seed(&enc, &password)?);

        let salt = salt16_from_str(&tx_id);
        let tvk = derive_key_hex(&seed, &salt)?;
        Ok(TvkResult { tvk })
    }

    /// Derive Ethereum private key for L2 wallet using BIP44: m/44'/60'/0'/0/n
    /// This uses the standard Ethereum derivation path for compatibility
    pub fn derive_eth_key(&self, account_index: u32) -> Result<[u8; 32], String> {
        use bip32::{ChildNumber, XPrv};

        let guard = self
            .unlocked_seed
            .lock()
            .map_err(|_| "Wallet state lock poisoned".to_string())?;
        let seed = guard
            .as_ref()
            .ok_or_else(|| "Wallet is locked".to_string())?;

        if seed.len() < 32 {
            return Err("Seed too short".to_string());
        }

        // BIP-44 derivation path for Ethereum: m/44'/60'/0'/0/n
        // We stored the ENTROPY (32 bytes). But BIP32 needs the 64-byte BIP39 SEED.
        // Re-derive the seed from entropy.
        let mnemonic = bip39::Mnemonic::from_entropy(seed)
            .map_err(|e| format!("Invalid entropy for BIP39: {}", e))?;
        let bip39_seed = mnemonic.to_seed_normalized("");

        // 60 is Ethereum's registered coin type
        let root_key =
            XPrv::new(&bip39_seed).map_err(|e| format!("Failed to create master key: {}", e))?;

        // m/44' (purpose)
        let purpose =
            ChildNumber::new(44, true).map_err(|e| format!("Invalid purpose index: {}", e))?;
        let purpose_key = root_key
            .derive_child(purpose)
            .map_err(|e| format!("Failed to derive purpose key: {}", e))?;

        // m/44'/60' (coin type - Ethereum)
        let coin_type =
            ChildNumber::new(60, true).map_err(|e| format!("Invalid coin type index: {}", e))?;
        let coin_key = purpose_key
            .derive_child(coin_type)
            .map_err(|e| format!("Failed to derive coin key: {}", e))?;

        // m/44'/60'/0' (account - always 0 for now)
        let account =
            ChildNumber::new(0, true).map_err(|e| format!("Invalid account index: {}", e))?;
        let account_key = coin_key
            .derive_child(account)
            .map_err(|e| format!("Failed to derive account key: {}", e))?;

        // m/44'/60'/0'/0 (change - external)
        let change =
            ChildNumber::new(0, false).map_err(|e| format!("Invalid change index: {}", e))?;
        let change_key = account_key
            .derive_child(change)
            .map_err(|e| format!("Failed to derive change key: {}", e))?;

        // m/44'/60'/0'/0/n (address index)
        let address_index = ChildNumber::new(account_index, false)
            .map_err(|e| format!("Invalid address index: {}", e))?;
        let final_key = change_key
            .derive_child(address_index)
            .map_err(|e| format!("Failed to derive final key: {}", e))?;

        // Extract the 32-byte private key
        let private_key_bytes = final_key.private_key().to_bytes();
        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(&private_key_bytes);
        Ok(key_bytes)
    }

    /// Get Ethereum address for L2 wallet
    /// Returns the checksummed Ethereum address (0x...)
    pub fn eth_address_for_index(&self, account_index: u32) -> Result<String, String> {
        use sha3::{Digest, Keccak256};

        let private_key = self.derive_eth_key(account_index)?;

        // Derive public key from private key using secp256k1
        use bip32::secp256k1::SecretKey;
        let secret_key = SecretKey::from_slice(&private_key)
            .map_err(|e| format!("Invalid private key: {}", e))?;
        let public_key = secret_key.public_key();
        let public_key_bytes = public_key.to_encoded_point(false);
        let public_key_bytes = public_key_bytes.as_bytes();

        // Ethereum address = last 20 bytes of Keccak256(public_key[1..65])
        let hash = Keccak256::digest(&public_key_bytes[1..65]);
        let address_bytes = &hash[12..32];

        // Checksum encoding (EIP-55)
        let hex_addr = hex::encode(address_bytes);
        let checksum_hash = Keccak256::digest(hex_addr.as_bytes());
        let mut checksummed = String::with_capacity(42);
        checksummed.push_str("0x");

        for (i, c) in hex_addr.chars().enumerate() {
            if c.is_ascii_digit() {
                checksummed.push(c);
            } else {
                let nibble = (checksum_hash[i / 2] >> (if i % 2 == 0 { 4 } else { 0 })) & 0xf;
                if nibble >= 8 {
                    checksummed.push(c.to_ascii_uppercase());
                } else {
                    checksummed.push(c);
                }
            }
        }

        Ok(checksummed)
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
        .map_err(|_| "Invalid password".to_string())
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
