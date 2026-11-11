//! Builds, signs and broadcasts the NEAR transaction that calls `execute_intents` on the Verifier.
//!
//! Layout follows the NEAR protocol's Borsh encoding: a transaction is
//! `signer_id, public_key, nonce, receiver_id, block_hash, actions`, and the signature is
//! ed25519 over `sha256(borsh(transaction))`.
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signer as _, SigningKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// 300 TGas, the maximum a single call may attach.
pub const DEFAULT_GAS: u64 = 300_000_000_000_000;

/// Action enum index of `FunctionCall` in the NEAR protocol.
const ACTION_FUNCTION_CALL: u8 = 2;

pub struct FunctionCall<'a> {
    pub signer_id: &'a str,
    pub public_key: [u8; 32],
    pub nonce: u64,
    pub receiver_id: &'a str,
    pub block_hash: [u8; 32],
    pub method: &'a str,
    pub args: &'a [u8],
    pub gas: u64,
    pub deposit: u128,
}

fn put_str(b: &mut Vec<u8>, s: &str) {
    b.extend_from_slice(&(s.len() as u32).to_le_bytes());
    b.extend_from_slice(s.as_bytes());
}

/// Borsh bytes of a transaction holding one FunctionCall action.
pub fn serialize(t: &FunctionCall) -> Vec<u8> {
    let mut b = Vec::new();
    put_str(&mut b, t.signer_id);
    b.push(0); // PublicKey::ED25519
    b.extend_from_slice(&t.public_key);
    b.extend_from_slice(&t.nonce.to_le_bytes());
    put_str(&mut b, t.receiver_id);
    b.extend_from_slice(&t.block_hash);
    b.extend_from_slice(&1u32.to_le_bytes()); // one action
    b.push(ACTION_FUNCTION_CALL);
    put_str(&mut b, t.method);
    b.extend_from_slice(&(t.args.len() as u32).to_le_bytes());
    b.extend_from_slice(t.args);
    b.extend_from_slice(&t.gas.to_le_bytes());
    b.extend_from_slice(&t.deposit.to_le_bytes());
    b
}

/// `SignedTransaction` bytes: the transaction followed by `Signature::ED25519` (tag 0 + 64 bytes).
pub fn signed_transaction(t: &FunctionCall, key: &SigningKey) -> Vec<u8> {
    let tx = serialize(t);
    let digest = Sha256::digest(&tx);
    let sig = key.sign(&digest);
    let mut out = tx;
    out.push(0);
    out.extend_from_slice(&sig.to_bytes());
    out
}

/// Arguments of `execute_intents`: the signed intents, in the layout `simulate_intents` documents.
pub fn execute_intents_args(signed: &Value) -> Vec<u8> {
    json!({ "signed": [signed] }).to_string().into_bytes()
}

pub struct AccessKey {
    pub nonce: u64,
    pub block_hash: [u8; 32],
}

fn rpc(url: &str, method: &str, params: Value) -> Result<Value, String> {
    let resp: Value = ureq::post(url)
        .timeout(std::time::Duration::from_secs(20))
        .send_json(json!({"jsonrpc": "2.0", "id": "lineage", "method": method, "params": params}))
        .map_err(|e| format!("NEAR RPC {method} failed: {e}"))?
        .into_json()
        .map_err(|e| format!("NEAR RPC {method}: bad response: {e}"))?;
    if let Some(err) = resp.get("error") {
        return Err(format!("NEAR RPC {method} error: {err}"));
    }
    Ok(resp)
}

/// Current nonce of an access key and a recent block hash (both needed to build a transaction).
pub fn view_access_key(rpc_url: &str, account: &str, public_key: &str) -> Result<AccessKey, String> {
    let r = rpc(
        rpc_url,
        "query",
        json!({"request_type": "view_access_key", "finality": "final", "account_id": account, "public_key": public_key}),
    )?;
    let result = &r["result"];
    if let Some(e) = result.get("error") {
        return Err(format!("access key lookup failed: {e}"));
    }
    let nonce = result["nonce"].as_u64().ok_or("access key response has no nonce")?;
    let hash = bs58::decode(result["block_hash"].as_str().ok_or("access key response has no block_hash")?)
        .into_vec()
        .map_err(|e| format!("bad block_hash: {e}"))?;
    let block_hash: [u8; 32] = hash.try_into().map_err(|_| "block_hash must be 32 bytes".to_string())?;
    Ok(AccessKey { nonce, block_hash })
}

/// Broadcasts a signed transaction and waits until it has executed.
pub fn broadcast(rpc_url: &str, signed_tx: &[u8]) -> Result<Value, String> {
    rpc(rpc_url, "send_tx", json!({"signed_tx_base64": B64.encode(signed_tx), "wait_until": "EXECUTED"}))
}

/// Builds, signs and broadcasts `execute_intents` for one signed intent.
/// `account` pays for gas and must own `key` as a full-access key.
pub fn submit_execute_intents(
    rpc_url: &str,
    verifier: &str,
    account: &str,
    key: &SigningKey,
    public_key_str: &str,
    signed_intent: &Value,
) -> Result<Value, String> {
    let ak = view_access_key(rpc_url, account, public_key_str)?;
    let args = execute_intents_args(signed_intent);
    let tx = FunctionCall {
        signer_id: account,
        public_key: key.verifying_key().to_bytes(),
        nonce: ak.nonce + 1,
        receiver_id: verifier,
        block_hash: ak.block_hash,
        method: "execute_intents",
        args: &args,
        gas: DEFAULT_GAS,
        deposit: 0,
    };
    broadcast(rpc_url, &signed_transaction(&tx, key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier as _};

    fn sample<'a>(args: &'a [u8]) -> FunctionCall<'a> {
        FunctionCall {
            signer_id: "a.near",
            public_key: [1u8; 32],
            nonce: 7,
            receiver_id: "intents.near",
            block_hash: [2u8; 32],
            method: "m",
            args,
            gas: 3,
            deposit: 4,
        }
    }

    #[test]
    fn transaction_layout_is_borsh() {
        let b = serialize(&sample(b"xy"));
        let mut want = vec![6, 0, 0, 0];
        want.extend(b"a.near");
        want.push(0);
        want.extend([1u8; 32]);
        want.extend(7u64.to_le_bytes());
        want.extend([12, 0, 0, 0]);
        want.extend(b"intents.near");
        want.extend([2u8; 32]);
        want.extend([1, 0, 0, 0]); // actions length
        want.push(2); // FunctionCall
        want.extend([1, 0, 0, 0, b'm']);
        want.extend([2, 0, 0, 0, b'x', b'y']);
        want.extend(3u64.to_le_bytes());
        want.extend(4u128.to_le_bytes());
        assert_eq!(b, want);
    }

    #[test]
    fn signature_covers_sha256_of_the_transaction() {
        let key = SigningKey::from_bytes(&[9u8; 32]);
        let t = sample(b"{}");
        let signed = signed_transaction(&t, &key);
        let tx = serialize(&t);
        assert_eq!(&signed[..tx.len()], tx.as_slice());
        assert_eq!(signed[tx.len()], 0, "signature tag must be ED25519");
        let sig = Signature::from_slice(&signed[tx.len() + 1..]).unwrap();
        assert_eq!(signed.len(), tx.len() + 65);
        assert!(key.verifying_key().verify(&Sha256::digest(&tx), &sig).is_ok());
    }

    /// Network check, run with `cargo test -- --ignored`. Sends a transaction from an account that
    /// does not exist, signed by a throwaway key, to NEAR testnet. The node must reject it at
    /// validation (so nothing happens), and the kind of rejection shows whether it could parse our
    /// Borsh bytes: a parse failure would be reported as a deserialization error instead.
    #[test]
    #[ignore]
    fn testnet_parses_our_transaction_bytes() {
        let url = "https://rpc.testnet.near.org";
        let block = rpc(url, "block", json!({"finality": "final"})).unwrap();
        let hash = bs58::decode(block["result"]["header"]["hash"].as_str().unwrap()).into_vec().unwrap();
        let key = SigningKey::from_bytes(&rand_seed());
        let t = FunctionCall {
            signer_id: "lineage-parse-check-does-not-exist.testnet",
            public_key: key.verifying_key().to_bytes(),
            nonce: 1,
            receiver_id: "intents.near",
            block_hash: hash.try_into().unwrap(),
            method: "execute_intents",
            args: b"{\"signed\":[]}",
            gas: DEFAULT_GAS,
            deposit: 0,
        };
        let err = broadcast(url, &signed_transaction(&t, &key)).expect_err("a nonexistent signer must be rejected");
        println!("testnet response: {err}");
        assert!(!err.contains("Deserialization") && !err.contains("PARSE") && !err.contains("deserial"), "node could not parse the bytes: {err}");
        assert!(err.contains("DoesNotExist") || err.contains("does not exist") || err.contains("AccessKey"), "unexpected rejection: {err}");
    }

    fn rand_seed() -> [u8; 32] {
        let mut s = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut s);
        s
    }

    #[test]
    fn execute_intents_args_wrap_the_signed_object() {
        let signed = json!({"standard": "nep413", "payload": {"recipient": "intents.near"}, "public_key": "ed25519:k", "signature": "ed25519:s"});
        let v: Value = serde_json::from_slice(&execute_intents_args(&signed)).unwrap();
        assert_eq!(v["signed"][0]["standard"], "nep413");
        assert_eq!(v["signed"].as_array().unwrap().len(), 1);
    }
}
