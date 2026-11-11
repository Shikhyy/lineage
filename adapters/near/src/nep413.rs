//! NEP-413 off-chain message signing: ed25519 over
//! `sha256(borsh(2^31 + 413 as u32) || borsh(payload))`.
use ed25519_dalek::{Signature, Signer as _, SigningKey, Verifier as _, VerifyingKey};
use sha2::{Digest, Sha256};

/// 2^31 + 413, the NEP-413 prefix tag.
pub const TAG: u32 = 2_147_484_061;

pub struct Payload<'a> {
    pub message: &'a str,
    pub nonce: [u8; 32],
    pub recipient: &'a str,
    pub callback_url: Option<&'a str>,
}

fn put_str(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
}

/// Borsh serialization of the payload struct (strings are u32-LE length prefixed,
/// the nonce is a fixed 32 bytes, the optional callback is a 0/1 tag).
pub fn serialize(p: &Payload) -> Vec<u8> {
    let mut b = Vec::new();
    put_str(&mut b, p.message);
    b.extend_from_slice(&p.nonce);
    put_str(&mut b, p.recipient);
    match p.callback_url {
        None => b.push(0),
        Some(u) => {
            b.push(1);
            put_str(&mut b, u);
        }
    }
    b
}

pub fn digest(p: &Payload) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(TAG.to_le_bytes());
    h.update(serialize(p));
    h.finalize().into()
}

/// Holds the signing key. Only the adapter process ever sees it.
pub struct Signer {
    key: SigningKey,
}

impl Signer {
    /// Parses a NEAR secret key: `ed25519:<base58>` of a 64-byte keypair or a 32-byte seed.
    pub fn from_near_secret(s: &str) -> Result<Self, String> {
        let raw = s.strip_prefix("ed25519:").unwrap_or(s);
        let bytes = bs58::decode(raw).into_vec().map_err(|e| format!("secret key is not base58: {e}"))?;
        let seed: [u8; 32] = match bytes.len() {
            32 | 64 => bytes[..32].try_into().unwrap(),
            n => return Err(format!("secret key must decode to 32 or 64 bytes, got {n}")),
        };
        Ok(Self { key: SigningKey::from_bytes(&seed) })
    }

    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self { key: SigningKey::from_bytes(&seed) }
    }

    /// The key, for signing the NEAR transaction that submits an authorized intent.
    pub fn signing_key(&self) -> &SigningKey {
        &self.key
    }

    pub fn public_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }

    pub fn public_key_string(&self) -> String {
        format!("ed25519:{}", bs58::encode(self.public_key().to_bytes()).into_string())
    }

    pub fn sign(&self, p: &Payload) -> Signature {
        self.key.sign(&digest(p))
    }
}

pub fn verify(pk: &VerifyingKey, p: &Payload, sig: &Signature) -> bool {
    pk.verify(&digest(p), sig).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload<'a>(msg: &'a str) -> Payload<'a> {
        Payload { message: msg, nonce: [7u8; 32], recipient: "intents.near", callback_url: None }
    }

    #[test]
    fn tag_is_2_pow_31_plus_413() {
        assert_eq!(TAG, (1u32 << 31) + 413);
        assert_eq!(TAG.to_le_bytes(), [0x9D, 0x01, 0x00, 0x80]);
    }

    #[test]
    fn serialization_layout_is_borsh() {
        let p = Payload { message: "hi", nonce: [0u8; 32], recipient: "r", callback_url: None };
        let mut want = vec![2, 0, 0, 0, b'h', b'i'];
        want.extend([0u8; 32]);
        want.extend([1, 0, 0, 0, b'r']);
        want.push(0);
        assert_eq!(serialize(&p), want);

        let q = Payload { callback_url: Some("u"), ..p };
        let s = serialize(&q);
        assert_eq!(&s[s.len() - 6..], &[1, 1, 0, 0, 0, b'u']);
    }

    #[test]
    fn digest_is_sha256_of_tag_and_payload() {
        let p = payload("m");
        let mut data = TAG.to_le_bytes().to_vec();
        data.extend(serialize(&p));
        let want: [u8; 32] = Sha256::digest(&data).into();
        assert_eq!(digest(&p), want);
    }

    #[test]
    fn sign_and_verify_roundtrip_and_tamper() {
        let s = Signer::from_seed([1u8; 32]);
        let p = payload("pay acme");
        let sig = s.sign(&p);
        assert!(verify(&s.public_key(), &p, &sig));
        assert!(!verify(&s.public_key(), &payload("pay attacker"), &sig));
        let mut other = payload("pay acme");
        other.nonce = [8u8; 32];
        assert!(!verify(&s.public_key(), &other, &sig));
    }

    #[test]
    fn parses_near_secret_keys() {
        let seed = [3u8; 32];
        let pk = Signer::from_seed(seed).public_key().to_bytes();
        let mut kp = seed.to_vec();
        kp.extend(pk);
        let s64 = format!("ed25519:{}", bs58::encode(&kp).into_string());
        let s32 = format!("ed25519:{}", bs58::encode(seed).into_string());
        assert_eq!(Signer::from_near_secret(&s64).unwrap().public_key().to_bytes(), pk);
        assert_eq!(Signer::from_near_secret(&s32).unwrap().public_key().to_bytes(), pk);
        assert!(Signer::from_near_secret("ed25519:abc").is_err());
    }
}
