//! Bridge cryptography module for ECDH key exchange on BLS12-381 curve.
//!
//! This module provides ECDH functionality using the BLS12-381 elliptic curve,
//! matching the curve used by pallet-mpc-bridge on L1.

use ark_bls12_381::{Fr, G2Affine, G2Projective};
use ark_ec::CurveGroup;
use ark_ff::PrimeField;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use blake2::{Blake2b512, Digest};

/// Perform ECDH key exchange on BLS12-381 curve.
///
/// # Arguments
/// * `ephemeral_secret` - 32-byte ephemeral secret scalar
/// * `bridge_pubkey` - Bridge public key (G2 point, 96 or 192 bytes)
///
/// # Returns
/// * 32-byte shared secret derived via Blake2b from the ECDH shared point
pub fn ecdh_bn254(ephemeral_secret: &[u8; 32], bridge_pubkey: &[u8]) -> Result<[u8; 32], String> {
    // 1. Parse ephemeral secret as scalar
    let scalar = Fr::from_le_bytes_mod_order(ephemeral_secret);

    // 2. Parse bridge public key (G2 point)
    let point = parse_g2_point(bridge_pubkey)?;

    // 3. Perform scalar multiplication: shared_point = scalar * bridge_pubkey
    let shared_point = (point * scalar).into_affine();

    // 4. Serialize shared point
    let shared_bytes = serialize_g2_point(&shared_point);

    // 5. Hash to 32-byte shared secret using Blake2b
    let mut hasher = Blake2b512::new();
    hasher.update(&shared_bytes);
    let hash_result = hasher.finalize();

    // Take first 32 bytes
    let mut shared_secret = [0u8; 32];
    shared_secret.copy_from_slice(&hash_result[..32]);

    Ok(shared_secret)
}

/// Derive ephemeral public key (G2 point) from ephemeral secret.
pub fn derive_ephemeral_pubkey(ephemeral_secret: &[u8; 32]) -> Result<[u8; 96], String> {
    use ark_ec::Group;
    
    // 1. Parse ephemeral secret as scalar
    let scalar = Fr::from_le_bytes_mod_order(ephemeral_secret);

    // 2. Compute ephemeral public key: P = scalar * G2_generator
    let point = (G2Projective::generator() * scalar).into_affine();

    // 3. Serialize as compressed G2 point (96 bytes)
    let mut bytes = Vec::new();
    point
        .serialize_compressed(&mut bytes)
        .map_err(|e| format!("Failed to serialize ephemeral pubkey: {}", e))?;

    if bytes.len() != 96 {
        return Err(format!(
            "Invalid serialized G2 point length: expected 96, got {}",
            bytes.len()
        ));
    }

    let mut out = [0u8; 96];
    out.copy_from_slice(&bytes);
    Ok(out)
}

/// Parse G2 point from bytes (supports both compressed and uncompressed formats)
fn parse_g2_point(bytes: &[u8]) -> Result<G2Affine, String> {
    match bytes.len() {
        96 => {
            // Compressed format (96 bytes for G2)
            G2Affine::deserialize_compressed(bytes)
                .map_err(|e| format!("Failed to parse compressed G2 point: {}", e))
        }
        192 => {
            // Uncompressed format (192 bytes for G2)
            G2Affine::deserialize_uncompressed(bytes)
                .map_err(|e| format!("Failed to parse uncompressed G2 point: {}", e))
        }
        _ => Err(format!(
            "Invalid G2 point length: expected 96 (compressed) or 192 (uncompressed) bytes, got {}",
            bytes.len()
        )),
    }
}

/// Serialize G2 point to uncompressed bytes (192 bytes)
fn serialize_g2_point(point: &G2Affine) -> Vec<u8> {
    let mut bytes = Vec::new();
    point
        .serialize_uncompressed(&mut bytes)
        .expect("Serialization should not fail");
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ecdh_roundtrip() {
        // Generate test secret
        let secret = [42u8; 32];

        // G2 generator (compressed, 96 bytes)
        let generator_compressed = {
            let gen = G2Affine::generator();
            let mut bytes = Vec::new();
            gen.serialize_compressed(&mut bytes).unwrap();
            bytes
        };

        // Perform ECDH
        let result = ecdh_bn254(&secret, &generator_compressed);
        assert!(result.is_ok());

        let shared_secret = result.unwrap();
        assert_eq!(shared_secret.len(), 32);

        // Deterministic: same inputs produce same output
        let result2 = ecdh_bn254(&secret, &generator_compressed).unwrap();
        assert_eq!(shared_secret, result2);
    }
}
