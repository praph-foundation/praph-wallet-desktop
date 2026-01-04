//! L2 ETH Client for PRAPH Wallet
//!
//! This module provides EVM wallet functionality for the L2 layer:
//! - ETH balance queries
//! - wPRAF (wrapped PRAF) token balance
//! - Transaction sending
//! - Transaction history

use ethers::prelude::*;
use ethers::signers::{LocalWallet, Signer};
use ethers::types::{Address, TransactionRequest, H256, U256};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// L2 client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Config {
    /// L2 RPC URL (e.g., http://localhost:8545)
    pub rpc_url: String,

    /// Bridge contract address
    pub bridge_address: Option<String>,
    /// Chain ID for L2 network
    pub chain_id: u64,
}

impl Default for L2Config {
    fn default() -> Self {
        Self {
            rpc_url: "http://localhost:8545".to_string(),

            bridge_address: None,
            chain_id: 1337, // Reth dev chain ID
        }
    }
}

/// L2 balance information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Balance {
    /// Native PRAF balance (for gas)
    pub praf: String,

    /// PRAF balance in minor units (18 decimals)
    pub praf_minor: String,

}

/// L2 transaction parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2SendParams {
    /// Recipient address (0x...)
    pub to: String,
    /// Amount to send (human readable, e.g., "1.5")
    pub amount: String,
    /// Token type: "eth" or "wpraf"
    pub token: String,
    /// Gas price (optional, will use default if not specified)
    pub gas_price: Option<String>,
}

/// L2 transaction result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2SendResult {
    /// Transaction hash
    pub tx_hash: String,
    /// Block number (if confirmed)
    pub block_number: Option<u64>,
    /// Status: "pending", "confirmed", "failed"
    pub status: String,
}



/// L2 client for interacting with the EVM layer
pub struct L2Client {
    provider: Provider<Http>,
    config: L2Config,
}

impl L2Client {
    /// Create a new L2 client
    pub fn new(config: L2Config) -> Result<Self, String> {
        let provider = Provider::<Http>::try_from(&config.rpc_url)
            .map_err(|e| format!("Failed to create provider: {}", e))?;

        Ok(Self { provider, config })
    }

    /// Get PRAF balance for an address
    pub async fn get_balance(&self, address: &str) -> Result<L2Balance, String> {
        let addr: Address = address
            .parse()
            .map_err(|e| format!("Invalid address: {}", e))?;

        // Get native ETH balance
        let eth_balance = self
            .provider
            .get_balance(addr, None)
            .await
            .map_err(|e| format!("Failed to get ETH balance: {}", e))?;



        Ok(L2Balance {
            praf: format_units(eth_balance, 18),
            praf_minor: eth_balance.to_string(),
        })
    }

    /// Send PRAF transaction
    pub async fn send_transaction(
        &self,
        params: L2SendParams,
        private_key: &[u8; 32],
    ) -> Result<L2SendResult, String> {
        let wallet = LocalWallet::from_bytes(private_key)
            .map_err(|e| format!("Invalid private key: {}", e))?
            .with_chain_id(self.config.chain_id);

        let client = SignerMiddleware::new(self.provider.clone(), wallet);

        let to: Address = params
            .to
            .parse()
            .map_err(|e| format!("Invalid recipient address: {}", e))?;

        let amount =
            parse_units(&params.amount, 18).map_err(|e| format!("Invalid amount: {}", e))?;

        let tx_hash = match params.token.as_str() {
            "praf" => {
                // Native PRAF transfer
                let tx = TransactionRequest::new().to(to).value(amount);

                let pending_tx = client
                    .send_transaction(tx, None)
                    .await
                    .map_err(|e| format!("Failed to send PRAF: {}", e))?;

                format!("{:?}", pending_tx.tx_hash())
            }

            _ => return Err(format!("Unknown token type: {}", params.token)),
        };

        Ok(L2SendResult {
            tx_hash,
            block_number: None,
            status: "pending".to_string(),
        })
    }



    /// Get transaction status from L2
    pub async fn get_transaction_status(&self, tx_hash: &str) -> Result<String, String> {
        // Parse transaction hash
        let hash_str = tx_hash.trim_start_matches("0x");
        let tx_hash_parsed: H256 = hash_str
            .parse()
            .map_err(|e| format!("Invalid transaction hash: {}", e))?;

        // Query for transaction receipt
        match self.provider.get_transaction_receipt(tx_hash_parsed).await {
            Ok(Some(receipt)) => {
                // Check if transaction was successful
                if let Some(status) = receipt.status {
                    if status.as_u64() == 1 {
                        Ok("confirmed".to_string())
                    } else {
                        Ok("failed".to_string())
                    }
                } else {
                    // Pre-Byzantium fork transactions don't have status field
                    Ok("confirmed".to_string())
                }
            }
            Ok(None) => {
                // No receipt yet - transaction is still pending
                Ok("pending".to_string())
            }
            Err(e) => Err(format!("Failed to get transaction status: {}", e)),
        }
    }

    /// Get the configured L2 config
    pub fn config(&self) -> &L2Config {
        &self.config
    }
}

/// Format wei to human-readable units
fn format_units(value: U256, decimals: u32) -> String {
    let divisor = U256::from(10u64).pow(U256::from(decimals));
    let whole = value / divisor;
    let fraction = value % divisor;

    if fraction.is_zero() {
        format!("{}", whole)
    } else {
        let fraction_str = format!("{:0>width$}", fraction, width = decimals as usize);
        let trimmed = fraction_str.trim_end_matches('0');
        format!("{}.{}", whole, trimmed)
    }
}

/// Parse human-readable units to wei
fn parse_units(value: &str, decimals: u32) -> Result<U256, String> {
    let parts: Vec<&str> = value.split('.').collect();
    match parts.len() {
        1 => {
            let whole =
                U256::from_dec_str(parts[0]).map_err(|e| format!("Invalid number: {}", e))?;
            let multiplier = U256::from(10u64).pow(U256::from(decimals));
            Ok(whole * multiplier)
        }
        2 => {
            let whole =
                U256::from_dec_str(parts[0]).map_err(|e| format!("Invalid whole part: {}", e))?;
            let frac_str = format!("{:0<width$}", parts[1], width = decimals as usize);
            let frac_str = &frac_str[..decimals as usize];
            let frac =
                U256::from_dec_str(frac_str).map_err(|e| format!("Invalid fraction: {}", e))?;
            let multiplier = U256::from(10u64).pow(U256::from(decimals));
            Ok(whole * multiplier + frac)
        }
        _ => Err("Invalid number format".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_units() {
        let one_eth = U256::from(10u64).pow(U256::from(18u32));
        assert_eq!(format_units(one_eth, 18), "1");

        let one_and_half = one_eth + one_eth / 2;
        assert_eq!(format_units(one_and_half, 18), "1.5");
    }

    #[test]
    fn test_parse_units() {
        let one_eth = parse_units("1", 18).unwrap();
        assert_eq!(one_eth, U256::from(10u64).pow(U256::from(18u32)));

        let one_and_half = parse_units("1.5", 18).unwrap();
        let expected = U256::from(10u64).pow(U256::from(18u32)) * 3 / 2;
        assert_eq!(one_and_half, expected);
    }
}
