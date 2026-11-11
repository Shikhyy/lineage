package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
)

func (s *Server) apiRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/fragments", s.apiFragment)
	mux.HandleFunc("POST /v1/decide", s.apiDecide)
	mux.HandleFunc("POST /v1/execute", s.apiExecute)
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

func (s *Server) apiAudit(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	recs, err := s.Audit.List(limit)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
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
