use crate::types::{Balance, TxDirection, TxStatus, TxSummary};
use directories::ProjectDirs;
use rand::RngCore;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;

pub struct DbState {
    pub db_path: PathBuf,
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
        CREATE TABLE IF NOT EXISTS settings (\
            key TEXT PRIMARY KEY,\
            value TEXT NOT NULL\
        );",
    )
    .map_err(|e| e.to_string())?;

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

pub fn list_transactions(db: &DbState) -> Result<Vec<TxSummary>, String> {
    let conn = open_db(db)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, direction, amount, fee, memo, timestamp, status FROM transactions ORDER BY timestamp DESC",
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

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
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
