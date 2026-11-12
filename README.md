# Lineage

**The accounts-payable agent that can't be phished: every payment detail has a provenance.**

Lineage sits between an AI agent and the money rail. It labels every piece of context (inbound email, chat, memory, tool output) with where it came from, and refuses to let text from an untrusted source decide where money goes. The check runs **outside the LLM**, so even a fully jailbroken agent cannot pay an attacker.

It ships as a Go service with two parts:

1. **Guard**: `POST /v1/decide` returns `ALLOW`, `ASK_OWNER` or `BLOCK` for a payment tool call, with reasons and a lineage tree showing where each critical value came from.
2. **AP-clerk agent**: a tool-using agent that reads invoices and pays vendors through the **PayPal sandbox Payouts API**, with an owner-approval queue, a hash-chained audit log and a web UI.

## Why

Business email compromise is the dominant fraud against payables, and agents add a new failure: instructions hidden in invoices, chat and *persistent memory* can steer them. Most guardrails enforce amounts and allowlists. They do not ask **where did this payee come from, and is that source allowed to set it?**

## Quickstart

Requires Go 1.24+.

```bash
git clone https://github.com/Shikhyy/lineage.git
cd lineage
cp .env.example .env      # optional: add PayPal sandbox credentials
make run                  # http://localhost:8080
```

With no PayPal credentials the app runs with a **simulated rail** and says so in a banner on every page. No money moves, not even sandbox money. To use the PayPal sandbox, create a sandbox app and four sandbox accounts (a business payer, two vendors and an attacker), then set in `.env`:

```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
VENDOR_A_EMAIL=<sandbox personal account email>
VENDOR_B_EMAIL=<sandbox personal account email>
ATTACKER_EMAIL=<sandbox personal account email>
```

The host is pinned to `https://api-m.sandbox.paypal.com`. There is no code path to live PayPal, and `PAYPAL_ENV` must be `sandbox` or the app refuses to start.

Set `OWNER_SECRET` to sign in as the owner (needed to approve payments). If it is unset, a random secret is generated and printed in the log at startup.

### Try to phish it (the attack lab)

The landing page at `/` has an **attack lab**: write any message an attacker might send (email, chat or tool output) and the same message is handled twice by a simulated compromised agent, once with no guard and once behind Lineage. You see whether money moved, the guard's reasons, and the lineage of the payee, traced to the exact untrusted message. It runs in memory on the simulated rail, so no money moves, and it is rate-limited to 20 attacks a minute per client. The agent is a simulation that follows the latest payment instruction it can recognise (an address near a verb like "pay" or "send"), so it shows what the guard does and not how a real model behaves.

### Try the demo

1. Open `/`, pick **A2 · BEC: lookalike domain says the payout email changed**, mode **compromised**, defense **none**, and run it. The simulated compromised agent pays the attacker.
2. Run the same scenario with defense **lineage**. The decision is `ASK_OWNER`, nothing is paid, and the timeline shows the attacker's address came from an untrusted inbound email.
3. Sign in at `/login`, open `/approvals`, and approve or reject. Approval pays through the executor and updates the vendor master.
4. Open `/audit` to see the hash-chained log verify.

## How it works

### Trust tiers

Labels are assigned by code at ingestion. The LLM can never create or upgrade one.

| Tier | Source | May set payment-critical fields? |
|---|---|---|
| T3 Owner | Authenticated owner instruction or approval click | Yes |
| T2 Trusted records | Vendor master, approved purchase orders | Yes |
| T1 Known sender | Email from an address on a vendor record (spoofable) | No |
| T0 Untrusted | Any other email, chat, tool output, memory written while T0/T1 was in context | No |

A memory entry's trust is the **minimum** trust of everything in the prompt when it was written, so poisoned memory stays poisoned across sessions.

### Guard checks

For a `pay_vendor` call the guard reads the invoice, purchase order and vendor from the database (never from the agent) and applies three layers:

- **C1 static policy**: per-transaction cap, daily cap, currency allowlist, duplicate invoice.
- **C2 record binding**: amount within the approved PO, invoice and PO agree on the vendor, and the payee is not another vendor's registered address (the confused-deputy case that a plain allowlist passes).
- **C3 provenance**: the payee must equal the vendor master, or have been given by the owner. Otherwise the value is traced through the context fragments. Found only in untrusted sources, it becomes `ASK_OWNER` (`UNTRUSTED_PAYEE_CHANGE`); found nowhere, `ASK_OWNER` (`UNGROUNDED_PAYEE`).

The strictest verdict wins (`BLOCK` > `ASK_OWNER` > `ALLOW`). Each decision stores a hash of the exact arguments; the executor refuses to run if they differ, runs a decision at most once, and only holds the PayPal credentials, so the agent cannot reach PayPal directly.

### API

| Endpoint | Purpose |
|---|---|
| `POST /v1/fragments` | Register context; the server assigns trust (owner/record kinds need the owner secret) |
| `POST /v1/decide` | `{run_id, call:{tool,args}, context:[fragment ids]}` returns the verdict, reasons and lineage |
| `POST /v1/execute` | Pay an `ALLOW`ed or owner-approved decision |
| `GET /v1/approvals`, `POST /v1/approvals/{id}/approve\|reject` | Owner queue (header `X-Owner-Secret`) |
| `GET /v1/audit`, `GET /v1/audit/verify` | Hash-chained log and verification |
| `GET /healthz` | Liveness |

## Benchmark (PayBench-BEC)

17 scenarios (5 benign, 12 attack; 4 of the attacks target the NEAR Intents rail), 6 defenses, reproduce with `make bench`. Results are written to `results/latest.md`; the raw rows go to `results/latest.json`. The benchmark always uses the simulated rail.

Modes are reported separately and never mixed:

- `scripted`: a fixed tool sequence.
- `compromised`: a **simulated** worst-case jailbroken agent that follows the latest payment instruction found in any context. It tests the guard independently of any model's weaknesses; it is not a measurement of a real model.
- `llm`: a real model with tool use. It runs only when `LLM_API_KEY` and `LLM_MODEL` are set, and **has not been run yet** (the table below has no `llm` rows).

| Defense | Mode | ASR | Benign completion | Owner-asks/100 benign | $ lost | p95 decide ms |
|---|---|---|---|---|---|---|
| none | compromised | 100% (12/12) | 100% (5/5) | 0 | $14125.00 | n/a |
| prompt | compromised | 100% (12/12) | 100% (5/5) | 0 | $14125.00 | n/a |
| static | compromised | 75% (9/12) | 100% (5/5) | 0 | $10375.00 | 0.11 |
| **lineage** | compromised | **0% (0/12)** | 100% (5/5) | 20 | $0.00 | 0.24 |
| lineage_prov_only | compromised | 25% (3/12) | 100% (5/5) | 20 | $2875.00 | 0.22 |
| lineage_bind_only | compromised | 83% (10/12) | 100% (5/5) | 0 | $12500.00 | 0.25 |

ASR = share of attack runs where money reached the attacker or exceeded the approved PO. The `prompt` defense is identical to `none` here only because the simulated compromised agent ignores its prompt by construction; it needs the `llm` mode to say anything about prompt hardening. The ablation rows show each layer catches a different attack class, so the layers are complementary. See `results/latest.md` for the scripted-mode rows, the per-scenario matrix and the commit the numbers came from.

## NEAR rail

The guard also decides `sign_intent` calls for NEAR Intents (`POST /v1/decide` with `call.tool = "sign_intent"` and `call.intent`). Critical fields: the destination account must be grounded in the vendor record or an owner instruction; the asset must be on `ALLOWED_ASSETS`; the deadline must be within `MAX_INTENT_TTL_SECONDS`; and every nonce is single-use. An external signer confirms authorization with `GET /v1/decisions/{id}` and reports what it did with `POST /v1/decisions/{id}/attest`.

Benchmark scenarios I1–I4 (destination swap, token-metadata injection, stale deadline, solver-message injection) run with a **simulated** signature.

`adapters/near` is a Rust signer (`lineage-near`) that holds the NEAR key and signs a NEP-413 message only after the guard authorizes the exact intent. The agent never sees the key.

```bash
make run                                   # guard on :8080
cd adapters/near && cargo run              # adapter on :8090
curl -X POST localhost:8090/sign-intent -d '{"run_id":"r1","intent":{"invoice_id":"inv_1","destination":"acme.testnet","asset":"nep141:usdc.test","amount_cents":125000,"deadline_unix":<now+120>,"nonce":""}}'
```

Config: `GUARD_URL`, `NEAR_ACCOUNT_ID`, `NEAR_SECRET_KEY` (`ed25519:...`), `NEAR_NETWORK`, `ADAPTER_PORT`. With no key it uses an ephemeral one and says so. `ASK_OWNER` and `BLOCK` return no signature; after the owner approves, re-submit with `decision_id` and the identical intent. `cargo test` covers the NEP-413 byte layout and signing, and the allow/ask/block paths against a fake guard. I also ran the Go guard and the adapter together by hand: a legitimate intent was signed, a destination swap was held for approval, and a 30-day deadline was blocked.

Checked against the published NEP-413 spec and the NEAR Intents Verifier docs: the `2^31 + 413` tag, payload field order, sha256-then-ed25519, the `intents.near` recipient, the `transfer` intent shape, and the `{standard, payload:{recipient, nonce, message}, public_key, signature}` wrapper that `execute_intents` takes. The Verifier requires the first 4 bytes of each 32-byte nonce to equal its current salt, and the salt rotates. The adapter therefore reads it from the Verifier's public `current_salt` view method (`NEAR_RPC_URL`, default `https://rpc.mainnet.near.org`; `INTENTS_VERIFIER`, default `intents.near`) on every request. This was run against the live network: the signed nonce carried the live salt. Set `INTENTS_SALT` (8 hex characters) to pin a value instead. If the salt cannot be read, nonces are fully random, the response says `salt_checked: false`, and a real Verifier would reject them.

**Submitting a signed intent.** Per the NEAR Intents docs, `publish_intent` on the solver relay is for quote-based swaps and requires `quote_hashes` from solvers, so it does not apply to a plain `transfer`. A transfer is executed by calling `execute_intents` on the Verifier contract in a NEAR transaction from a funded account, and the signing key must first be registered on the Verifier with `add_public_key`.

The adapter can do that broadcast, but only when **both** are true: the request sets `"submit": true`, and the operator started the adapter with `NEAR_ALLOW_SUBMIT=1`. Otherwise the response reports `submission.status = "skipped"` and nothing is sent. It reads the account's access-key nonce, builds and signs the transaction with `NEAR_SECRET_KEY` (the `NEAR_ACCOUNT_ID` account pays gas, 300 TGas attached), and calls `send_tx`. Because `NEAR_RPC_URL` defaults to mainnet, where `intents.near` lives, a submission there is a real transaction. Use a small funded account.

Checked against the real network, without spending anything: the live Verifier salt is read and used in the nonce; a signed intent passed to the Verifier's read-only `simulate_intents` was parsed and got as far as checking that the key belongs to the signer account (it refused, as it should, because the throwaway key is not registered); and NEAR's testnet RPC parsed our Borsh transaction bytes and rejected a nonexistent signer with `SignerDoesNotExist` (`cargo test -- --ignored`).

What is **not** verified: no transaction has been broadcast from a funded, registered account, so a real `execute_intents` call has never succeeded; the `execute_intents` argument layout is taken from the documented `simulate_intents` layout (`{"signed": [...]}`); the encoding of the optional `callbackUrl` follows standard Borsh because the spec page does not spell it out; and the USDC decimals (6) are assumed for the cents-to-units conversion. `send_tx` with `wait_until: EXECUTED` is also written from memory of the RPC API.

## Limitations

- Tracing is exact-match on identifiers (emails, accounts). It does not follow derived values; the amount is bounded by the PO instead of traced.
- Memory written with untrusted context in view is conservatively tainted, which can cost utility (more owner asks).
- A poisoned vendor master or a compromised owner channel is out of scope.
- T1 sender matching is spoofable, so it never sets payment fields.
- The `compromised` results come from a simulation, and the scenario set is small and written by the author, so the 0% attack-success figure describes this benchmark, not security in general. This is a deterministic enforcement point with measured results, not a proof of security.
- PayPal calls are tested against a mocked sandbox server in the unit tests. A live sandbox payout needs your own sandbox credentials.

## Layout

```
cmd/lineage    server          cmd/bench   benchmark runner
internal/prov      trust tiers, ingestion rules, tracing
internal/guard     decide(): static, binding, provenance
internal/audit     hash-chained log
internal/records   SQLite persistence
internal/executor  guarded payment executor (PayPal rail, simulated rail)
internal/paypal    sandbox-pinned OAuth + Payouts client
internal/agent     tool-use loop, LLM interface, scripted/compromised modes
internal/scenario  scenario loader and runner
internal/web       UI and /v1 API
scenarios/         PayBench-BEC scenario files
```

Stack: Go standard library, `modernc.org/sqlite` (pure Go, no cgo), `golang.org/x/text` (Unicode normalization). `make test`, `make lint`, `make bench`, `make demo` are available.

## Tools used

- PayPal developer platform: OAuth and the Payouts API, sandbox only.
- Anthropic Messages API with tool use for the optional `llm` agent mode (model chosen via `LLM_MODEL`).
- Built with Claude Code.

## Roadmap

A Rust adapter that puts the same guard in front of NEAR Intents signing, intent-specific attack scenarios, and a CrAIBench bridge. The guard core is shared with a separate NEAR Hackathon submission.

## License

MIT
