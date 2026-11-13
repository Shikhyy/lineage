package executor

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/records"
)

type fakeSigner struct {
	signs int
	fail  bool
}

func (f *fakeSigner) Nonce(context.Context) (string, error) { return "c2FsdGVkLW5vbmNl", nil }
func (f *fakeSigner) Sign(_ context.Context, _, id string, _ guard.IntentArgs) (json.RawMessage, error) {
	f.signs++
	if f.fail {
		return nil, errors.New("adapter down")
	}
	return json.RawMessage(`{"decision":"ALLOW","signed":{"signature":"ed25519:test","decision":"` + id + `"}}`), nil
}

func saveIntentDecision(t *testing.T, f *fixture, verdict guard.Verdict) records.Decision {
	t.Helper()
	in := guard.IntentArgs{InvoiceID: "inv_1", Destination: "acme.testnet", Asset: "nep141:usdc.test", AmountCents: 125000, DeadlineUnix: 1_800_000_000, Nonce: "n1"}
	j, _ := json.Marshal(in)
	d, err := f.rec.SaveDecision(records.Decision{RunID: "run_1", Tool: guard.ToolSignIntent, ArgsJSON: string(j), ArgsHash: in.Hash(),
		Decision: string(verdict), ReasonsJSON: "[]", LineageJSON: "[]"})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func TestSignIntentSignsOnceAndIsIdempotent(t *testing.T) {
	f := newFixture(t)
	s := &fakeSigner{}
	f.ex.UseSigner(s)
	d := saveIntentDecision(t, f, guard.Allow)
	p, dup, err := f.ex.SignIntent(context.Background(), d.ID)
	if err != nil || dup || p.Status != "SIGNED" || p.Rail != "near-adapter" {
		t.Fatalf("first sign: %+v dup=%v err=%v", p, dup, err)
	}
	p2, dup, err := f.ex.SignIntent(context.Background(), d.ID)
	if err != nil || !dup || p2.ID != p.ID || s.signs != 1 {
		t.Fatalf("second sign must be a no-op duplicate: dup=%v signs=%d err=%v", dup, s.signs, err)
	}
}

func TestSignIntentRefusesUnapprovedAndBlocked(t *testing.T) {
	f := newFixture(t)
	s := &fakeSigner{}
	f.ex.UseSigner(s)
	for _, v := range []guard.Verdict{guard.AskOwner, guard.Block} {
		d := saveIntentDecision(t, f, v)
		if _, _, err := f.ex.SignIntent(context.Background(), d.ID); !errors.Is(err, ErrNotAuthorized) {
			t.Fatalf("%s must not sign, got %v", v, err)
		}
	}
	if s.signs != 0 {
		t.Fatalf("signer was called %d times", s.signs)
	}
}

func TestSignIntentAfterOwnerApproval(t *testing.T) {
	f := newFixture(t)
	f.ex.UseSigner(&fakeSigner{})
	d := saveIntentDecision(t, f, guard.AskOwner)
	ap, err := f.rec.CreateApproval(d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.rec.ResolveApproval(ap.ID, "approved", "owner"); err != nil {
		t.Fatal(err)
	}
	if p, _, err := f.ex.SignIntent(context.Background(), d.ID); err != nil || p.Status != "SIGNED" {
		t.Fatalf("approved intent should sign: %+v %v", p, err)
	}
}

func TestSignIntentSignerFailureCanBeRetried(t *testing.T) {
	f := newFixture(t)
	s := &fakeSigner{fail: true}
	f.ex.UseSigner(s)
	d := saveIntentDecision(t, f, guard.Allow)
	if _, _, err := f.ex.SignIntent(context.Background(), d.ID); err == nil {
		t.Fatal("expected a signer error")
	}
	s.fail = false
	if p, _, err := f.ex.SignIntent(context.Background(), d.ID); err != nil || p.Status != "SIGNED" {
		t.Fatalf("retry should sign: %+v %v", p, err)
	}
}

func TestSignIntentWithoutSignerIsLabelledSimulated(t *testing.T) {
	f := newFixture(t)
	d := saveIntentDecision(t, f, guard.Allow)
	p, _, err := f.ex.SignIntent(context.Background(), d.ID)
	if err != nil || p.Status != "SIMULATED_SIGNED" || p.Rail != "near-simulated" {
		t.Fatalf("%+v %v", p, err)
	}
}

func TestSignIntentRefusesAlteredArguments(t *testing.T) {
	f := newFixture(t)
	d := saveIntentDecision(t, f, guard.Allow)
	f.raw(`UPDATE decisions SET args_json = replace(args_json,'acme.testnet','attacker.testnet') WHERE id = ?`, d.ID)
	if _, _, err := f.ex.SignIntent(context.Background(), d.ID); !errors.Is(err, ErrArgsMismatch) {
		t.Fatalf("altered stored intent must be refused, got %v", err)
	}
}
