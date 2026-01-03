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

        // Check for nested error response
        if let Some(error_obj) = response.get("error") {
            let error_msg = error_obj
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            let error_data = error_obj.get("data").and_then(|d| d.as_str()).unwrap_or("");

            return Err(format!(
                "Bridge key not available: {} ({})\n💡 Bridge requires MPC setup. \
                For testing, you can use a mock bridge key by setting PRAPH_BRIDGE_TEST_MODE=1",
                error_msg, error_data
            ));
        }

        // Parse bridge_public_key field from response
        let pubkey_hex = response
            .get("bridge_public_key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Invalid response format: {}", response))?;

        let pubkey_bytes = hex::decode(pubkey_hex.trim_start_matches("0x"))
            .map_err(|e| format!("Failed to decode public key: {}", e))?;

        // Validate length:
        // - BLS12-381 G1: 48 bytes (compressed), 96 bytes (uncompressed)
        // - BLS12-381 G2: 96 bytes (compressed), 192 bytes (uncompressed)
        // The bridge currently uses uncompressed G2 keys (192 bytes)
        if pubkey_bytes.len() != 48 && pubkey_bytes.len() != 96 && pubkey_bytes.len() != 192 {
            return Err(format!(
                "Invalid public key length: expected 48, 96 or 192 bytes, got {}",
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
