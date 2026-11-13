<div align="center">

# Lineage

**The payment agent that can't be phished. Every payment detail has a provenance.**

[![CI](https://github.com/Shikhyy/lineage/actions/workflows/ci.yml/badge.svg)](https://github.com/Shikhyy/lineage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-985A36)](LICENSE)
![Go](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-NEP--413%20signer-000000?logo=rust&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-sandbox%20only-003087?logo=paypal&logoColor=white)
![Benchmark](https://img.shields.io/badge/PayBench--BEC-0%2F12%20attacks%20succeed%20(simulated%20attacker)-2F5D3A)

<img src="assets/screens/01-hero.jpeg" alt="Lineage landing page: the headline 'Pay only what you can trace home' beside an evidence tag inspecting a payee" width="100%">

</div>

Lineage sits between an AI agent and the money rail. It labels every piece of context (inbound email, chat, memory, tool output) with where it came from, and refuses to let text from an untrusted source decide where money goes. The check runs **outside the LLM**, so even a fully jailbroken agent cannot pay an attacker.

It ships as three parts:

1. **Guard** (Go): `POST /v1/decide` returns `ALLOW`, `ASK_OWNER` or `BLOCK` for a payment tool call, with reasons and a lineage tree showing where each critical value came from.
2. **AP-clerk agent and executor** (Go): a tool-using agent that reads invoices and pays vendors through the **PayPal sandbox Payouts API**, with an owner-approval queue and a hash-chained audit log.
3. **Website and console** (Next.js): a landing page with a live **attack lab**, and a console with an interactive provenance graph, replay, side-by-side compare, approvals, audit and benchmark.

Plus a **Rust signer** that puts the same guard in front of NEAR Intents signing.

## The problem

Business email compromise is the dominant fraud against payables, and agents add a new failure: instructions hidden in invoices, chat and *persistent memory* can steer them, and poisoned memory survives across sessions. Most guardrails enforce amounts and allowlists. They do not ask the question that matters: **where did this payee come from, and is that source allowed to set it?**

## See it

<table>
<tr>
<td width="50%"><img src="assets/screens/02-follow-the-payee.jpeg" alt="Scroll sequence: the attacker's address travels from an email into memory and a chat, then the guard stamps ASK_OWNER while nothing is paid"></td>
<td width="50%"><img src="assets/screens/03-attack-lab.jpeg" alt="Attack lab: the same phishing message handled with no guard (money moved to the attacker) and behind Lineage (held for the owner)"></td>
</tr>
<tr>
<td><b>Follow the payee.</b> A pinned scroll sequence: the attacker's address is born in an email, copied into memory, repeated in a chat, and stopped at the guard.</td>
<td><b>Attack lab.</b> Write your own attack. It runs twice on the real engine (no guard, then behind Lineage) and links into the console's full trace.</td>
</tr>
<tr>
<td><img src="assets/screens/05-console-compare.jpeg" alt="Console compare view: no guard says ALLOW and money moves; Lineage says ASK_OWNER and the payment is held"></td>
<td><img src="assets/screens/06-console-memory-poisoning.jpeg" alt="Console provenance graph for a memory-poisoning attack: the payee traces to a memory entry derived from an untrusted stranger chat"></td>
</tr>
<tr>
<td><b>Compare.</b> The same attack with no guard and behind Lineage, side by side, with the difference computed from real data.</td>
<td><b>Provenance graph.</b> A memory-poisoning run: the payee traces to a memory entry that was derived from an untrusted chat (T0).</td>
</tr>
</table>

<p align="center"><img src="assets/screens/04-evidence.jpeg" alt="Benchmark grid: six defenses against twelve attacks; each single layer leaks in different places and full Lineage leaks nowhere" width="100%"></p>

## How it works

```mermaid
flowchart LR
  subgraph untrusted["Untrusted context (T0)"]
    E["Inbound email"]
    C["Chat"]
    M["Agent memory"]
    T["Tool output"]
  end
  subgraph trusted["Trusted sources"]
    V["Vendor record (T2)"]
    O["Owner (T3)"]
  end
  E --> A
  C --> A
  M --> A
  T --> A
  V --> A
  O --> A
  A["AI agent (LLM)"] -->|"pay_vendor + fragment ids"| G{{"Guard<br/>outside the LLM"}}
  G -->|ALLOW| X["Executor<br/>holds the credentials"]
  G -->|ASK_OWNER| Q["Owner approval queue"]
  G -->|BLOCK| B["Rejected"]
  Q -->|approve| X
  X --> P[("PayPal Payouts<br/>sandbox")]
  G -.-> L[("Hash-chained<br/>audit log")]
  X -.-> L
```

### An attack, step by step

```mermaid
sequenceDiagram
  autonumber
  participant Atk as Attacker
  participant Ag as Agent (LLM)
  participant G as Guard
  participant Own as Owner
  participant Ex as Executor
  Atk->>Ag: Email: "we changed banks, pay attacker@..."
  Note over Ag: Stored as a fragment. Trust T0, assigned by code, not by the model
  Ag->>G: pay_vendor(inv_1, attacker@..., $1,250) with the context fragment ids
  G->>G: Payee differs from the vendor record, so trace it
  Note over G: Found only in T0 fragments
  G-->>Ag: ASK_OWNER (UNTRUSTED_PAYEE_CHANGE) with the lineage
  G->>Own: Approval request showing where the value came from
  Own-->>G: Reject, or approve after calling the vendor
  Note over Ex: Runs only for an ALLOW or an owner approval, once, for the exact decided arguments
```

### Trust tiers

Labels are assigned by code at ingestion. The LLM can never create or upgrade one.

```mermaid
flowchart LR
  T3["T3 Owner<br/>may set payment fields"] --> T2["T2 Trusted records<br/>may set payment fields"] --> T1["T1 Known sender (spoofable)<br/>informational only"] --> T0["T0 Untrusted<br/>never sets payment fields"]
```

| Tier | Source | May set payment-critical fields? |
|---|---|---|
| T3 Owner | Authenticated owner instruction or approval click | Yes |
| T2 Trusted records | Vendor master, approved purchase orders | Yes |
| T1 Known sender | Email from an address on a vendor record (spoofable) | No |
| T0 Untrusted | Any other email, chat, tool output, memory written while T0/T1 was in context | No |

A memory entry's trust is the **minimum** trust of everything in the prompt when it was written, so poisoned memory stays poisoned across sessions:

```mermaid
flowchart LR
  CH["Stranger chat<br/>T0"] -->|"in context when written"| ME["Memory entry<br/>trust = minimum = T0"]
  ME -->|"recalled in a later session"| PA["Payee value"]
  PA -.->|"lineage traces back"| CH
```

### The guard

For a `pay_vendor` call the guard reads the invoice, purchase order and vendor from the database (never from the agent) and applies three layers. The strictest verdict wins (`BLOCK` > `ASK_OWNER` > `ALLOW`).

```mermaid
flowchart TD
  S(["pay_vendor call"]) --> C1{"C1 static policy:<br/>caps, currency, duplicate?"}
  C1 -- violates --> BL["BLOCK"]
  C1 -- ok --> C2{"C2 record binding:<br/>amount within PO, vendor matches,<br/>payee not another vendor's?"}
  C2 -- violates --> BL
  C2 -- ok --> C3{"C3 provenance:<br/>payee equals the vendor record?"}
  C3 -- yes --> AL["ALLOW"]
  C3 -- no --> TR{"Trace the payee<br/>through the context"}
  TR -- "given by the owner (T3)" --> AL
  TR -- "only in T0 or T1 sources" --> AO["ASK_OWNER"]
  TR -- "appears nowhere" --> AO
```

- **C1 static policy**: per-transaction cap, daily cap, currency allowlist, duplicate invoice.
- **C2 record binding**: amount within the approved PO, invoice and PO agree on the vendor, and the payee is not another vendor's registered address (the confused-deputy case that a plain allowlist passes).
- **C3 provenance**: the payee must equal the vendor master, or have been given by the owner. Otherwise the value is traced through the context fragments. Found only in untrusted sources, it becomes `ASK_OWNER` (`UNTRUSTED_PAYEE_CHANGE`); found nowhere, `ASK_OWNER` (`UNGROUNDED_PAYEE`).

Each decision stores a hash of the exact arguments. The executor refuses to run if they differ, runs a decision at most once, and is the only component that holds the PayPal credentials, so the agent cannot reach PayPal directly. Every decision, approval and payment is appended to a tamper-evident log:

```mermaid
flowchart LR
  G0["genesis<br/>000…0"] --> R1["record 1<br/>sha256(prev + payload)"] --> R2["record 2<br/>sha256(prev + payload)"] --> R3["record 3<br/>sha256(prev + payload)"]
```

## Benchmark (PayBench-BEC)

17 scenarios (5 benign, 12 attack; 4 of the attacks target the NEAR Intents rail), 6 defenses. Reproduce with `make bench`; results go to `results/latest.md`. The benchmark always uses the simulated rail.

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

## Quickstart

Requires Go 1.24+ and Node 20+ (for the website).

```bash
git clone https://github.com/Shikhyy/lineage.git
cd lineage
cp .env.example .env      # optional: add PayPal sandbox credentials
make run                  # the Go API on http://localhost:8080
make web-install          # once: install the Next.js app's dependencies
make web-dev              # the website on http://localhost:3000 (proxies /api and /v1 to the API)
```

With no PayPal credentials the app runs with a **simulated rail** and says so on every page. No money moves, not even sandbox money. To use the PayPal sandbox, create a sandbox app and four sandbox accounts (a business payer, two vendors and an attacker), then set in `.env`:

```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
VENDOR_A_EMAIL=<sandbox personal account email>
VENDOR_B_EMAIL=<sandbox personal account email>
ATTACKER_EMAIL=<sandbox personal account email>
```

`.env` is git-ignored; never commit it. Only `.env.example` (placeholders) is tracked.

**The payer must be a sandbox *business* account in a country where PayPal allows Payouts, such as the US.** Payouts sent from a sandbox business account in India were rejected with `PAYOUT_NOT_AVAILABLE: You live in a country that is not allowed to send this payout`. Sandbox apps are tied to the business account chosen when the app is created, so create a US business account first, then create the app against it, and use US personal accounts as payees. The app reports a payout that fails (a PayPal rejection or a network error) as "No money moved … the payout could not be completed", never as money moved.

The host is pinned to `https://api-m.sandbox.paypal.com`. There is no code path to live PayPal, and `PAYPAL_ENV` must be `sandbox` or the app refuses to start.

Set `OWNER_SECRET` to sign in as the owner (needed to approve payments). If it is unset, a random secret is generated and printed in the log at startup.

> **Deploying the website:** Next.js bakes its `/api` and `/v1` proxy rewrites in at **build** time, so set `GO_API_URL` (the Go API's public URL) when you run `npm run build`. See `web/README.md` and `render.yaml`.

### Try to phish it (the attack lab)

The landing page has an **attack lab**: write any message an attacker might send (email, chat or tool output) and the same message is handled twice by a simulated compromised agent, once with no guard and once behind Lineage. You see whether money moved, the guard's reasons, and the lineage of the payee, traced to the exact untrusted message. Each run is a real run you can open in the console. It is rate-limited to 30 runs a minute per client. The agent is a simulation that follows the latest payment instruction it can recognise (an address near a verb like "pay" or "send"), so it shows what the guard does and not how a real model behaves.

### Try the console

1. Open http://localhost:3000/console, pick **A2 · BEC: lookalike domain says the payout email changed**, mode **compromised**, defense **none**, and run it. The simulated compromised agent pays the attacker.
2. Run the same scenario with defense **lineage**. The decision is `ASK_OWNER`, nothing is paid, and the graph shows the attacker's address came from an untrusted inbound email.
3. Open **Approvals** in the top bar, sign in with the owner secret (`OWNER_SECRET`), and approve or reject. Approval pays through the executor and updates the vendor master.
4. Open **Audit** to see the hash-chained log verify. Use **Compare** to run the same attack with no guard and behind Lineage side by side.

<p align="center"><img src="assets/screens/07-mobile.jpeg" alt="The landing page on a phone" width="260"></p>

## API

| Endpoint | Purpose |
|---|---|
| `POST /v1/fragments` | Register context; the server assigns trust (owner/record kinds need the owner secret) |
| `POST /v1/decide` | `{run_id, call:{tool,args}, context:[fragment ids]}` returns the verdict, reasons and lineage |
| `POST /v1/execute` | Pay an `ALLOW`ed or owner-approved decision |
| `GET /v1/approvals`, `POST /v1/approvals/{id}/approve\|reject` | Owner queue (header `X-Owner-Secret`) |
| `GET /v1/audit`, `GET /v1/audit/verify` | Hash-chained log and verification |
| `GET /api/*` | JSON used by the website: session, scenarios, runs, run detail, approvals, benchmark |
| `GET /healthz` | Liveness |

<details>
<summary><b>NEAR Intents rail (Rust signer): status, what was checked, what was not</b></summary>

The guard also decides `sign_intent` calls for NEAR Intents (`POST /v1/decide` with `call.tool = "sign_intent"` and `call.intent`). Critical fields: the destination account must be grounded in the vendor record or an owner instruction; the asset must be on `ALLOWED_ASSETS`; the deadline must be within `MAX_INTENT_TTL_SECONDS`; and every nonce is single-use. An external signer confirms authorization with `GET /v1/decisions/{id}` and reports what it did with `POST /v1/decisions/{id}/attest`.

Benchmark scenarios I1–I4 (destination swap, token-metadata injection, stale deadline, solver-message injection) always run with a **simulated** signature, so the benchmark needs no second process.

**Honeypot.** `/honeypot` is the attack lab with an audience, on the NEAR rail: anyone writes a message meant to make a simulated compromised agent sign an intent to their own account, and each attempt (message, channel, the guard's verdict and reason codes, and where an unguarded agent would have sent it) goes into a public live feed with running totals. It is simulated end to end: no funds are at risk and nothing is broadcast. Attempts are anonymous, rate-limited to 10 a minute per client, kept in memory (the feed resets on restart), and a guard bypass is flagged as a **break** and counted rather than hidden. The agent is a worst-case stand-in that follows the latest instruction it recognises, so a clean feed shows what the guard does, not how a real model behaves.

**Live signer in the console.** Start both processes with `make near-stack` (the API gets `NEAR_ADAPTER_URL`). A NEAR scenario run from the console or `/api/run` then ends in one of three ways: `ALLOW` and the Rust signer returns a real NEP-413 signature (shown in the run's inspector); `ASK_OWNER` and nothing is signed until the owner approves, after which the same code path signs exactly the decided intent; or `BLOCK` and the signer is never called. The console checks each signature **in your browser** (rebuilds the NEP-413 bytes, sha256, ed25519 verify with WebCrypto), so you do not have to trust the server's word that it is valid. Without `NEAR_ADAPTER_URL` the same runs are recorded as `SIMULATED_SIGNED`, and the UI says so. A signed intent is described as "signed", never as "money moved": it settles only if someone broadcasts it, and until then it is a bearer instrument.

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

</details>

## Limitations

- Tracing is exact-match on identifiers (emails, accounts). It does not follow derived values; the amount is bounded by the PO instead of traced.
- Memory written with untrusted context in view is conservatively tainted, which can cost utility (more owner asks).
- A poisoned vendor master or a compromised owner channel is out of scope.
- T1 sender matching is spoofable, so it never sets payment fields.
- The `compromised` results come from a simulation, and the scenario set is small and written by the author, so the 0% attack-success figure describes this benchmark, not security in general. This is a deterministic enforcement point with measured results, not a proof of security.
- PayPal calls are tested against a mocked sandbox server in the unit tests, and have also been run against the real sandbox: a legitimate invoice payout (B1) and an unguarded attack payout (A2, simulated compromised agent) were each accepted by PayPal with status `PENDING`, and the same attack behind Lineage was held for the owner with no payout. A first attempt from a sandbox business account in India was rejected by PayPal (see the quickstart note on the payer's country). Receipt of the funds in the payee accounts is checked by hand in the sandbox dashboard, not by the app.
- The real-model (`llm`) benchmark mode has not been run.

## Layout

```
cmd/lineage        server              cmd/bench      benchmark runner
internal/prov      trust tiers, ingestion rules, tracing
internal/guard     decide(): static, binding, provenance
internal/audit     hash-chained log
internal/records   SQLite persistence
internal/executor  guarded payment executor (PayPal rail, simulated rail)
internal/paypal    sandbox-pinned OAuth + Payouts client
internal/agent     tool-use loop, LLM interface, scripted/compromised modes
internal/scenario  scenario loader and runner
internal/web       JSON API (/v1 for agents, /api for the website)
adapters/near      Rust NEP-413 signer for NEAR Intents
web/               Next.js (App Router, TypeScript) landing site and console
scenarios/         PayBench-BEC scenario files
assets/screens/    screenshots used in this README
```

Stack: Go standard library, `modernc.org/sqlite` (pure Go, no cgo), `golang.org/x/text`; Next.js 16 with GSAP and Lenis; Rust with `ed25519-dalek`. Run `make test`, `make lint`, `make bench`, `make near-test`; the website has `npm run typecheck`, `npm run lint` and `npm run build`. CI runs all of them on every push.

## Tools used

- PayPal developer platform: OAuth and the Payouts API, sandbox only.
- Anthropic Messages API with tool use for the optional `llm` agent mode (model chosen via `LLM_MODEL`).
- Built with Claude Code.

## Roadmap

Run the benchmark against real models, finish real NEAR Intents execution, intent-specific attack scenarios, and a CrAIBench bridge. The guard core is shared with a separate NEAR Hackathon submission.

## License

[MIT](LICENSE)
