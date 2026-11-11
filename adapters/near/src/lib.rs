//! lineage-near: signs NEAR Intents messages (NEP-413) only after the Lineage
//! guard authorizes the exact intent. The agent never holds the key.
pub mod guard;
pub mod nep413;

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
}

fn iso(unix: i64) -> Result<String, String> {
    chrono::DateTime::from_timestamp(unix, 0)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .ok_or_else(|| "deadline_unix out of range".to_string())
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
        req.intent.nonce = B64.encode(n);
    }
    let nonce: [u8; 32] = B64
        .decode(&req.intent.nonce)
        .map_err(|_| "nonce must be base64".to_string())?
        .try_into()
        .map_err(|_| "nonce must be exactly 32 bytes".to_string())?;

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
    Ok(json!({
        "decision": "ALLOW", "decision_id": decision_id, "attested": attested,
        "signed": {"standard": "nep413", "message": message, "nonce": req.intent.nonce, "recipient": INTENTS_RECIPIENT,
                   "public_key": signer.public_key_string(), "signature": sig_str},
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
        (Config { account_id: "agent.testnet".into() }, nep413::Signer::from_seed([5u8; 32]))
    }

    fn req(i: Intent, decision_id: Option<&str>) -> SignRequest {
        SignRequest { run_id: "r1".into(), intent: i, context: vec![], decision_id: decision_id.map(String::from) }
    }

    #[test]
    fn allow_signs_a_verifiable_nep413_message_and_attests() {
        let (cfg, s) = setup();
        let g = fake("ALLOW", true, intent("acme.testnet"));
        let out = handle(&cfg, &g, &s, req(intent("acme.testnet"), None)).unwrap();
        assert_eq!(out["decision"], "ALLOW");
        let signed = &out["signed"];
        let msg = signed["message"].as_str().unwrap();
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
    fn malformed_nonce_is_refused_and_empty_nonce_is_generated() {
        let (cfg, s) = setup();
        let mut bad = intent("acme.testnet");
        bad.nonce = "not-base64!!".into();
        assert!(handle(&cfg, &fake("ALLOW", true, bad.clone()), &s, req(bad, None)).is_err());

        let mut empty = intent("acme.testnet");
        empty.nonce = String::new();
        let out = handle(&cfg, &fake("ALLOW", true, empty.clone()), &s, req(empty, None)).unwrap();
        assert_eq!(B64.decode(out["signed"]["nonce"].as_str().unwrap()).unwrap().len(), 32);
    }
}
