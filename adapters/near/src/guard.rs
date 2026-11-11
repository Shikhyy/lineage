//! Client for the Lineage guard's HTTP API.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The critical fields of an intent. Mirrors `guard.IntentArgs` in the Go service.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Intent {
    pub invoice_id: String,
    pub destination: String,
    pub asset: String,
    pub amount_cents: i64,
    pub deadline_unix: i64,
    pub nonce: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Decision {
    pub decision: String,
    pub decision_id: String,
    #[serde(default)]
    pub reasons: Value,
    #[serde(default)]
    pub lineage: Value,
    #[serde(default)]
    pub approval_id: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Status {
    pub decision_id: String,
    pub decision: String,
    #[serde(default)]
    pub approval: String,
    pub authorized: bool,
    pub args_json: Intent,
}

/// The guard operations the adapter needs. A trait so tests can fake the guard.
pub trait GuardApi {
    fn decide(&self, run_id: &str, intent: &Intent, context: &[String]) -> Result<Decision, String>;
    fn status(&self, decision_id: &str) -> Result<Status, String>;
    fn attest(&self, decision_id: &str, reference: &str, note: &str) -> Result<(), String>;
}

pub struct HttpGuard {
    pub base: String,
}

impl GuardApi for HttpGuard {
    fn decide(&self, run_id: &str, intent: &Intent, context: &[String]) -> Result<Decision, String> {
        let body = json!({"run_id": run_id, "call": {"tool": "sign_intent", "intent": intent}, "context": context});
        ureq::post(&format!("{}/v1/decide", self.base))
            .send_json(body)
            .map_err(|e| format!("guard decide failed: {e}"))?
            .into_json()
            .map_err(|e| format!("guard decide: bad response: {e}"))
    }

    fn status(&self, decision_id: &str) -> Result<Status, String> {
        ureq::get(&format!("{}/v1/decisions/{}", self.base, decision_id))
            .call()
            .map_err(|e| format!("guard status failed: {e}"))?
            .into_json()
            .map_err(|e| format!("guard status: bad response: {e}"))
    }

    fn attest(&self, decision_id: &str, reference: &str, note: &str) -> Result<(), String> {
        ureq::post(&format!("{}/v1/decisions/{}/attest", self.base, decision_id))
            .send_json(json!({"reference": reference, "note": note}))
            .map_err(|e| format!("guard attest failed: {e}"))?;
        Ok(())
    }
}
