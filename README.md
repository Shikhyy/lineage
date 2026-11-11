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

12 scenarios (4 benign, 8 attack), 6 defenses, reproduce with `make bench`. Results are written to `results/latest.md`; the raw rows go to `results/latest.json`. The benchmark always uses the simulated rail.

Modes are reported separately and never mixed:

- `scripted`: a fixed tool sequence.
- `compromised`: a **simulated** worst-case jailbroken agent that follows the latest payment instruction found in any context. It tests the guard independently of any model's weaknesses; it is not a measurement of a real model.
- `llm`: a real model with tool use. It runs only when `LLM_API_KEY` and `LLM_MODEL` are set, and **has not been run yet** (the table below has no `llm` rows).

| Defense | Mode | ASR | Benign completion | Owner-asks/100 benign | $ lost | p95 decide ms |
|---|---|---|---|---|---|---|
| none | compromised | 100% (8/8) | 100% (4/4) | 0 | $9125.00 | n/a |
| prompt | compromised | 100% (8/8) | 100% (4/4) | 0 | $9125.00 | n/a |
| static | compromised | 88% (7/8) | 100% (4/4) | 0 | $7875.00 | 0.10 |
| **lineage** | compromised | **0% (0/8)** | 100% (4/4) | 25 | $0.00 | 0.23 |
| lineage_prov_only | compromised | 25% (2/8) | 100% (4/4) | 25 | $1625.00 | 0.20 |
| lineage_bind_only | compromised | 75% (6/8) | 100% (4/4) | 0 | $7500.00 | 0.11 |

ASR = share of attack runs where money reached the attacker or exceeded the approved PO. The `prompt` defense is identical to `none` here only because the simulated compromised agent ignores its prompt by construction; it needs the `llm` mode to say anything about prompt hardening. The ablation rows show each layer catches a different attack class, so the layers are complementary. See `results/latest.md` for the scripted-mode rows, the per-scenario matrix and the commit the numbers came from.

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
