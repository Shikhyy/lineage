package executor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/records"
)

// IntentSigner produces a real signature for an authorized NEAR intent. When
// the executor has none, intents are recorded as SIMULATED_SIGNED.
type IntentSigner interface {
	Nonce(ctx context.Context) (string, error)
	Sign(ctx context.Context, runID, decisionID string, intent guard.IntentArgs) (json.RawMessage, error)
}

// UseSigner attaches the NEAR signer (the Rust adapter).
func (e *Executor) UseSigner(s IntentSigner) { e.signer = s }

// SignerLive reports whether a real signer is attached.
func (e *Executor) SignerLive() bool { return e.signer != nil }

// IntentNonce returns the nonce for a new intent: salted by the live signer
// when there is one, otherwise a random identifier.
func (e *Executor) IntentNonce(ctx context.Context) string {
	if e.signer != nil {
		if n, err := e.signer.Nonce(ctx); err == nil {
			return n
		}
	}
	return records.NewID("nonce")
}

// SignIntent settles an authorized sign_intent decision, once. Like Execute it
// refuses anything the guard did not allow (or the owner did not approve),
// anything whose stored arguments were altered, and never signs twice.
func (e *Executor) SignIntent(ctx context.Context, decisionID string) (records.Payment, bool, error) {
	d, err := e.rec.GetDecision(decisionID)
	if err != nil {
		return records.Payment{}, false, err
	}
	if d.Tool != guard.ToolSignIntent {
		return records.Payment{}, false, fmt.Errorf("decision %s is not a sign_intent decision", d.ID)
	}
	switch guard.Verdict(d.Decision) {
	case guard.Allow:
	case guard.AskOwner:
		ap, err := e.rec.ApprovalForDecision(d.ID)
		if err != nil || ap.Status != "approved" {
			return records.Payment{}, false, fmt.Errorf("%w: awaiting owner approval", ErrNotAuthorized)
		}
	default:
		return records.Payment{}, false, fmt.Errorf("%w: decision is %s", ErrNotAuthorized, d.Decision)
	}
	var intent guard.IntentArgs
	if err := json.Unmarshal([]byte(d.ArgsJSON), &intent); err != nil {
		return records.Payment{}, false, fmt.Errorf("stored arguments unreadable: %w", err)
	}
	if intent.Hash() != d.ArgsHash {
		return records.Payment{}, false, fmt.Errorf("%w: stored decision was altered", ErrArgsMismatch)
	}
	existing, err := e.rec.PaymentForDecision(d.ID)
	switch {
	case err == nil && existing.Status != "failed":
		return existing, true, nil
	case err != nil && !errors.Is(err, records.ErrNotFound):
		return records.Payment{}, false, err
	}

	reqJSON, _ := json.Marshal(intent)
	rail, status, resp := "near-simulated", "SIMULATED_SIGNED", json.RawMessage(`{"simulated":true}`)
	if e.signer != nil {
		rail = "near-adapter"
		raw, serr := e.signer.Sign(ctx, d.RunID, d.ID, intent)
		if serr != nil {
			failed, _ := json.Marshal(map[string]string{"error": serr.Error()})
			if err == nil { // an earlier failed attempt: update it
				_ = e.rec.UpdatePayment(existing.ID, string(failed), "failed")
			} else {
				_, _ = e.rec.SavePayment(records.Payment{DecisionID: d.ID, Rail: rail, RequestJSON: string(reqJSON), ResponseJSON: string(failed), Status: "failed"})
			}
			e.log("intent_sign_failed", map[string]any{"decision_id": d.ID, "error": serr.Error()})
			return records.Payment{}, false, fmt.Errorf("signer: %w", serr)
		}
		status, resp = "SIGNED", raw
	}
	var pay records.Payment
	if err == nil {
		pay = existing
		if uerr := e.rec.UpdatePayment(pay.ID, string(resp), status); uerr != nil {
			return records.Payment{}, false, uerr
		}
		pay.ResponseJSON, pay.Status = string(resp), status
	} else {
		pay, err = e.rec.SavePayment(records.Payment{DecisionID: d.ID, Rail: rail, RequestJSON: string(reqJSON), ResponseJSON: string(resp), Status: status})
		if err != nil {
			return records.Payment{}, false, err
		}
	}
	e.log("intent_signed", map[string]any{"decision_id": d.ID, "rail": rail, "status": status})
	return pay, false, nil
}
