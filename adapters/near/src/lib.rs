//! lineage-near: signs NEAR Intents messages (NEP-413) only after the Lineage
//! guard authorizes the exact intent. The agent never holds the key.
pub mod guard;
pub mod nep413;
pub mod tx;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use guard::{GuardApi, Intent};
use serde::Deserialize;
use serde_json::{json, Value};

/// Recipient of NEP-413 signatures for NEAR Intents.
pub const INTENTS_RECIPIENT: &str = "intents.near";
/// USDC has 6 decimals; the guard measures amounts in USD cents (10^4 units per cent).
pub const UNITS_PER_CENT: u128 = 10_000;

pub struct Config {
    pub account_id: String,
    /// Current salt of the Verifier contract. The first 4 bytes of every intent nonce must equal it
    /// (the remaining 28 are unique per account). When unset, nonces are fully random and the
    /// response says so, because a real Verifier would reject them.
    pub salt: Option<[u8; 4]>,
    /// Present only when the operator opted in with NEAR_ALLOW_SUBMIT=1.
    pub submit: Option<SubmitCfg>,
}

/// Where and how an authorized intent is broadcast.
pub struct SubmitCfg {
    pub rpc_url: String,
    pub verifier: String,
}

#[derive(Deserialize)]
pub struct SignRequest {
    pub run_id: String,
    pub intent: Intent,
    #[serde(default)]
    pub context: Vec<String>,
    /// Set when re-submitting after the owner approved an earlier ASK_OWNER decision.
    #[serde(default)]
    pub decision_id: Option<String>,
    /// Also broadcast `execute_intents` on NEAR. Ignored unless the operator enabled submission.
    #[serde(default)]
    pub submit: bool,
}

fn iso(unix: i64) -> Result<String, String> {
    chrono::DateTime::from_timestamp(unix, 0)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .ok_or_else(|| "deadline_unix out of range".to_string())
}

/// Parses the bytes returned by the Verifier's `current_salt` view call: a JSON string of
/// 8 hex characters (for example `"252812b3"`) encoded as UTF-8 bytes.
pub fn parse_salt(bytes: &[u8]) -> Result<[u8; 4], String> {
    let s: String = serde_json::from_slice(bytes).map_err(|e| format!("current_salt is not a JSON string: {e}"))?;
    if s.len() != 8 {
        return Err(format!("current_salt must be 8 hex characters, got {}", s.len()));
    }
    let mut out = [0u8; 4];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).map_err(|_| "current_salt is not hex".to_string())?;
    }
    Ok(out)
}

/// Reads the Verifier's current salt through a public NEAR RPC view call. The salt rotates,
/// so callers should fetch it per request rather than caching it for long.
pub fn fetch_salt(rpc_url: &str, verifier: &str) -> Result<[u8; 4], String> {
    let body = json!({"jsonrpc": "2.0", "id": "lineage", "method": "query", "params": {
        "request_type": "call_function", "finality": "final", "account_id": verifier,
        "method_name": "current_salt", "args_base64": "e30="}});
    let resp: Value = ureq::post(rpc_url)
        .timeout(std::time::Duration::from_secs(10))
        .send_json(body)
        .map_err(|e| format!("salt RPC failed: {e}"))?
        .into_json()
        .map_err(|e| format!("salt RPC: bad response: {e}"))?;
    let bytes: Vec<u8> = resp["result"]["result"]
        .as_array()
        .ok_or_else(|| format!("salt RPC returned no result: {resp}"))?
        .iter()
        .filter_map(|v| v.as_u64().map(|n| n as u8))
        .collect();
    parse_salt(&bytes)
}

/// The NEAR Intents message for a transfer, as JSON text.
pub fn build_message(cfg: &Config, i: &Intent) -> Result<String, String> {
    let units = (i.amount_cents as u128) * UNITS_PER_CENT;
    Ok(json!({
        "signer_id": cfg.account_id,
        "deadline": iso(i.deadline_unix)?,
        "intents": [{"intent": "transfer", "receiver_id": i.destination, "tokens": {i.asset.clone(): units.to_string()}}],
    })
    .to_string())
}

/// Runs one signing request. Returns a JSON body describing the outcome.
/// `Err` means the request itself was invalid or not authorized.
pub fn handle(cfg: &Config, g: &dyn GuardApi, signer: &nep413::Signer, mut req: SignRequest) -> Result<Value, String> {
    if req.intent.nonce.is_empty() {
        let mut n = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut n);
        if let Some(salt) = cfg.salt {
            n[..4].copy_from_slice(&salt);
        }
        req.intent.nonce = B64.encode(n);
    }
    let nonce: [u8; 32] = B64
        .decode(&req.intent.nonce)
        .map_err(|_| "nonce must be base64".to_string())?
        .try_into()
        .map_err(|_| "nonce must be exactly 32 bytes".to_string())?;
    if let Some(salt) = cfg.salt {
        if nonce[..4] != salt {
            return Err("nonce does not start with the Verifier's current salt".into());
        }
    }

    let decision_id = match &req.decision_id {
        Some(id) => {
            // Re-submission after owner approval: the guard must have authorized these exact arguments.
            let st = g.status(id)?;
            if !st.authorized {
                return Err(format!("decision {id} is not authorized (decision {}, approval '{}')", st.decision, st.approval));
            }
            if st.args_json != req.intent {
                return Err("intent differs from the arguments the guard decided on".into());
            }
            id.clone()
        }
        None => {
            let d = g.decide(&req.run_id, &req.intent, &req.context)?;
            match d.decision.as_str() {
                "ALLOW" => d.decision_id,
                "ASK_OWNER" => {
                    return Ok(json!({"decision": "ASK_OWNER", "decision_id": d.decision_id, "approval_id": d.approval_id,
                        "reasons": d.reasons, "lineage": d.lineage, "signed": null}))
                }
                _ => return Ok(json!({"decision": d.decision, "decision_id": d.decision_id, "reasons": d.reasons, "signed": null})),
            }
        }
    };

    let message = build_message(cfg, &req.intent)?;
    let payload = nep413::Payload { message: &message, nonce, recipient: INTENTS_RECIPIENT, callback_url: None };
    let sig = signer.sign(&payload);
    let sig_str = format!("ed25519:{}", bs58::encode(sig.to_bytes()).into_string());
    // Best effort: the signature is valid either way, but the audit trail should record it.
    let attested = g.attest(&decision_id, &sig_str, "signed NEP-413 intent").is_ok();
    // The shape the Verifier's execute_intents expects.
    let signed = json!({"standard": "nep413",
                   "payload": {"recipient": INTENTS_RECIPIENT, "nonce": req.intent.nonce, "message": message},
                   "public_key": signer.public_key_string(), "signature": sig_str});
    let submission = if !req.submit {
        Value::Null
    } else {
        match &cfg.submit {
            None => json!({"status": "skipped", "reason": "NEAR_ALLOW_SUBMIT=1 is not set on the adapter"}),
            Some(sc) => match tx::submit_execute_intents(&sc.rpc_url, &sc.verifier, &cfg.account_id, signer.signing_key(), &signer.public_key_string(), &signed) {
                Ok(resp) => {
                    let _ = g.attest(&decision_id, &sig_str, "submitted execute_intents to NEAR");
                    json!({"status": "submitted", "rpc_response": resp})
                }
                Err(e) => json!({"status": "failed", "error": e}),
            },
        }
    };
    Ok(json!({
        "decision": "ALLOW", "decision_id": decision_id, "attested": attested,
        "salt_checked": cfg.salt.is_some(), "signed": signed, "submission": submission,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use guard::{Decision, Status};
    use std::cell::RefCell;

    struct Fake {
        verdict: &'static str,
        authorized: bool,
        decided: Intent,
        attested: RefCell<Vec<String>>,
    }

    impl GuardApi for Fake {
        fn decide(&self, _: &str, _: &Intent, _: &[String]) -> Result<Decision, String> {
            Ok(Decision { decision: self.verdict.into(), decision_id: "dec_1".into(), reasons: json!([]), lineage: json!([]),
                approval_id: (self.verdict == "ASK_OWNER").then(|| "appr_1".to_string()) })
        }
        fn status(&self, id: &str) -> Result<Status, String> {
            Ok(Status { decision_id: id.into(), decision: "ASK_OWNER".into(), approval: "approved".into(),
                authorized: self.authorized, args_json: self.decided.clone() })
        }
        fn attest(&self, id: &str, _: &str, _: &str) -> Result<(), String> {
            self.attested.borrow_mut().push(id.into());
            Ok(())
        }
    }

    fn intent(dest: &str) -> Intent {
        Intent { invoice_id: "inv_1".into(), destination: dest.into(), asset: "nep141:usdc.test".into(),
            amount_cents: 125000, deadline_unix: 1_800_000_000, nonce: B64.encode([9u8; 32]) }
    }

    fn fake(verdict: &'static str, authorized: bool, decided: Intent) -> Fake {
        Fake { verdict, authorized, decided, attested: RefCell::new(vec![]) }
    }

    fn setup() -> (Config, nep413::Signer) {
        (Config { account_id: "agent.testnet".into(), salt: None, submit: None }, nep413::Signer::from_seed([5u8; 32]))
    }

    fn req(i: Intent, decision_id: Option<&str>) -> SignRequest {
        SignRequest { run_id: "r1".into(), intent: i, context: vec![], decision_id: decision_id.map(String::from), submit: false }
    }

    #[test]
    fn allow_signs_a_verifiable_nep413_message_and_attests() {
        let (cfg, s) = setup();
        let g = fake("ALLOW", true, intent("acme.testnet"));
        let out = handle(&cfg, &g, &s, req(intent("acme.testnet"), None)).unwrap();
        assert_eq!(out["decision"], "ALLOW");
        let signed = &out["signed"];
        let msg = signed["payload"]["message"].as_str().unwrap();
        let m: Value = serde_json::from_str(msg).unwrap();
        assert_eq!(m["signer_id"], "agent.testnet");
        assert_eq!(m["deadline"], "2027-01-15T08:00:00Z");
        assert_eq!(m["intents"][0]["receiver_id"], "acme.testnet");
        assert_eq!(m["intents"][0]["tokens"]["nep141:usdc.test"], "1250000000");

        let sig_b58 = signed["signature"].as_str().unwrap().strip_prefix("ed25519:").unwrap();
        let sig = ed25519_dalek::Signature::from_slice(&bs58::decode(sig_b58).into_vec().unwrap()).unwrap();
        let p = nep413::Payload { message: msg, nonce: [9u8; 32], recipient: INTENTS_RECIPIENT, callback_url: None };
        assert!(nep413::verify(&s.public_key(), &p, &sig));
        assert_eq!(g.attested.borrow().as_slice(), ["dec_1"]);
    }

    #[test]
    fn ask_owner_and_block_never_sign() {
        let (cfg, s) = setup();
        for v in ["ASK_OWNER", "BLOCK"] {
            let g = fake(v, true, intent("attacker.testnet"));
            let out = handle(&cfg, &g, &s, req(intent("attacker.testnet"), None)).unwrap();
            assert_eq!(out["decision"], v);
            assert!(out["signed"].is_null(), "{v} must not produce a signature");
            assert!(g.attested.borrow().is_empty());
        }
    }

    #[test]
    fn approved_decision_signs_only_the_decided_intent() {
        let (cfg, s) = setup();
        let decided = intent("acme2.testnet");
        let g = fake("ASK_OWNER", true, decided.clone());
        assert_eq!(handle(&cfg, &g, &s, req(decided, Some("dec_9"))).unwrap()["decision"], "ALLOW");
        // Swapped destination after approval is refused.
        assert!(handle(&cfg, &g, &s, req(intent("attacker.testnet"), Some("dec_9"))).is_err());
    }

    #[test]
    fn unauthorized_decision_is_refused() {
        let (cfg, s) = setup();
        let g = fake("ASK_OWNER", false, intent("acme.testnet"));
        assert!(handle(&cfg, &g, &s, req(intent("acme.testnet"), Some("dec_1"))).is_err());
    }

    #[test]
    fn parses_the_real_current_salt_response() {
        // Bytes returned by the live intents.near current_salt view call: the JSON string "252812b3".
        let live = [34u8, 50, 53, 50, 56, 49, 50, 98, 51, 34];
        assert_eq!(parse_salt(&live).unwrap(), [0x25, 0x28, 0x12, 0xb3]);
        assert!(parse_salt(b"\"zzzzzzzz\"").is_err());
        assert!(parse_salt(b"\"abc\"").is_err());
        assert!(parse_salt(b"not json").is_err());
    }

    #[test]
    fn nonce_must_carry_the_verifier_salt() {
        let s = nep413::Signer::from_seed([5u8; 32]);
        let cfg = Config { account_id: "agent.testnet".into(), salt: Some([1, 2, 3, 4]), submit: None };
        // A generated nonce starts with the salt.
        let mut empty = intent("acme.testnet");
        empty.nonce = String::new();
        let out = handle(&cfg, &fake("ALLOW", true, empty.clone()), &s, req(empty, None)).unwrap();
        let n = B64.decode(out["signed"]["payload"]["nonce"].as_str().unwrap()).unwrap();
        assert_eq!(&n[..4], &[1, 2, 3, 4]);
        assert_eq!(out["salt_checked"], true);
        // A caller-supplied nonce with the wrong prefix is refused (the test intent uses 0x09 bytes).
        assert!(handle(&cfg, &fake("ALLOW", true, intent("acme.testnet")), &s, req(intent("acme.testnet"), None)).is_err());
    }

    #[test]
    fn malformed_nonce_is_refused_and_empty_nonce_is_generated() {
        let (cfg, s) = setup();
        let mut bad = intent("acme.testnet");
        bad.nonce = "not-base64!!".into();
        assert!(handle(&cfg, &fake("ALLOW", true, bad.clone()), &s, req(bad, None)).is_err());

        let mut empty = intent("acme.testnet");
        empty.nonce = String::new();
        let out = handle(&cfg, &fake("ALLOW", true, empty.clone()), &s, req(empty, None)).unwrap();
        assert_eq!(B64.decode(out["signed"]["payload"]["nonce"].as_str().unwrap()).unwrap().len(), 32);
    }
}
