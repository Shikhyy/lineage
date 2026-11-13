package web

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
	"github.com/Shikhyy/lineage/internal/scenario"
)

// customScenarioID labels runs started from a visitor-written message.
const customScenarioID = "custom"

// JSON API used by the Next.js frontend. Every response is JSON; money is integer cents.

func (s *Server) appRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/me", s.apiMe)
	mux.HandleFunc("POST /api/login", s.apiLogin)
	mux.HandleFunc("POST /api/logout", s.apiLogout)
	mux.HandleFunc("GET /api/scenarios", s.apiScenarios)
	mux.HandleFunc("POST /api/run", s.apiRun)
	mux.HandleFunc("GET /api/runs", s.apiRuns)
	mux.HandleFunc("GET /api/runs/{id}", s.apiRunGet)
	mux.HandleFunc("GET /api/approvals", s.apiAppApprovals)
	mux.HandleFunc("POST /api/approvals/{id}/resolve", s.apiAppResolve)
	mux.HandleFunc("GET /api/bench/report", s.apiBenchReport)
}

func jsonUnmarshal(s string, v any) error { return json.Unmarshal([]byte(s), v) }

// ---- JSON shapes ----

type apiChain struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Trust   int    `json:"trust"`
	Snippet string `json:"snippet"`
}

type apiOrigin struct {
	FragmentID string     `json:"fragment_id"`
	Kind       string     `json:"kind"`
	Trust      int        `json:"trust"` // 0..3 = T0..T3
	Source     string     `json:"source"`
	Snippet    string     `json:"snippet"`
	Chain      []apiChain `json:"chain"`
}

type apiLineage struct {
	Field    string      `json:"field"`
	Value    string      `json:"value"`
	Grounded bool        `json:"grounded"`
	Source   string      `json:"source"`
	Origins  []apiOrigin `json:"origins"`
}

type apiApproval struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type apiPayment struct {
	Status       string `json:"status"`
	Rail         string `json:"rail"`
	ResponseJSON string `json:"response_json,omitempty"` // only for signed NEAR intents: the public signature, nothing else
}

type apiDecision struct {
	ID       string         `json:"id"`
	RunID    string         `json:"run_id"`
	Verdict  string         `json:"verdict"`
	Reasons  []guard.Reason `json:"reasons"`
	Lineage  []apiLineage   `json:"lineage"`
	Args     guard.PayArgs  `json:"args"`
	Approval *apiApproval   `json:"approval"`
	Payment  *apiPayment    `json:"payment"`
	Created  string         `json:"created"`
}

func toAPIDecision(d decisionView) apiDecision {
	out := apiDecision{ID: d.ID, RunID: d.RunID, Verdict: d.Verdict, Reasons: d.Reasons, Args: d.Args, Created: d.Created,
		Lineage: []apiLineage{}}
	if out.Reasons == nil {
		out.Reasons = []guard.Reason{}
	}
	for _, l := range d.Lineage {
		al := apiLineage{Field: l.Field, Value: l.Value, Grounded: l.Grounded, Source: l.Source, Origins: []apiOrigin{}}
		for _, o := range l.Origins {
			ao := apiOrigin{FragmentID: o.FragmentID, Kind: string(o.Kind), Trust: int(o.Trust), Source: o.Source, Snippet: o.Snippet, Chain: []apiChain{}}
			for _, c := range o.Chain {
				ao.Chain = append(ao.Chain, apiChain{ID: c.ID, Kind: c.Kind, Trust: int(c.Trust), Snippet: c.Snippet})
			}
			al.Origins = append(al.Origins, ao)
		}
		out.Lineage = append(out.Lineage, al)
	}
	if d.Approval != nil {
		out.Approval = &apiApproval{ID: d.Approval.ID, Status: d.Approval.Status}
	}
	if d.Payment != nil {
		out.Payment = &apiPayment{Status: d.Payment.Status, Rail: d.Payment.Rail}
		if d.Payment.Status == "SIGNED" {
			out.Payment.ResponseJSON = d.Payment.ResponseJSON
		}
	}
	return out
}

// ---- session ----

func (s *Server) apiMe(w http.ResponseWriter, r *http.Request) {
	rail := "paypal"
	if s.Simulated {
		rail = "simulated"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"owner": s.isOwner(r), "simulated": s.Simulated, "llm": s.LLM != nil, "llm_model": s.LLMModel, "rail": rail,
	})
}

func (s *Server) apiLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Secret string `json:"secret"`
	}
	if !decode(w, r, &in) {
		return
	}
	if s.Secret == "" || subtle.ConstantTimeCompare([]byte(in.Secret), []byte(s.Secret)) != 1 {
		apiErr(w, http.StatusUnauthorized, "wrong owner secret")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "owner", Value: s.token(), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 8 * 3600})
	writeJSON(w, http.StatusOK, map[string]any{"owner": true})
}

func (s *Server) apiLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "owner", Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	writeJSON(w, http.StatusOK, map[string]any{"owner": false})
}

// ---- scenarios and runs ----

func (s *Server) apiScenarios(w http.ResponseWriter, r *http.Request) {
	scs, err := scenario.Load(s.Addr)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	sort.SliceStable(scs, func(i, j int) bool {
		if (scs[i].Kind == "benign") != (scs[j].Kind == "benign") {
			return scs[i].Kind == "benign"
		}
		return scs[i].Class < scs[j].Class
	})
	type item struct {
		ID            string `json:"id"`
		Class         string `json:"class"`
		Kind          string `json:"kind"`
		Title         string `json:"title"`
		Rail          string `json:"rail"`
		OwnerApproves bool   `json:"owner_approves"`
	}
	out := make([]item, 0, len(scs))
	for _, sc := range scs {
		rail := sc.Rail
		if rail == "" {
			rail = "paypal"
		}
		out = append(out, item{sc.ID, sc.Class, sc.Kind, sc.Title, rail, sc.OwnerApproves})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) apiRun(w http.ResponseWriter, r *http.Request) {
	if !s.lim.allow("run:"+clientIP(r), 30, time.Minute) {
		apiErr(w, http.StatusTooManyRequests, "slow down: at most 30 runs a minute")
		return
	}
	var in struct {
		Scenario string `json:"scenario"`
		Mode     string `json:"mode"`
		Defense  string `json:"defense"`
		// Custom runs a visitor-written message instead of a library scenario.
		Custom *struct {
			Message string `json:"message"`
			Channel string `json:"channel"` // email | chat | tool
			From    string `json:"from"`
		} `json:"custom"`
	}
	if !decode(w, r, &in) {
		return
	}
	var sc *scenario.Scenario
	if in.Custom != nil {
		msg, from := strings.TrimSpace(in.Custom.Message), strings.TrimSpace(in.Custom.From)
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
		switch in.Custom.Channel {
		case "chat":
			kind = prov.KindChat
		case "tool":
			kind = prov.KindTool
		}
		sc = &scenario.Scenario{ID: customScenarioID, Class: "LAB", Kind: "attack", Title: "Custom attack",
			Inbox: []agent.Email{{From: from, Subject: "Invoice inv_1", Body: msg, Kind: kind}}}
	} else {
		scs, err := scenario.Load(s.Addr)
		if err != nil {
			apiErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		for i := range scs {
			if scs[i].ID == in.Scenario {
				sc = &scs[i]
			}
		}
		if sc == nil {
			apiErr(w, http.StatusBadRequest, "unknown scenario")
			return
		}
	}
	mode, defense := agent.Mode(in.Mode), agent.Defense(in.Defense)
	var llm agent.LLM
	switch mode {
	case agent.ModeScripted:
		llm = agent.ScriptedLLM{}
	case agent.ModeCompromised:
		llm = agent.CompromisedLLM{}
	case agent.ModeLLM:
		if s.LLM == nil {
			apiErr(w, http.StatusBadRequest, "no LLM configured (set LLM_API_KEY and LLM_MODEL)")
			return
		}
		llm = s.LLM
	default:
		apiErr(w, http.StatusBadRequest, "unknown mode")
		return
	}
	valid := false
	for _, d := range agent.AllDefenses {
		valid = valid || d == defense
	}
	if !valid {
		apiErr(w, http.StatusBadRequest, "unknown defense")
		return
	}

	// Runs share the demo database (fixtures and memory are reset per run), so serialize them.
	s.runMu.Lock()
	defer s.runMu.Unlock()
	_ = s.Rec.ArchiveRunFragments(agent.MemoryRun, "memory-archive")
	if err := scenario.Seed(s.Rec, *sc, s.Addr); err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	owner := sc.OwnerInstructions
	if len(owner) == 0 {
		owner = []string{"Pay invoices that match an approved PO."}
	}
	env := agent.Env{Rec: s.Rec, Audit: s.Audit, Exec: s.Exec, Guard: s.Guard}
	res, runErr := agent.Run(r.Context(), env, llm, mode, defense, sc.ID,
		agent.Input{OwnerInstructions: owner, Inbox: sc.Inbox, ToolInjections: sc.ToolInjections, Rail: sc.Rail})
	if res.RunID == "" {
		msg := "run failed"
		if runErr != nil {
			msg += ": " + runErr.Error()
		}
		apiErr(w, http.StatusInternalServerError, msg)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"run_id": res.RunID})
}

func (s *Server) apiRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := s.Rec.ListRuns(10)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if runs == nil {
		runs = []records.Run{} // an empty list must be [], never null
	}
	writeJSON(w, http.StatusOK, runs)
}

func (s *Server) apiRunGet(w http.ResponseWriter, r *http.Request) {
	run, err := s.Rec.GetRun(r.PathValue("id"))
	if err != nil {
		apiErr(w, http.StatusNotFound, "run not found")
		return
	}
	steps, _ := s.Rec.RunSteps(run.ID)
	decs, _ := s.Rec.RunDecisions(run.ID)
	byID := map[string]decisionView{}
	var all []decisionView
	for _, d := range decs {
		dv := s.decisionView(d)
		byID[d.ID] = dv
		all = append(all, dv)
	}

	type step struct {
		ID       int64        `json:"id"`
		Kind     string       `json:"kind"`
		Summary  string       `json:"summary"`
		Decision *apiDecision `json:"decision"`
	}
	outSteps := make([]step, 0, len(steps))
	for _, st := range steps {
		o := step{ID: st.ID, Kind: st.Kind, Summary: st.Summary}
		if st.Kind == "decision" {
			var det struct {
				DecisionID string `json:"decision_id"`
			}
			if jsonUnmarshal(st.DetailJSON, &det) == nil {
				if dv, ok := byID[det.DecisionID]; ok {
					ad := toAPIDecision(dv)
					o.Decision = &ad
				}
			}
		}
		outSteps = append(outSteps, o)
	}

	type payout struct {
		Payee  string `json:"payee"`
		Cents  int64  `json:"cents"`
		Rail   string `json:"rail"`
		Status string `json:"status"`
	}
	pays, _ := s.Rec.RunPayments(run.ID)
	var pv []payoutView
	payouts := make([]payout, 0, len(pays))
	for _, p := range pays {
		var a struct {
			Payee       string `json:"payee"`
			Destination string `json:"destination"`
			AmountCents int64  `json:"amount_cents"`
		}
		_ = jsonUnmarshal(p.RequestJSON, &a)
		if a.Destination != "" {
			a.Payee = a.Destination
		}
		pv = append(pv, payoutView{Payee: a.Payee, Cents: a.AmountCents, Rail: p.Rail, Status: p.Status})
		payouts = append(payouts, payout{a.Payee, a.AmountCents, p.Rail, p.Status})
	}
	outcome, class := summarize(pv, all)

	// Every fragment that reached the agent (and the ones the lineage traced back to), so the
	// website can draw the provenance graph.
	type fragment struct {
		ID        string   `json:"id"`
		Kind      string   `json:"kind"`
		Trust     int      `json:"trust"` // 0..3 = T0..T3
		Source    string   `json:"source"`
		Snippet   string   `json:"snippet"`
		ParentIDs []string `json:"parent_ids"`
	}
	seen := map[string]bool{}
	frags := []fragment{}
	addFrags := func(fs []prov.Fragment) {
		for _, f := range fs {
			if seen[f.ID] {
				continue
			}
			seen[f.ID] = true
			parents := f.ParentIDs
			if parents == nil {
				parents = []string{}
			}
			frags = append(frags, fragment{ID: f.ID, Kind: string(f.Kind), Trust: int(f.Trust), Source: f.Source, Snippet: snippet(f.Content), ParentIDs: parents})
		}
	}
	runFrags, _ := s.Rec.RunFragments(run.ID)
	addFrags(runFrags)
	var traced []string
	for _, dv := range all {
		for _, l := range dv.Lineage {
			for _, o := range l.Origins {
				traced = append(traced, o.FragmentID)
				for _, c := range o.Chain {
					traced = append(traced, c.ID)
				}
			}
		}
	}
	more, _ := s.Rec.Fragments(traced)
	addFrags(more)

	title, kind := "Custom attack", "attack"
	if run.ScenarioID != customScenarioID {
		if scs, err := scenario.Load(s.Addr); err == nil {
			for _, sc := range scs {
				if sc.ID == run.ScenarioID {
					title, kind = sc.Title, sc.Kind
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"run": run, "rail": s.Exec.RailName(), "outcome": outcome, "outcome_class": class,
		"steps": outSteps, "payouts": payouts, "fragments": frags,
		"scenario_title": title, "scenario_kind": kind,
	})
}

// ---- owner approvals ----

func (s *Server) apiAppApprovals(w http.ResponseWriter, r *http.Request) {
	if !s.isOwner(r) {
		apiErr(w, http.StatusUnauthorized, "owner authentication required")
		return
	}
	pending, resolved := []apiDecision{}, []apiDecision{}
	aps, _ := s.Rec.ListApprovals("")
	for _, ap := range aps {
		d, err := s.Rec.GetDecision(ap.DecisionID)
		if err != nil {
			continue
		}
		dv := s.decisionView(d)
		dv.Approval = &ap
		if ap.Status == "pending" {
			pending = append(pending, toAPIDecision(dv))
		} else if len(resolved) < 10 {
			resolved = append(resolved, toAPIDecision(dv))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"pending": pending, "resolved": resolved})
}

func (s *Server) apiAppResolve(w http.ResponseWriter, r *http.Request) {
	if !s.isOwner(r) {
		apiErr(w, http.StatusUnauthorized, "owner authentication required")
		return
	}
	var in struct {
		Action string `json:"action"`
	}
	if !decode(w, r, &in) {
		return
	}
	status := ""
	switch in.Action {
	case "approve":
		status = "approved"
	case "reject":
		status = "rejected"
	default:
		apiErr(w, http.StatusBadRequest, `action must be "approve" or "reject"`)
		return
	}
	runID, err := s.resolve(r.Context(), r.PathValue("id"), status)
	if err != nil {
		apiErr(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"run_id": runID, "status": status})
}

// ---- benchmark report ----

func (s *Server) apiBenchReport(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(s.ResultsPath)
	text := string(b)
	if err != nil {
		text = "No results yet. Run `make bench` to generate results/latest.md."
	}
	writeJSON(w, http.StatusOK, map[string]string{"markdown": text})
}
