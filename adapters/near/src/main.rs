use lineage_near::{fetch_salt, guard::HttpGuard, handle, nep413::Signer, Config, SignRequest, SubmitCfg};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
use std::io::Read;
use tiny_http::{Header, Method, Response, Server};

fn env(k: &str, d: &str) -> String {
    std::env::var(k).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| d.to_string())
}

fn json_response(code: u16, body: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body.to_string())
        .with_status_code(code)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn main() {
    let guard = HttpGuard { base: env("GUARD_URL", "http://localhost:8080").trim_end_matches('/').to_string() };
    let rpc_url = env("NEAR_RPC_URL", "https://rpc.mainnet.near.org");
    let verifier = env("INTENTS_VERIFIER", "intents.near");
    let fixed_salt = std::env::var("INTENTS_SALT").ok().filter(|v| !v.is_empty()).map(|h| {
        let b = h.trim_start_matches("0x");
        let bytes: Vec<u8> = (0..b.len() / 2).filter_map(|i| u8::from_str_radix(&b[2 * i..2 * i + 2], 16).ok()).collect();
        <[u8; 4]>::try_from(bytes).unwrap_or_else(|_| {
            eprintln!("INTENTS_SALT must be 4 bytes of hex (8 hex characters)");
            std::process::exit(1);
        })
    });
    match (&fixed_salt, fetch_salt(&rpc_url, &verifier)) {
        (Some(_), _) => eprintln!("using the fixed INTENTS_SALT"),
        (None, Ok(s)) => eprintln!("Verifier salt fetched from {rpc_url}: {} (re-read on every request, it rotates)", hex(&s)),
        (None, Err(e)) => eprintln!("could not read the Verifier salt ({e}); nonces will be fully random and a real Verifier would reject them"),
    }
    let account_id = env("NEAR_ACCOUNT_ID", "lineage-demo.testnet");
    let allow_submit = env("NEAR_ALLOW_SUBMIT", "0") == "1";
    if allow_submit {
        eprintln!("NEAR_ALLOW_SUBMIT=1: authorized intents may be BROADCAST to {rpc_url} (verifier {verifier})");
    } else {
        eprintln!("submission is off: the adapter only signs (set NEAR_ALLOW_SUBMIT=1 to allow broadcasting)");
    }
    let network = env("NEAR_NETWORK", "testnet");

    let signer = match std::env::var("NEAR_SECRET_KEY").ok().filter(|v| !v.is_empty()) {
        Some(k) => Signer::from_near_secret(&k).unwrap_or_else(|e| {
            eprintln!("invalid NEAR_SECRET_KEY: {e}");
            std::process::exit(1);
        }),
        None => {
            let mut seed = [0u8; 32];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut seed);
            eprintln!("NEAR_SECRET_KEY is not set: using an EPHEMERAL key, so signatures will not match any funded account");
            Signer::from_seed(seed)
        }
    };
    eprintln!("lineage-near: account {} ({network}), public key {}", account_id, signer.public_key_string());

    let addr = format!("0.0.0.0:{}", env("ADAPTER_PORT", "8090"));
    let server = Server::http(&addr).unwrap_or_else(|e| {
        eprintln!("cannot listen on {addr}: {e}");
        std::process::exit(1);
    });
    eprintln!("lineage-near listening on http://{addr}, guard at {}", guard.base);

    for mut rq in server.incoming_requests() {
        let resp = match (rq.method(), rq.url()) {
            (Method::Get, "/healthz") => Response::from_string("ok").with_status_code(200).with_header(Header::from_bytes("Content-Type", "text/plain").unwrap()),
            (Method::Post, "/sign-intent") => {
                let mut body = String::new();
                let _ = rq.as_reader().take(1 << 20).read_to_string(&mut body);
                match serde_json::from_str::<SignRequest>(&body) {
                    Err(e) => json_response(400, serde_json::json!({"error": format!("invalid request: {e}")})),
                    Ok(req) => match handle(
                        &Config {
                            account_id: account_id.clone(),
                            salt: fixed_salt.or_else(|| fetch_salt(&rpc_url, &verifier).ok()),
                            submit: allow_submit.then(|| SubmitCfg { rpc_url: rpc_url.clone(), verifier: verifier.clone() }),
                        },
                        &guard,
                        &signer,
                        req,
                    ) {
                        Ok(v) => json_response(200, v),
                        Err(e) => json_response(403, serde_json::json!({"error": e})),
                    },
                }
            }
            _ => Response::from_string("not found").with_status_code(404),
        };
        let _ = rq.respond(resp);
    }
}
