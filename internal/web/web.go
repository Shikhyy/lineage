// Package web serves the JSON API used by the Next.js frontend (see /web) and by external agents.
package web

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
	"github.com/Shikhyy/lineage/internal/scenario"
)

// Server holds the dependencies of every handler.
type Server struct {
	Rec         *records.Store
	Audit       *audit.Log
	Exec        *executor.Executor
	Guard       guard.Config
	Addr        scenario.Addresses
	Secret      string    // owner secret (cookie login and X-Owner-Secret header)
	LLM         agent.LLM // nil when no API key is configured
	LLMModel    string
	Simulated   bool   // payment rail is simulated (no PayPal credentials)
	ResultsPath string // results/latest.md

	lim   limiter
	runMu sync.Mutex // serializes demo runs: they reseed the shared fixtures
}

// Handler builds the HTTP handler.
func (s *Server) Handler() (http.Handler, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service": "lineage-api",
			"note":    "This is the JSON API. The website is the Next.js app in /web.",
			"docs":    "https://github.com/Shikhyy/lineage#api",
		})
	})
	mux.HandleFunc("GET /api/bench", s.apiBench)
	s.apiRoutes(mux)
	s.appRoutes(mux)
	return mux, nil
}

// ---- auth ----

func (s *Server) token() string {
	sum := sha256.Sum256([]byte("lineage-owner:" + s.Secret))
	return hex.EncodeToString(sum[:])
}

func (s *Server) isOwner(r *http.Request) bool {
	if s.Secret == "" {
		return false
	}
	if h := r.Header.Get("X-Owner-Secret"); h != "" {
		return subtle.ConstantTimeCompare([]byte(h), []byte(s.Secret)) == 1
	}
	c, err := r.Cookie("owner")
	return err == nil && subtle.ConstantTimeCompare([]byte(c.Value), []byte(s.token())) == 1
}

// apiBench serves the benchmark summary written by `make bench`.
func (s *Server) apiBench(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(filepath.Join(filepath.Dir(s.ResultsPath), "summary.json"))
	if err != nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(b)
}

// ---- decision views (converted to JSON in appapi.go) ----

type chainView struct {
	ID, Kind, Snippet string
	Trust             prov.Trust
}

type originView struct {
	prov.Origin
	Snippet string
	Chain   []chainView
}

type lineageView struct {
	guard.LineageEntry
	Origins []originView
}

type decisionView struct {
	ID       string
	RunID    string
	Verdict  string
	Reasons  []guard.Reason
	Lineage  []lineageView
	Args     guard.PayArgs
	Approval *records.Approval
	Payment  *records.Payment
	Created  string
}

func snippet(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > 160 {
		s = s[:160] + "…"
	}
	return s
}

func (s *Server) decisionView(d records.Decision) decisionView {
	v := decisionView{ID: d.ID, RunID: d.RunID, Verdict: d.Decision, Created: d.CreatedAt}
	_ = json.Unmarshal([]byte(d.ReasonsJSON), &v.Reasons)
	_ = json.Unmarshal([]byte(d.ArgsJSON), &v.Args)
	var entries []guard.LineageEntry
	_ = json.Unmarshal([]byte(d.LineageJSON), &entries)
	for _, e := range entries {
		lv := lineageView{LineageEntry: e}
		for _, o := range e.Origins {
			ov := originView{Origin: o}
			if fs, _ := s.Rec.Fragments([]string{o.FragmentID}); len(fs) == 1 {
				ov.Snippet = snippet(fs[0].Content)
			}
			for _, cid := range o.Chain {
				if fs, _ := s.Rec.Fragments([]string{cid}); len(fs) == 1 {
					ov.Chain = append(ov.Chain, chainView{ID: cid, Kind: string(fs[0].Kind), Trust: fs[0].Trust, Snippet: snippet(fs[0].Content)})
				}
			}
			lv.Origins = append(lv.Origins, ov)
		}
		v.Lineage = append(v.Lineage, lv)
	}
	if ap, err := s.Rec.ApprovalForDecision(d.ID); err == nil {
		v.Approval = &ap
	}
	if p, err := s.Rec.PaymentForDecision(d.ID); err == nil {
		v.Payment = &p
	}
	return v
}

type payoutView struct {
	Payee, Rail, Status string
	Cents               int64
}

// summarize states plainly what happened to the money in a run.
func summarize(payouts []payoutView, decs []decisionView) (string, string) {
	// A payout the rail rejected sent nothing, so it must never be reported as money moved.
	var sent, failed []string
	for _, p := range payouts {
		line := fmt.Sprintf("$%d.%02d to %s", p.Cents/100, p.Cents%100, p.Payee)
		if p.Status == "failed" {
			failed = append(failed, line)
		} else {
			sent = append(sent, line)
		}
	}
	if len(sent) > 0 {
		return "Money moved: " + strings.Join(sent, "; ") + ".", "moved"
	}
	if len(failed) > 0 {
		return "No money moved. The payout could not be completed at the payment rail (" + strings.Join(failed, "; ") + "), so nothing was sent.", "failed"
	}
	pending, blocked := 0, 0
	for _, d := range decs {
		if d.Approval != nil && d.Approval.Status == "pending" {
			pending++
		} else if d.Verdict == string(guard.Block) {
			blocked++
		}
	}
	switch {
	case pending > 0:
		return fmt.Sprintf("No money moved. %d payment(s) waiting for owner approval.", pending), "safe"
	case blocked > 0:
		return fmt.Sprintf("No money moved. The guard blocked %d payment(s).", blocked), "safe"
	}
	return "No money moved.", "safe"
}

// resolve approves or rejects an approval; on approval it executes the payment.
func (s *Server) resolve(ctx context.Context, id, status string) (runID string, err error) {
	ap, err := s.Rec.GetApproval(id)
	if err != nil {
		return "", err
	}
	d, err := s.Rec.GetDecision(ap.DecisionID)
	if err != nil {
		return "", err
	}
	if err := s.Rec.ResolveApproval(id, status, "owner"); err != nil {
		return d.RunID, err
	}
	if s.Audit != nil {
		_, _ = s.Audit.Append("approval_"+status, map[string]string{"approval_id": id, "decision_id": d.ID})
	}
	if status == "rejected" {
		_ = s.Rec.AddStep(d.RunID, "owner", "Owner rejected the held payment", map[string]any{"decision_id": d.ID, "approval_id": id})
	}
	if status == "approved" {
		out, err := s.Exec.Execute(ctx, d.ID, nil)
		if err != nil {
			_ = s.Rec.AddStep(d.RunID, "error", "Owner approved, but the payout failed: "+err.Error(), map[string]any{"decision_id": d.ID})
			return d.RunID, err
		}
		var a guard.PayArgs
		_ = json.Unmarshal([]byte(d.ArgsJSON), &a)
		_ = s.Rec.AddStep(d.RunID, "payment",
			fmt.Sprintf("owner approved: paid %s %d cents (%s)", a.Payee, a.AmountCents, out.Payment.Status),
			map[string]any{"decision_id": d.ID, "owner_approved": true, "payment": out.Payment, "rail": s.Exec.RailName()})
	}
	return d.RunID, nil
}
