// Package executor moves money. It is the only component that holds payment
// credentials, and it refuses to run unless the guard authorized the exact
// arguments that were decided.
package executor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/paypal"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
)

var (
	// ErrNotAuthorized means the decision is BLOCK, or ASK_OWNER without an approval.
	ErrNotAuthorized = errors.New("decision is not authorized for execution")
	// ErrArgsMismatch means the arguments differ from those the guard decided on.
	ErrArgsMismatch = errors.New("arguments do not match the decided arguments")
)

// PayRequest is what a rail receives.
type PayRequest struct {
	DecisionID  string
	InvoiceID   string
	Payee       string
	AmountCents int64
	Currency    string
}

// PayResult is what a rail returns.
type PayResult struct {
	Reference string          `json:"reference"`
	Status    string          `json:"status"`
	Simulated bool            `json:"simulated"`
	Raw       json.RawMessage `json:"raw,omitempty"`
}

// Rail is a payment rail.
type Rail interface {
	Name() string
	Pay(ctx context.Context, r PayRequest) (PayResult, error)
}

// PayPalRail pays through PayPal Payouts (sandbox).
type PayPalRail struct{ Client *paypal.Client }

func (PayPalRail) Name() string { return "paypal" }

func (p PayPalRail) Pay(ctx context.Context, r PayRequest) (PayResult, error) {
	res, err := p.Client.CreatePayout(ctx, paypal.PayoutRequest{
		IdempotencyKey: r.DecisionID, Receiver: r.Payee, AmountCents: r.AmountCents,
		Currency: r.Currency, Note: "Invoice " + r.InvoiceID, ItemID: r.InvoiceID,
	})
	if err != nil {
		return PayResult{Raw: res.Raw}, err
	}
	return PayResult{Reference: res.BatchID, Status: res.Status, Raw: res.Raw}, nil
}

// SimRail records a payment without moving money. It is used when no PayPal
// credentials are configured, and every result is labelled as simulated.
type SimRail struct{}

func (SimRail) Name() string { return "simulated" }

func (SimRail) Pay(_ context.Context, r PayRequest) (PayResult, error) {
	return PayResult{Reference: "sim_" + r.DecisionID, Status: "SIMULATED", Simulated: true}, nil
}

// Outcome describes the result of Execute.
type Outcome struct {
	Payment   records.Payment `json:"payment"`
	Duplicate bool            `json:"duplicate"` // true when an earlier successful payment was returned
}

// Executor runs authorized decisions.
type Executor struct {
	rec   *records.Store
	audit *audit.Log
	rail  Rail
}

// New returns an Executor. audit may be nil.
func New(rec *records.Store, a *audit.Log, rail Rail) *Executor {
	return &Executor{rec: rec, audit: a, rail: rail}
}

// RailName reports the rail in use.
func (e *Executor) RailName() string { return e.rail.Name() }

func (e *Executor) log(kind string, payload any) {
	if e.audit != nil {
		_, _ = e.audit.Append(kind, payload)
	}
}

// Execute pays an authorized decision. If args is non-nil it must hash to the
// decided arguments. Executing the same decision twice never pays twice.
func (e *Executor) Execute(ctx context.Context, decisionID string, args *guard.PayArgs) (Outcome, error) {
	d, err := e.rec.GetDecision(decisionID)
	if err != nil {
		return Outcome{}, err
	}

	approved := false
	switch guard.Verdict(d.Decision) {
	case guard.Allow:
	case guard.AskOwner:
		ap, err := e.rec.ApprovalForDecision(d.ID)
		if err != nil || ap.Status != "approved" {
			return Outcome{}, fmt.Errorf("%w: awaiting owner approval", ErrNotAuthorized)
		}
		approved = true
	default:
		return Outcome{}, fmt.Errorf("%w: decision is %s", ErrNotAuthorized, d.Decision)
	}

	var decided guard.PayArgs
	if err := json.Unmarshal([]byte(d.ArgsJSON), &decided); err != nil {
		return Outcome{}, fmt.Errorf("stored arguments unreadable: %w", err)
	}
	if decided.Hash() != d.ArgsHash {
		return Outcome{}, fmt.Errorf("%w: stored decision was altered", ErrArgsMismatch)
	}
	if args != nil && args.Hash() != d.ArgsHash {
		return Outcome{}, ErrArgsMismatch
	}

	existing, err := e.rec.PaymentForDecision(d.ID)
	switch {
	case err == nil && existing.Status != "failed":
		return Outcome{Payment: existing, Duplicate: true}, nil
	case err != nil && !errors.Is(err, records.ErrNotFound):
		return Outcome{}, err
	}

	// An owner-approved payee change updates the vendor master (T3 action).
	if approved {
		if err := e.applyApprovedPayee(d, decided); err != nil {
			return Outcome{}, err
		}
	}

	reqJSON, _ := json.Marshal(decided)
	pay := existing
	if errors.Is(err, records.ErrNotFound) {
		pay, err = e.rec.SavePayment(records.Payment{
			DecisionID: d.ID, Rail: e.rail.Name(), RequestJSON: string(reqJSON), ResponseJSON: "{}", Status: "pending",
		})
		if err != nil {
			return Outcome{}, err
		}
	}

	res, err := e.rail.Pay(ctx, PayRequest{
		DecisionID: d.ID, InvoiceID: decided.InvoiceID, Payee: decided.Payee,
		AmountCents: decided.AmountCents, Currency: decided.Currency,
	})
	if err != nil {
		resp, _ := json.Marshal(map[string]any{"error": err.Error(), "raw": res.Raw})
		_ = e.rec.UpdatePayment(pay.ID, string(resp), "failed")
		e.log("payment_failed", map[string]any{"decision_id": d.ID, "rail": e.rail.Name(), "error": err.Error()})
		return Outcome{}, fmt.Errorf("rail %s: %w", e.rail.Name(), err)
	}
	resp, _ := json.Marshal(res)
	if err := e.rec.UpdatePayment(pay.ID, string(resp), res.Status); err != nil {
		return Outcome{}, err
	}
	if err := e.rec.MarkInvoicePaid(decided.InvoiceID); err != nil {
		return Outcome{}, err
	}
	pay.ResponseJSON, pay.Status = string(resp), res.Status
	e.log("payment", map[string]any{
		"decision_id": d.ID, "rail": e.rail.Name(), "invoice_id": decided.InvoiceID, "payee": decided.Payee,
		"amount_cents": decided.AmountCents, "currency": decided.Currency, "status": res.Status,
		"reference": res.Reference, "simulated": res.Simulated, "owner_approved": approved,
	})
	return Outcome{Payment: pay}, nil
}

func (e *Executor) applyApprovedPayee(d records.Decision, a guard.PayArgs) error {
	inv, err := e.rec.GetInvoice(a.InvoiceID)
	if err != nil {
		return err
	}
	v, err := e.rec.GetVendor(inv.VendorID)
	if err != nil {
		return err
	}
	if prov.Normalize(v.PayoutEmail) == prov.Normalize(a.Payee) {
		return nil
	}
	old := v.PayoutEmail
	v.PayoutEmail, v.UpdatedBy = a.Payee, "owner-approval:"+d.ID
	if err := e.rec.UpsertVendor(v); err != nil {
		return err
	}
	e.log("vendor_updated", map[string]any{"vendor_id": v.ID, "old": old, "new": a.Payee, "decision_id": d.ID})
	return nil
}
