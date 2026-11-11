package guard

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
)

// ToolSignIntent is the guarded tool for signing a NEAR Intents message.
const ToolSignIntent = "sign_intent"

// Intent reason codes.
const (
	AssetNotAllowed = "ASSET_NOT_ALLOWED"
	DeadlineTooLong = "DEADLINE_TOO_LONG"
	DeadlineExpired = "DEADLINE_EXPIRED"
	NonceReused     = "NONCE_REUSED"
	NoNearAccount   = "NO_NEAR_ACCOUNT"
)

// IntentArgs are the critical fields of an intent the agent wants signed.
type IntentArgs struct {
	InvoiceID    string `json:"invoice_id"`
	Destination  string `json:"destination"`
	Asset        string `json:"asset"`
	AmountCents  int64  `json:"amount_cents"` // USD value, bounded by the PO
	DeadlineUnix int64  `json:"deadline_unix"`
	Nonce        string `json:"nonce"`
}

// Hash is sha256 of the canonical JSON of the intent arguments.
func (a IntentArgs) Hash() string {
	b, _ := json.Marshal(a)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func (g *Guard) now() time.Time {
	if g.Now != nil {
		return g.Now()
	}
	return time.Now()
}

func (g *Guard) assetAllowed(a string) bool {
	for _, x := range g.cfg.AllowedAssets {
		if prov.Normalize(x) == prov.Normalize(a) {
			return true
		}
	}
	return false
}

func (g *Guard) decideIntent(call Call, fragIDs []string) (Result, error) {
	a := call.Intent
	res := Result{Verdict: Allow, Reasons: []Reason{}, Lineage: []LineageEntry{}}
	add := func(code, msg string, effect Verdict) {
		res.Reasons = append(res.Reasons, Reason{Code: code, Message: msg, Effect: effect})
		if strictness(effect) > strictness(res.Verdict) {
			res.Verdict = effect
		}
	}
	if a == nil || a.InvoiceID == "" || a.Destination == "" || a.Asset == "" || a.AmountCents <= 0 || a.DeadlineUnix <= 0 || a.Nonce == "" {
		add(MalformedCall, "invoice_id, destination, asset, amount_cents, deadline_unix and nonce are required", Block)
		return res, nil
	}
	res.ArgsHash = a.Hash()

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

	// C1 static policy: caps, asset allowlist, short-lived deadline, fresh nonce.
	if g.cfg.StaticEnabled {
		if a.AmountCents > g.cfg.PerTxCapCents {
			add(AmountOverCap, fmt.Sprintf("amount %d exceeds per-transaction cap %d", a.AmountCents, g.cfg.PerTxCapCents), Block)
		}
		if !g.assetAllowed(a.Asset) {
			add(AssetNotAllowed, "asset "+a.Asset+" is not on the allowlist", Block)
		}
		ttl := time.Unix(a.DeadlineUnix, 0).Sub(g.now())
		switch {
		case ttl <= 0:
			add(DeadlineExpired, "intent deadline is already in the past", Block)
		case ttl > g.cfg.MaxIntentTTL:
			add(DeadlineTooLong, fmt.Sprintf("deadline is %s away; the maximum is %s", ttl.Round(time.Second), g.cfg.MaxIntentTTL), Block)
		}
		if used, err := g.rec.NonceUsed(a.Nonce); err != nil {
			return res, err
		} else if used {
			add(NonceReused, "nonce was already used", Block)
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
			if a.AmountCents > po.ApprovedAmountCents*(10000+g.cfg.ToleranceBPS)/10000 {
				add(AmountExceedsPO, fmt.Sprintf("amount %d exceeds approved PO amount %d", a.AmountCents, po.ApprovedAmountCents), Block)
			}
			if a.AmountCents != inv.AmountCents {
				add(AmountMismatchInvoice, fmt.Sprintf("amount %d differs from invoice amount %d", a.AmountCents, inv.AmountCents), Block)
			}
			if vendor.NearAccount == "" {
				add(NoNearAccount, vendor.Name+" has no NEAR account on file", Block)
			}
		}
		if vendorFound {
			if other, err := g.rec.VendorByNear(a.Destination); err == nil && other.ID != vendor.ID {
				add(PayeeBelongsToOther, fmt.Sprintf("destination is the registered account of %s, not %s", other.Name, vendor.Name), Block)
			}
		}
	}

	// C3 provenance of the destination.
	if g.cfg.ProvEnabled {
		switch {
		case !vendorFound || vendor.NearAccount == "":
			add(UngroundedPayee, "no vendor NEAR account to ground the destination against", AskOwner)
		case prov.Normalize(a.Destination) == prov.Normalize(vendor.NearAccount):
			res.Lineage = append(res.Lineage, LineageEntry{Field: "destination", Value: a.Destination, Grounded: true,
				Source: "vendor master NEAR account for " + vendor.Name + " (T2)"})
		default:
			frags, err := g.rec.Fragments(fragIDs)
			if err != nil {
				return res, err
			}
			origins := prov.Trace(a.Destination, frags)
			entry := LineageEntry{Field: "destination", Value: a.Destination, Origins: origins}
			switch {
			case len(origins) > 0 && origins[0].Trust == prov.T3Owner:
				entry.Grounded, entry.Source = true, "owner instruction (T3), differs from vendor master"
				add(OwnerInstructedDiffers, "destination differs from the vendor master but was given by the owner", Allow)
			case len(origins) > 0:
				entry.Source = fmt.Sprintf("only %s sources: %s", origins[0].Trust.Label(), describe(origins))
				add(UntrustedPayeeChange, "destination differs from the vendor master and appears only in untrusted context", AskOwner)
			default:
				entry.Source = "appears in no context fragment"
				add(UngroundedPayee, "destination appears nowhere in the context: hallucinated or smuggled value", AskOwner)
			}
			res.Lineage = append(res.Lineage, entry)
		}
	}
	return res, nil
}
