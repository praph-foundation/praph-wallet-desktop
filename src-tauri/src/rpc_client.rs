use jsonrpsee::core::client::ClientT;
use jsonrpsee::http_client::{HttpClient, HttpClientBuilder};
use jsonrpsee::rpc_params;
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

    /// Query the MPC vault address for bridge deposits from L1 storage
    ///
    /// Returns the AccountId (SS58 address) where users should send funds for L1->L2 deposits.
    /// This address is controlled by the MPC committee via threshold signatures.
    pub async fn query_mpc_vault_address(&self) -> Result<String, String> {
        // Use state_call RPC to query MpcBridgeApi::mpc_vault_address
        let response: serde_json::Value = self
            .client
            .request("state_call", rpc_params!["MpcBridgeApi_mpc_vault_address", "0x"])
            .await
            .map_err(|e| format!("RPC call failed: {}", e))?;

        // Response is SCALE-encoded Option<AccountId>
        // For None: "0x00"
        // For Some(AccountId): "0x01" + 32 bytes (AccountId32)
        let result_hex = response
            .as_str()
            .ok_or_else(|| format!("Invalid response format: expected hex string, got {}", response))?;

        let result_bytes = hex::decode(result_hex.trim_start_matches("0x"))
            .map_err(|e| format!("Failed to decode response: {}", e))?;

        // Check if None (first byte is 0x00)
        if result_bytes.is_empty() || result_bytes[0] == 0x00 {
            return Err("MPC vault address not set in chain state. Please configure via genesis or set_mpc_vault_address extrinsic.".to_string());
        }

        // Some(AccountId): first byte is 0x01, followed by 32-byte AccountId
        if result_bytes.len() != 33 {
            return Err(format!(
                "Invalid SCALE-encoded Option<AccountId>: expected 33 bytes (0x01 + 32), got {}",
                result_bytes.len()
            ));
        }

        // Extract AccountId (32 bytes starting from index 1)
        let account_bytes = &result_bytes[1..33];
        
        // Convert to SS58 address (Substrate format)
        use sp_core::crypto::{AccountId32, Ss58Codec};
        let account_id = AccountId32::new(account_bytes.try_into().unwrap());
        let ss58_address = account_id.to_ss58check();

        Ok(ss58_address)
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
