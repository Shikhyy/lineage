package web

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
	"github.com/Shikhyy/lineage/internal/scenario"
)

func (s *Server) apiRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/attack", s.apiAttack)
	mux.HandleFunc("POST /v1/fragments", s.apiFragment)
	mux.HandleFunc("POST /v1/decide", s.apiDecide)
	mux.HandleFunc("POST /v1/execute", s.apiExecute)
	mux.HandleFunc("GET /v1/decisions/{id}", s.apiDecision)
	mux.HandleFunc("POST /v1/decisions/{id}/attest", s.apiAttest)
	mux.HandleFunc("GET /v1/approvals", s.apiApprovals)
	mux.HandleFunc("POST /v1/approvals/{id}/approve", s.apiResolve("approved"))
	mux.HandleFunc("POST /v1/approvals/{id}/reject", s.apiResolve("rejected"))
	mux.HandleFunc("GET /v1/audit", s.apiAudit)
	mux.HandleFunc("GET /v1/audit/verify", s.apiVerify)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func apiErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		apiErr(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

// POST /v1/fragments registers a context fragment. The server, not the
// caller, assigns the trust tier. Owner and record fragments require the
// owner secret.
func (s *Server) apiFragment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RunID     string    `json:"run_id"`
		Kind      prov.Kind `json:"kind"`
		Content   string    `json:"content"`
		Source    string    `json:"source"`
		ParentIDs []string  `json:"parent_ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.RunID == "" || in.Content == "" {
		apiErr(w, http.StatusBadRequest, "run_id and content are required")
		return
	}
	switch in.Kind {
	case prov.KindEmail, prov.KindChat, prov.KindMemory, prov.KindTool:
	case prov.KindOwner, prov.KindRecord:
		if !s.isOwner(r) {
			apiErr(w, http.StatusForbidden, "owner and record fragments require owner authentication")
			return
		}
	default:
		apiErr(w, http.StatusBadRequest, "kind must be one of email, chat, memory, tool, owner, record")
		return
	}
	known := false
	if in.Kind == prov.KindEmail {
		_, err := s.Rec.VendorByEmail(in.Source)
		known = err == nil
	}
	trust := prov.AssignTrust(in.Kind, known)
	if in.Kind == prov.KindMemory {
		// A memory entry is only as trusted as the fragments it was written from.
		parents, _ := s.Rec.Fragments(in.ParentIDs)
		trust = prov.MemoryTrust(parents)
	}
	f, err := s.Rec.SaveFragment(prov.Fragment{RunID: in.RunID, Kind: in.Kind, Content: in.Content, Trust: trust, Source: in.Source, ParentIDs: in.ParentIDs})
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": f.ID, "trust": f.Trust.String(), "label": f.Trust.Label()})
}

// POST /v1/decide returns ALLOW, ASK_OWNER or BLOCK with reasons and lineage.
func (s *Server) apiDecide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RunID   string     `json:"run_id"`
		Call    guard.Call `json:"call"`
		Context []string   `json:"context"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.RunID == "" {
		apiErr(w, http.StatusBadRequest, "run_id is required")
		return
	}
	rec, err := guard.New(s.Guard, s.Rec, s.Audit).DecideAndRecord(in.RunID, in.Call, in.Context)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := map[string]any{
		"decision": rec.Result.Verdict, "reasons": rec.Result.Reasons, "lineage": rec.Result.Lineage,
		"decision_id": rec.Decision.ID, "args_hash": rec.Result.ArgsHash,
	}
	if rec.Approval != nil {
		out["approval_id"] = rec.Approval.ID
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /v1/execute pays an ALLOWed (or owner-approved) decision.
func (s *Server) apiExecute(w http.ResponseWriter, r *http.Request) {
	var in struct {
		DecisionID string         `json:"decision_id"`
		Args       *guard.PayArgs `json:"args"`
	}
	if !decode(w, r, &in) {
		return
	}
	out, err := s.Exec.Execute(r.Context(), in.DecisionID, in.Args)
	switch {
	case errors.Is(err, records.ErrNotFound):
		apiErr(w, http.StatusNotFound, "decision not found")
	case errors.Is(err, executor.ErrNotAuthorized):
		apiErr(w, http.StatusForbidden, err.Error())
	case errors.Is(err, executor.ErrArgsMismatch):
		apiErr(w, http.StatusConflict, err.Error())
	case err != nil:
		apiErr(w, http.StatusBadGateway, err.Error())
	default:
		writeJSON(w, http.StatusOK, map[string]any{"payment": out.Payment, "duplicate": out.Duplicate, "rail": s.Exec.RailName()})
	}
}

// GET /v1/decisions/{id} lets an external signer (the NEAR adapter) confirm
// that a decision is authorized: ALLOW, or ASK_OWNER with an approved approval.
func (s *Server) apiDecision(w http.ResponseWriter, r *http.Request) {
	d, err := s.Rec.GetDecision(r.PathValue("id"))
	if err != nil {
		apiErr(w, http.StatusNotFound, "decision not found")
		return
	}
	approval := ""
	if ap, err := s.Rec.ApprovalForDecision(d.ID); err == nil {
		approval = ap.Status
	}
	authorized := d.Decision == string(guard.Allow) || (d.Decision == string(guard.AskOwner) && approval == "approved")
	writeJSON(w, http.StatusOK, map[string]any{
		"decision_id": d.ID, "tool": d.Tool, "decision": d.Decision, "approval": approval,
		"authorized": authorized, "args_hash": d.ArgsHash, "args_json": json.RawMessage(d.ArgsJSON),
	})
}

// POST /v1/decisions/{id}/attest records, in the audit log, that an external
// signer acted on a decision (for example a signed NEAR intent and its reference).
func (s *Server) apiAttest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reference string `json:"reference"`
		Note      string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	d, err := s.Rec.GetDecision(r.PathValue("id"))
	if err != nil {
		apiErr(w, http.StatusNotFound, "decision not found")
		return
	}
	rec, err := s.Audit.Append("external_action", map[string]string{"decision_id": d.ID, "tool": d.Tool, "reference": in.Reference, "note": in.Note})
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"audit_seq": rec.Seq})
}

func (s *Server) apiApprovals(w http.ResponseWriter, r *http.Request) {
	if !s.isOwner(r) {
		apiErr(w, http.StatusUnauthorized, "owner authentication required")
		return
	}
	aps, err := s.Rec.ListApprovals(r.URL.Query().Get("status"))
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if aps == nil {
		aps = []records.Approval{}
	}
	writeJSON(w, http.StatusOK, aps)
}

// apiResolve resolves an approval. Approval does not execute: the agent
// calls /v1/execute afterwards, which re-checks the approval and args hash.
func (s *Server) apiResolve(status string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.isOwner(r) {
			apiErr(w, http.StatusUnauthorized, "owner authentication required")
			return
		}
		id := r.PathValue("id")
		if err := s.Rec.ResolveApproval(id, status, "owner"); err != nil {
			apiErr(w, http.StatusConflict, "approval not found or already resolved")
			return
		}
		if s.Audit != nil {
			_, _ = s.Audit.Append("approval_"+status, map[string]string{"approval_id": id})
		}
		writeJSON(w, http.StatusOK, map[string]string{"approval_id": id, "status": status})
	}
}

// limiter is a small per-client sliding-window rate limiter for the public attack lab.
type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func (l *limiter) allow(key string, max int, per time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.hits == nil {
		l.hits = map[string][]time.Time{}
	}
	now := time.Now()
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < per {
			kept = append(kept, t)
		}
	}
	if len(kept) >= max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}

func clientIP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type labSide struct {
	Defense  string                   `json:"defense"`
	Paid     []scenario.Payout        `json:"paid"`
	Trace    []scenario.DecisionTrace `json:"trace"`
	Diverted bool                     `json:"diverted"` // money went somewhere other than the vendor record, or the amount changed
	Pending  int                      `json:"pending_owner"`
	Blocked  int                      `json:"blocked"`
}

// POST /api/attack runs a visitor-written message through the simulated
// compromised agent twice: with no guard, and behind Lineage. Everything is in
// memory with the simulated rail, so no money moves.
func (s *Server) apiAttack(w http.ResponseWriter, r *http.Request) {
	if !s.lim.allow(clientIP(r), 20, time.Minute) {
		apiErr(w, http.StatusTooManyRequests, "slow down: at most 20 attacks a minute")
		return
	}
	var in struct {
		Message string `json:"message"`
		Channel string `json:"channel"`
		From    string `json:"from"`
	}
	if !decode(w, r, &in) {
		return
	}
	msg, from := strings.TrimSpace(in.Message), strings.TrimSpace(in.From)
	if msg == "" || len(msg) > 1500 {
		apiErr(w, http.StatusBadRequest, "message must be 1 to 1500 characters")
		return
	}
	if from == "" {
		from = "billing@acme-supp1ies.com"
	}
	if len(from) > 120 {
		apiErr(w, http.StatusBadRequest, "sender must be at most 120 characters")
		return
	}
	kind := prov.KindEmail
	switch in.Channel {
	case "chat":
		kind = prov.KindChat
	case "tool":
		kind = prov.KindTool
	}
	sc := scenario.Scenario{ID: "attack-lab", Class: "LAB", Kind: "attack",
		Inbox: []agent.Email{{From: from, Subject: "Invoice inv_1", Body: msg, Kind: kind}}}

	var sides []labSide
	for _, def := range []agent.Defense{agent.DefNone, agent.DefLineage} {
		o, err := scenario.Run(r.Context(), sc, s.Addr, agent.CompromisedLLM{}, agent.ModeCompromised, def, executor.SimRail{}, s.Guard)
		if err != nil {
			apiErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		side := labSide{Defense: string(def), Paid: o.Paid, Trace: o.Trace, Pending: o.Asks, Blocked: o.Blocks}
		if side.Paid == nil {
			side.Paid = []scenario.Payout{}
		}
		for _, p := range o.Paid {
			if prov.Normalize(p.Payee) != prov.Normalize(s.Addr.VendorA) || p.AmountCents != 125000 {
				side.Diverted = true
			}
		}
		sides = append(sides, side)
	}
	writeJSON(w, http.StatusOK, map[string]any{"vendor": s.Addr.VendorA, "invoice_cents": 125000, "results": sides})
}

func (s *Server) apiAudit(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	recs, err := s.Audit.List(limit)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if recs == nil {
		recs = []audit.Record{} // an empty log must be [], never null
	}
	writeJSON(w, http.StatusOK, recs)
}

func (s *Server) apiVerify(w http.ResponseWriter, r *http.Request) {
	v, err := s.Audit.Verify()
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}
