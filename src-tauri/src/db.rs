use crate::types::{Balance, SyncMetadata, SyncState, TxDirection, TxStatus, TxSummary};
use directories::ProjectDirs;
use rand::RngCore;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct NoteRow {
    pub commitment: String,
    pub commitment_index: u64,
    pub amount_minor: i64,
    pub memo: Option<String>,
    pub received_at: u64,
    pub spent: bool,
}

pub struct DbState {
    pub db_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct SpendableNoteRow {
    pub commitment: String,
    pub commitment_index: u64,
    pub amount_minor: i64,
    pub nonce_hex: String,
    pub nullifier_hex: String,
}

pub fn wallet_db_path(identifier: &str) -> Result<PathBuf, String> {
    let proj = ProjectDirs::from("org", "praph", identifier)
        .ok_or_else(|| "Failed to resolve app data directory".to_string())?;
    let dir = proj.data_local_dir();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(dir.join("wallet.sqlite3"))
}

fn open_db(db: &DbState) -> Result<Connection, String> {
    Connection::open(&db.db_path).map_err(|e| e.to_string())
}

pub fn init_db(db: &DbState) -> Result<(), String> {
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
        CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);\
        CREATE TABLE IF NOT EXISTS notes (\
            commitment TEXT PRIMARY KEY,\
            commitment_index INTEGER NOT NULL,\
            fingerprint TEXT NOT NULL,\
            encrypted_memo TEXT,\
            amount_minor INTEGER NOT NULL,\
            memo TEXT,\
            nonce TEXT,\
            received_at INTEGER NOT NULL,\
            nullifier TEXT,\
            spent INTEGER NOT NULL\
        );\
        CREATE INDEX IF NOT EXISTS idx_notes_received_at ON notes(received_at DESC);\
        CREATE INDEX IF NOT EXISTS idx_notes_fingerprint ON notes(fingerprint);\
        CREATE TABLE IF NOT EXISTS settings (\
            key TEXT PRIMARY KEY,\
            value TEXT NOT NULL\
        );",
    )
    .map_err(|e| e.to_string())?;

    // Lightweight migration: older wallets may not have the notes.nonce column.
    // We add it if missing.
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(notes)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut has_nonce = false;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let name: String = row.get(1).map_err(|e| e.to_string())?;
            if name == "nonce" {
                has_nonce = true;
                break;
            }
        }
        if !has_nonce {
            conn.execute("ALTER TABLE notes ADD COLUMN nonce TEXT", [])
                .map_err(|e| e.to_string())?;
        }
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        let now = crate::unix_ts() as i64;
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

pub fn get_balance(db: &DbState) -> Result<Balance, String> {
    let conn = open_db(db)?;

    let incoming_notes_unspent: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM notes WHERE spent=0",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

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

    let confirmed_net = incoming_confirmed + incoming_notes_unspent - outgoing_confirmed;
    let pending_net = incoming_pending - outgoing_pending;
    let total = confirmed_net + pending_net;

    Ok(Balance {
        total: format_amount_minor(total),
        confirmed: format_amount_minor(confirmed_net),
        pending: format_amount_minor(pending_net),
        unspent: format_amount_minor(confirmed_net),
    })
}

pub fn list_transactions(db: &DbState) -> Result<Vec<TxSummary>, String> {
    let mut out = Vec::new();

    let notes = list_notes(db)?;
    for n in notes {
        out.push(TxSummary {
            id: format!("note_{}", n.commitment),
            direction: TxDirection::Incoming,
            amount: format_amount_minor(n.amount_minor),
            fee: "0.0000 PRAF".to_string(),
            memo: n.memo,
            timestamp: n.received_at,
            status: TxStatus::Confirmed,
        });
    }

    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, direction, amount, fee, memo, timestamp, status FROM transactions",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            let direction: String = r.get(1)?;
            let status: String = r.get(6)?;

            let direction = match direction.as_str() {
                "incoming" => TxDirection::Incoming,
                "outgoing" => TxDirection::Outgoing,
                _ => TxDirection::Outgoing,
            };
            let status = match status.as_str() {
                "pending" => TxStatus::Pending,
                "confirmed" => TxStatus::Confirmed,
                "failed" => TxStatus::Failed,
                _ => TxStatus::Failed,
            };

            Ok(TxSummary {
                id: r.get(0)?,
                direction,
                amount: r.get(2)?,
                fee: r.get(3)?,
                memo: r.get(4)?,
                timestamp: r.get::<_, i64>(5)? as u64,
                status,
            })
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }

    out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(out)
}

pub fn list_spendable_notes(db: &DbState) -> Result<Vec<SpendableNoteRow>, String> {
    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT commitment, commitment_index, amount_minor, nonce, nullifier \
             FROM notes \
             WHERE spent=0 AND nonce IS NOT NULL AND nonce <> '' AND nullifier IS NOT NULL AND nullifier <> '' \
             ORDER BY amount_minor ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(SpendableNoteRow {
                commitment: r.get(0)?,
                commitment_index: r.get::<_, i64>(1)? as u64,
                amount_minor: r.get(2)?,
                nonce_hex: r.get(3)?,
                nullifier_hex: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn mark_notes_spent(db: &DbState, commitments: &[String]) -> Result<(), String> {
    if commitments.is_empty() {
        return Ok(());
    }
    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare("UPDATE notes SET spent=1 WHERE commitment=?1")
        .map_err(|e| e.to_string())?;
    for c in commitments {
        stmt.execute(params![c]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn confirm_pending(db: &DbState) -> Result<(), String> {
    let conn = open_db(db)?;
    conn.execute("UPDATE transactions SET status='confirmed' WHERE status='pending'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn insert_outgoing(
    db: &DbState,
    tx_id: String,
    amount: String,
    fee: String,
    memo: Option<String>,
) -> Result<(), String> {
    let conn = open_db(db)?;
    let amount_minor = parse_amount_minor(&amount);
    let fee_minor = parse_amount_minor(&fee);
    let ts = crate::unix_ts() as i64;

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

    Ok(())
}

pub fn random_id(prefix: &str) -> String {
    let mut bytes = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut bytes);
    let mut s = String::with_capacity(12);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    format!("{prefix}_{}_{}", crate::unix_ts(), s)
}

pub fn upsert_note(
    db: &DbState,
    commitment: &str,
    commitment_index: u64,
    fingerprint: &str,
    encrypted_memo_hex: &str,
    amount_minor: i64,
    memo: Option<&str>,
    nonce: Option<&str>,
    received_at: u64,
    nullifier_hex: &str,
    spent: bool,
) -> Result<(), String> {
    let conn = open_db(db)?;
    conn.execute(
        "INSERT INTO notes (commitment, commitment_index, fingerprint, encrypted_memo, amount_minor, memo, nonce, received_at, nullifier, spent)\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)\
         ON CONFLICT(commitment) DO UPDATE SET\
           commitment_index=excluded.commitment_index,\
           fingerprint=excluded.fingerprint,\
           encrypted_memo=excluded.encrypted_memo,\
           amount_minor=excluded.amount_minor,\
           memo=excluded.memo,\
           nonce=excluded.nonce,\
           received_at=excluded.received_at,\
           nullifier=excluded.nullifier,\
           spent=excluded.spent",
        params![
            commitment,
            commitment_index as i64,
            fingerprint,
            encrypted_memo_hex,
            amount_minor,
            memo,
            nonce,
            received_at as i64,
            nullifier_hex,
            if spent { 1i64 } else { 0i64 }
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_notes(db: &DbState) -> Result<Vec<NoteRow>, String> {
    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT commitment, commitment_index, amount_minor, memo, received_at, spent FROM notes ORDER BY received_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(NoteRow {
                commitment: r.get(0)?,
                commitment_index: r.get::<_, i64>(1)? as u64,
                amount_minor: r.get(2)?,
                memo: r.get(3)?,
                received_at: r.get::<_, i64>(4)? as u64,
                spent: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
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

fn format_amount_minor(amount_minor: i64) -> String {
    let sign = if amount_minor < 0 { "-" } else { "" };
    let v = amount_minor.abs();
    let whole = v / 10_000;
    let frac = v % 10_000;
    format!("{}{whole}.{frac:04} PRAF", sign)
}

fn get_setting(db: &DbState, key: &str) -> Result<Option<String>, String> {
    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![key], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(v) => Ok(Some(v.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

fn set_setting(db: &DbState, key: &str, value: &str) -> Result<(), String> {
    let conn = open_db(db)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)\
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_helper_service_url(db: &DbState) -> Result<String, String> {
    Ok(get_setting(db, "helper_service_url")?.unwrap_or_else(|| "http://localhost:8080".to_string()))
}

pub fn set_helper_service_url(db: &DbState, url: String) -> Result<(), String> {
    set_setting(db, "helper_service_url", &url)
}

pub fn get_receive_address(db: &DbState) -> Result<Option<String>, String> {
    get_setting(db, "receive_address")
}

pub fn set_receive_address(db: &DbState, address: String) -> Result<(), String> {
    set_setting(db, "receive_address", &address)
}

pub fn get_sync_metadata(db: &DbState) -> Result<SyncMetadata, String> {
    let state = match get_setting(db, "sync_state")?.as_deref() {
        Some("syncing") => SyncState::Syncing,
        Some("error") => SyncState::Error,
        _ => SyncState::Idle,
    };
    let message = get_setting(db, "sync_message")?.and_then(|m| {
        if m.is_empty() {
            None
        } else {
            Some(m)
        }
    });
    let last_synced_at = get_setting(db, "last_synced_at")?
        .and_then(|v| v.parse::<u64>().ok());
    let last_scanned_height = get_setting(db, "last_scanned_height")?
        .and_then(|v| v.parse::<u64>().ok());

    Ok(SyncMetadata {
        state,
        message,
        last_synced_at,
        last_scanned_height,
    })
}

pub fn set_sync_metadata(db: &DbState, meta: &SyncMetadata) -> Result<(), String> {
    let state = match meta.state {
        SyncState::Idle => "idle",
        SyncState::Syncing => "syncing",
        SyncState::Error => "error",
    };
    set_setting(db, "sync_state", state)?;

    if let Some(m) = &meta.message {
        set_setting(db, "sync_message", m)?;
    } else {
        set_setting(db, "sync_message", "")?;
    }

    if let Some(ts) = meta.last_synced_at {
        set_setting(db, "last_synced_at", &ts.to_string())?;
    }
    if let Some(h) = meta.last_scanned_height {
        set_setting(db, "last_scanned_height", &h.to_string())?;
    }

    Ok(())
}
