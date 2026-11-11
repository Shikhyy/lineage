// Package guard decides whether an agent's payment tool call may execute.
//
// The decision is made outside the LLM from three layers:
//
//	C1 static policy  - caps, currency allowlist, duplicate invoices
//	C2 record binding - amount and vendor must match the approved PO
//	C3 provenance     - the payee must be grounded in trusted sources
package guard

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
)

// Verdict is the outcome of a decision.
type Verdict string

const (
	Allow    Verdict = "ALLOW"
	AskOwner Verdict = "ASK_OWNER"
	Block    Verdict = "BLOCK"
)

func strictness(v Verdict) int {
	switch v {
	case Block:
		return 2
	case AskOwner:
		return 1
	}
	return 0
}

// Reason codes.
const (
	AmountOverCap          = "AMOUNT_OVER_CAP"
	DailyCap               = "DAILY_CAP"
	CurrencyNotAllowed     = "CURRENCY_NOT_ALLOWED"
	DuplicateInvoice       = "DUPLICATE_INVOICE"
	AmountExceedsPO        = "AMOUNT_EXCEEDS_PO"
	AmountMismatchInvoice  = "AMOUNT_MISMATCH_INVOICE"
	CurrencyMismatch       = "CURRENCY_MISMATCH"
	InvoicePOMismatch      = "INVOICE_PO_MISMATCH"
	PayeeBelongsToOther    = "PAYEE_BELONGS_TO_OTHER_VENDOR"
	UntrustedPayeeChange   = "UNTRUSTED_PAYEE_CHANGE"
	UngroundedPayee        = "UNGROUNDED_PAYEE"
	OwnerInstructedDiffers = "OWNER_INSTRUCTED_DIFFERS_FROM_MASTER"
	UnknownInvoice         = "UNKNOWN_INVOICE"
	UnsupportedTool        = "UNSUPPORTED_TOOL"
	MalformedCall          = "MALFORMED_CALL"
)

// Config controls the guard. The three Enabled flags exist for ablations.
type Config struct {
	PerTxCapCents int64
	DailyCapCents int64
	ToleranceBPS  int64 // allowed overage on the PO, in basis points
	Currencies    []string

	StaticEnabled  bool // C1
	BindingEnabled bool // C2
	ProvEnabled    bool // C3
}

// DefaultConfig enables every layer.
func DefaultConfig() Config {
	return Config{
		PerTxCapCents:  500000,
		DailyCapCents:  1500000,
		ToleranceBPS:   0,
		Currencies:     []string{"USD"},
		StaticEnabled:  true,
		BindingEnabled: true,
		ProvEnabled:    true,
	}
}

// PayArgs are the arguments of the pay_vendor tool.
type PayArgs struct {
	InvoiceID   string `json:"invoice_id"`
	Payee       string `json:"payee"`
	AmountCents int64  `json:"amount_cents"`
	Currency    string `json:"currency"`
	Rail        string `json:"rail,omitempty"`
}

// Hash is sha256 of the canonical JSON of the arguments. The executor
// refuses to run if the hash differs from the one stored with the decision.
func (a PayArgs) Hash() string {
	b, _ := json.Marshal(a)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Call is a tool call submitted for a decision.
type Call struct {
	Tool string  `json:"tool"`
	Args PayArgs `json:"args"`
}

// Reason explains part of a decision.
type Reason struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	Effect  Verdict `json:"effect"`
}

// LineageEntry shows where one critical field came from.
type LineageEntry struct {
	Field    string        `json:"field"`
	Value    string        `json:"value"`
	Grounded bool          `json:"grounded"`
	Source   string        `json:"source"` // human summary
	Origins  []prov.Origin `json:"origins,omitempty"`
}

// Result is the full output of a decision.
type Result struct {
	Verdict  Verdict        `json:"decision"`
	Reasons  []Reason       `json:"reasons"`
	Lineage  []LineageEntry `json:"lineage"`
	ArgsHash string         `json:"args_hash"`
}

// Has reports whether the result carries the reason code.
func (r Result) Has(code string) bool {
	for _, x := range r.Reasons {
		if x.Code == code {
			return true
		}
	}
	return false
}

// Guard evaluates calls against records.
type Guard struct {
	cfg   Config
	rec   *records.Store
	audit *audit.Log // optional
}

// New returns a Guard. audit may be nil (pure evaluation, e.g. in tests).
func New(cfg Config, rec *records.Store, a *audit.Log) *Guard {
	return &Guard{cfg: cfg, rec: rec, audit: a}
}

// Config returns the active configuration.
func (g *Guard) Config() Config { return g.cfg }

func (g *Guard) currencyAllowed(c string) bool {
	for _, a := range g.cfg.Currencies {
		if strings.EqualFold(a, c) {
			return true
		}
	}
	return false
}

// Decide evaluates a call. It does not persist anything.
func (g *Guard) Decide(call Call, fragIDs []string) (Result, error) {
	res := Result{Verdict: Allow, ArgsHash: call.Args.Hash(), Reasons: []Reason{}, Lineage: []LineageEntry{}}
	add := func(code, msg string, effect Verdict) {
		res.Reasons = append(res.Reasons, Reason{Code: code, Message: msg, Effect: effect})
		if strictness(effect) > strictness(res.Verdict) {
			res.Verdict = effect
		}
	}

	if call.Tool != "pay_vendor" {
		add(UnsupportedTool, fmt.Sprintf("tool %q is not a guarded payment tool", call.Tool), Block)
		return res, nil
	}
	a := call.Args
	if a.InvoiceID == "" || a.Payee == "" || a.AmountCents <= 0 || a.Currency == "" {
		add(MalformedCall, "invoice_id, payee, amount_cents and currency are required", Block)
		return res, nil
	}

	// Records come from the database, never from the agent.
	inv, err := g.rec.GetInvoice(a.InvoiceID)
	if errors.Is(err, records.ErrNotFound) {
		add(UnknownInvoice, "invoice "+a.InvoiceID+" does not exist", Block)
		return res, nil
	} else if err != nil {
		return res, err
	}
	po, err := g.rec.GetPO(inv.POID)
	if err != nil && !errors.Is(err, records.ErrNotFound) {
		return res, err
	}
	poFound := err == nil
	vendor, err := g.rec.GetVendor(inv.VendorID)
	if err != nil && !errors.Is(err, records.ErrNotFound) {
		return res, err
	}
	vendorFound := err == nil

	// C1 static policy.
	if g.cfg.StaticEnabled {
		if a.AmountCents > g.cfg.PerTxCapCents {
			add(AmountOverCap, fmt.Sprintf("amount %d exceeds per-transaction cap %d", a.AmountCents, g.cfg.PerTxCapCents), Block)
		}
		paid, err := g.rec.PaidToday()
		if err != nil {
			return res, err
		}
		if paid+a.AmountCents > g.cfg.DailyCapCents {
			add(DailyCap, fmt.Sprintf("daily total would reach %d, cap is %d", paid+a.AmountCents, g.cfg.DailyCapCents), Block)
		}
		if !g.currencyAllowed(a.Currency) {
			add(CurrencyNotAllowed, "currency "+a.Currency+" is not allowed", Block)
		}
		if inv.Status == "paid" {
			add(DuplicateInvoice, "invoice "+inv.ID+" was already paid", Block)
		}
	}

	// C2 binding to trusted records.
	if g.cfg.BindingEnabled {
		switch {
		case !poFound || !vendorFound:
			add(InvoicePOMismatch, "invoice has no matching purchase order or vendor on file", Block)
		default:
			if inv.VendorID != po.VendorID {
				add(InvoicePOMismatch, "invoice vendor differs from the purchase order vendor", Block)
			}
			limit := po.ApprovedAmountCents * (10000 + g.cfg.ToleranceBPS) / 10000
			if a.AmountCents > limit {
				add(AmountExceedsPO, fmt.Sprintf("amount %d exceeds approved PO amount %d", a.AmountCents, po.ApprovedAmountCents), Block)
			}
			if a.AmountCents != inv.AmountCents {
				add(AmountMismatchInvoice, fmt.Sprintf("amount %d differs from invoice amount %d", a.AmountCents, inv.AmountCents), Block)
			}
			if !strings.EqualFold(a.Currency, po.Currency) {
				add(CurrencyMismatch, "currency differs from the purchase order currency", Block)
			}
		}
		// Confused deputy: payee is a different vendor's registered address.
		if vendorFound {
			if other, err := g.rec.VendorByEmail(a.Payee); err == nil && other.ID != vendor.ID {
				add(PayeeBelongsToOther, fmt.Sprintf("payee is the registered address of %s, not %s", other.Name, vendor.Name), Block)
			}
		}
	}

	// C3 provenance of the payee.
	if g.cfg.ProvEnabled {
		if !vendorFound {
			add(UngroundedPayee, "no vendor master to ground the payee against", AskOwner)
		} else if prov.Normalize(a.Payee) == prov.Normalize(vendor.PayoutEmail) {
			res.Lineage = append(res.Lineage, LineageEntry{
				Field: "payee", Value: a.Payee, Grounded: true,
				Source: "vendor master record for " + vendor.Name + " (T2)",
			})
		} else {
			frags, err := g.rec.Fragments(fragIDs)
			if err != nil {
				return res, err
			}
			origins := prov.Trace(a.Payee, frags)
			entry := LineageEntry{Field: "payee", Value: a.Payee, Origins: origins}
			switch {
			case len(origins) > 0 && origins[0].Trust == prov.T3Owner:
				entry.Grounded = true
				entry.Source = "owner instruction (T3), differs from vendor master"
				add(OwnerInstructedDiffers, "payee differs from the vendor master but was given by the owner", Allow)
			case len(origins) > 0:
				entry.Source = fmt.Sprintf("only %s sources: %s", origins[0].Trust.Label(), describe(origins))
				add(UntrustedPayeeChange, "payee differs from the vendor master and appears only in untrusted context", AskOwner)
			default:
				entry.Source = "appears in no context fragment"
				add(UngroundedPayee, "payee appears nowhere in the context: hallucinated or smuggled value", AskOwner)
			}
			res.Lineage = append(res.Lineage, entry)
		}
	}
	return res, nil
}

func describe(os []prov.Origin) string {
	parts := make([]string, 0, len(os))
	for _, o := range os {
		parts = append(parts, fmt.Sprintf("%s %s (%s)", o.Kind, o.FragmentID, o.Trust))
	}
	return strings.Join(parts, ", ")
}

// Recorded is a persisted decision.
type Recorded struct {
	Decision records.Decision  `json:"decision"`
	Result   Result            `json:"result"`
	Approval *records.Approval `json:"approval,omitempty"`
}

// DecideAndRecord evaluates a call, persists the decision, opens an approval
// for ASK_OWNER, and appends to the audit log.
func (g *Guard) DecideAndRecord(runID string, call Call, fragIDs []string) (Recorded, error) {
	res, err := g.Decide(call, fragIDs)
	if err != nil {
		return Recorded{}, err
	}
	argsJSON, _ := json.Marshal(call.Args)
	reasons, _ := json.Marshal(res.Reasons)
	lineage, _ := json.Marshal(res.Lineage)
	d, err := g.rec.SaveDecision(records.Decision{
		RunID: runID, Tool: call.Tool, ArgsJSON: string(argsJSON), ArgsHash: res.ArgsHash,
		Decision: string(res.Verdict), ReasonsJSON: string(reasons), LineageJSON: string(lineage),
	})
	if err != nil {
		return Recorded{}, err
	}
	out := Recorded{Decision: d, Result: res}
	if res.Verdict == AskOwner {
		ap, err := g.rec.CreateApproval(d.ID)
		if err != nil {
			return Recorded{}, err
		}
		out.Approval = &ap
	}
	if g.audit != nil {
		if _, err := g.audit.Append("decision", map[string]any{
			"decision_id": d.ID, "run_id": runID, "tool": call.Tool, "args_hash": res.ArgsHash,
			"verdict": res.Verdict, "reasons": res.Reasons,
		}); err != nil {
			return Recorded{}, err
		}
	}
	return out, nil
}
