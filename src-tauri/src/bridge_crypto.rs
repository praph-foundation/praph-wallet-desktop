/// ECDH key exchange using BN254 curve (matches ZK circuit curve)
///
/// Performs scalar multiplication: shared_secret = scalar * point
use ark_bn254::{Fr, G1Affine, G1Projective};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::PrimeField;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};

/// Perform ECDH to derive shared secret
///
/// # Arguments
/// * `ephemeral_secret` - 32-byte scalar (private key)
/// * `bridge_pubkey` - Bridge public key (G1 point, 48 or 96 bytes)
///
/// # Returns
/// 32-byte shared secret derived from scalar * point
pub fn ecdh_bn254(ephemeral_secret: &[u8; 32], bridge_pubkey: &[u8]) -> Result<[u8; 32], String> {
    // Parse ephemeral secret as Fr scalar
    let scalar_bytes: [u8; 32] = *ephemeral_secret;
    let scalar = Fr::from_le_bytes_mod_order(&scalar_bytes);

    // Parse bridge public key as G1 point
    let point = parse_g1_point(bridge_pubkey)?;

    // Perform scalar multiplication: shared_point = scalar * point
    let shared_point = (point * scalar).into_affine();

    // Serialize shared point to bytes and hash to get 32-byte secret
    let shared_bytes = serialize_g1_point(&shared_point);

    // Use Blake2b to derive 32-byte secret from point
    use blake2::{Blake2b512, Digest};
    let mut hasher = Blake2b512::new();
    hasher.update(&shared_bytes);
    let result = hasher.finalize();

    let mut secret = [0u8; 32];
    secret.copy_from_slice(&result[..32]);
    Ok(secret)
}

/// Parse G1 point from bytes (supports both compressed and uncompressed)
fn parse_g1_point(bytes: &[u8]) -> Result<G1Affine, String> {
    match bytes.len() {
        48 => {
            // Compressed format
            G1Affine::deserialize_compressed(bytes)
                .map_err(|e| format!("Failed to parse compressed G1 point: {}", e))
        }
        96 => {
            // Uncompressed format
            G1Affine::deserialize_uncompressed(bytes)
                .map_err(|e| format!("Failed to parse uncompressed G1 point: {}", e))
        }
        _ => Err(format!("Invalid G1 point length: {}", bytes.len())),
    }
}

/// Serialize G1 point to bytes (uncompressed)
fn serialize_g1_point(point: &G1Affine) -> Vec<u8> {
    let mut bytes = Vec::new();
    point
        .serialize_uncompressed(&mut bytes)
        .expect("Serialization should not fail");
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore;

    #[test]
    fn test_ecdh_roundtrip() {
        let mut rng = rand::thread_rng();

        // Generate random scalar and point
        let mut secret = [0u8; 32];
        rng.fill_bytes(&mut secret);

        // Use generator point for testing
        let generator = G1Affine::generator();
        let gen_bytes = serialize_g1_point(&generator);

        // Perform ECDH
        let result = ecdh_bn254(&secret, &gen_bytes);
        assert!(result.is_ok());

        let shared_secret = result.unwrap();
        assert_eq!(shared_secret.len(), 32);

        // Shared secret should be deterministic
        let shared_secret2 = ecdh_bn254(&secret, &gen_bytes).unwrap();
        assert_eq!(shared_secret, shared_secret2);
    }

    #[test]
    fn test_different_secrets_produce_different_results() {
        let generator = G1Affine::generator();
        let gen_bytes = serialize_g1_point(&generator);

        let secret1 = [1u8; 32];
        let secret2 = [2u8; 32];

        let shared1 = ecdh_bn254(&secret1, &gen_bytes).unwrap();
        let shared2 = ecdh_bn254(&secret2, &gen_bytes).unwrap();

        assert_ne!(shared1, shared2);
    }
}
