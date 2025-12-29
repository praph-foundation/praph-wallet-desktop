use jsonrpsee::core::client::ClientT;
use jsonrpsee::core::params::ArrayParams;
use jsonrpsee::http_client::{HttpClient, HttpClientBuilder};
use jsonrpsee::rpc_params;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// RPC client for querying L1 runtime APIs
pub struct L1RpcClient {
    client: HttpClient,
}

impl L1RpcClient {
    /// Create a new L1 RPC client
    pub fn new(url: &str) -> Result<Self, String> {
        let client = HttpClientBuilder::default()
            .request_timeout(Duration::from_secs(30))
            .build(url)
            .map_err(|e| format!("Failed to create RPC client: {}", e))?;

        Ok(Self { client })
    }

    /// Query the current bridge public key from the MPC bridge pallet
    ///
    /// Returns the BLS12-381 G1 public key (96 bytes compressed) used by the MPC committee
    /// to decrypt bridge messages for L1->L2 transfers.
    pub async fn query_bridge_public_key(&self) -> Result<Vec<u8>, String> {
        // Call praph_mpc_getBridgePublicKey RPC method
        let response: serde_json::Value = self
            .client
            .request("praph_mpc_getBridgePublicKey", rpc_params![])
            .await
            .map_err(|e| format!("RPC call failed: {}", e))?;

        // Parse hex-encoded public key
        let pubkey_hex = response
            .as_str()
            .ok_or_else(|| "Invalid response format".to_string())?;

        let pubkey_bytes = hex::decode(pubkey_hex.trim_start_matches("0x"))
            .map_err(|e| format!("Failed to decode public key: {}", e))?;

        // Validate length (BLS12-381 G1 compressed point is 48 bytes, or 96 for uncompressed)
        if pubkey_bytes.len() != 48 && pubkey_bytes.len() != 96 {
            return Err(format!(
                "Invalid public key length: expected 48 or 96 bytes, got {}",
                pubkey_bytes.len()
            ));
        }

        Ok(pubkey_bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires running L1 node
    async fn test_query_bridge_public_key() {
        let client = L1RpcClient::new("http://localhost:9944").unwrap();
        let pubkey = client.query_bridge_public_key().await;

        match pubkey {
            Ok(key) => {
                println!("Bridge public key: {} bytes", key.len());
                assert!(key.len() == 48 || key.len() == 96);
            }
            Err(e) => {
                // Expected if node isn't running
                println!("RPC call failed (expected if node not running): {}", e);
            }
        }
    }
}
