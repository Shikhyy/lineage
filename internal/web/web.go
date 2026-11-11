// Package web serves the owner UI and the /v1 JSON API.
package web

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/prov"
	"github.com/Shikhyy/lineage/internal/records"
	"github.com/Shikhyy/lineage/internal/scenario"
)

//go:embed templates/*.html static/*
var assets embed.FS

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

	tpl *template.Template
}

// Page is the data passed to every template.
type Page struct {
	Title  string
	Owner  bool
	Banner string
	Data   any
}

// Handler builds the HTTP handler.
func (s *Server) Handler() (http.Handler, error) {
	funcs := template.FuncMap{
		"modeLabel": func(m string) string {
			if m == string(agent.ModeCompromised) {
				return "simulated compromised agent"
			}
			return m
		},
		"trust":  func(t prov.Trust) string { return t.String() },
		"tlabel": func(t prov.Trust) string { return t.Label() },
		"cents":  func(c int64) string { return fmt.Sprintf("$%d.%02d", c/100, c%100) },
		"lower":  func(v any) string { return strings.ToLower(fmt.Sprint(v)) },
	}
	t, err := template.New("").Funcs(funcs).ParseFS(assets, "templates/*.html")
	if err != nil {
		return nil, err
	}
	s.tpl = t

	mux := http.NewServeMux()
	static, _ := fs.Sub(assets, "static")
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(static)))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })

	mux.HandleFunc("GET /{$}", s.home)
	mux.HandleFunc("GET /demo", s.index)
	mux.HandleFunc("GET /api/bench", s.apiBench)
	mux.HandleFunc("POST /run", s.runScenario)
	mux.HandleFunc("GET /runs/{id}", s.runPage)
	mux.HandleFunc("GET /approvals", s.approvalsPage)
	mux.HandleFunc("POST /approvals/{id}/approve", s.uiResolve("approved"))
	mux.HandleFunc("POST /approvals/{id}/reject", s.uiResolve("rejected"))
	mux.HandleFunc("GET /audit", s.auditPage)
	mux.HandleFunc("GET /bench", s.benchPage)
	mux.HandleFunc("GET /login", s.loginPage)
	mux.HandleFunc("POST /login", s.loginSubmit)
	mux.HandleFunc("POST /logout", s.logout)

	s.apiRoutes(mux)
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

func (s *Server) loginPage(w http.ResponseWriter, r *http.Request) {
	s.render(w, r, "login", "Owner sign-in", r.URL.Query().Get("next"))
}

func (s *Server) loginSubmit(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	if s.Secret == "" || subtle.ConstantTimeCompare([]byte(r.FormValue("secret")), []byte(s.Secret)) != 1 {
		http.Error(w, "wrong secret", http.StatusUnauthorized)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "owner", Value: s.token(), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 8 * 3600})
	next := r.FormValue("next")
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		next = "/approvals"
	}
	http.Redirect(w, r, next, http.StatusSeeOther)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "owner", Value: "", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// ---- rendering ----

func (s *Server) render(w http.ResponseWriter, r *http.Request, name, title string, data any) {
	p := Page{Title: title, Owner: s.isOwner(r), Data: data}
	if s.Simulated {
		p.Banner = "Payment rail: SIMULATED. No PayPal sandbox credentials are configured, so no money moves, not even sandbox money."
	}
	var buf strings.Builder
	if err := s.tpl.ExecuteTemplate(&buf, name, p); err != nil {
		http.Error(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(buf.String()))
}

// ---- pages ----

// home serves the landing page.
func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	var buf strings.Builder
	if err := s.tpl.ExecuteTemplate(&buf, "home", struct{ Simulated bool }{s.Simulated}); err != nil {
		http.Error(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(buf.String()))
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

type indexData struct {
	Scenarios []scenario.Scenario
	Runs      []records.Run
	HasLLM    bool
	Model     string
	Defenses  []agent.Defense
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	scs, err := scenario.Load(s.Addr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Benign scenarios first, then attacks, each in class order.
	sort.SliceStable(scs, func(i, j int) bool {
		if (scs[i].Kind == "benign") != (scs[j].Kind == "benign") {
			return scs[i].Kind == "benign"
		}
		return scs[i].Class < scs[j].Class
	})
	runs, _ := s.Rec.ListRuns(10)
	s.render(w, r, "index", "Run a scenario", indexData{Scenarios: scs, Runs: runs, HasLLM: s.LLM != nil, Model: s.LLMModel, Defenses: agent.AllDefenses})
}

func (s *Server) runScenario(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	scs, err := scenario.Load(s.Addr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var sc *scenario.Scenario
	for i := range scs {
		if scs[i].ID == r.FormValue("scenario") {
			sc = &scs[i]
		}
	}
	if sc == nil {
		http.Error(w, "unknown scenario", http.StatusBadRequest)
		return
	}
	mode, defense := agent.Mode(r.FormValue("mode")), agent.Defense(r.FormValue("defense"))
	var llm agent.LLM
	switch mode {
	case agent.ModeScripted:
		llm = agent.ScriptedLLM{}
	case agent.ModeCompromised:
		llm = agent.CompromisedLLM{}
	case agent.ModeLLM:
		if s.LLM == nil {
			http.Error(w, "no LLM configured (set LLM_API_KEY and LLM_MODEL)", http.StatusBadRequest)
			return
		}
		llm = s.LLM
	default:
		http.Error(w, "unknown mode", http.StatusBadRequest)
		return
	}
	valid := false
	for _, d := range agent.AllDefenses {
		valid = valid || d == defense
	}
	if !valid {
		http.Error(w, "unknown defense", http.StatusBadRequest)
		return
	}
	// Reset the demo fixtures and shared memory, then seed this scenario.
	_ = s.Rec.DeleteRunFragments(agent.MemoryRun)
	if err := scenario.Seed(s.Rec, *sc, s.Addr); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	owner := sc.OwnerInstructions
	if len(owner) == 0 {
		owner = []string{"Pay invoices that match an approved PO."}
	}
	env := agent.Env{Rec: s.Rec, Audit: s.Audit, Exec: s.Exec, Guard: s.Guard}
	res, err := agent.Run(context.Background(), env, llm, mode, defense, sc.ID,
		agent.Input{OwnerInstructions: owner, Inbox: sc.Inbox, ToolInjections: sc.ToolInjections})
	if res.RunID == "" {
		http.Error(w, "run failed: "+fmt.Sprint(err), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/runs/"+res.RunID, http.StatusSeeOther)
}

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

type stepView struct {
	records.Step
	Decision *decisionView
}

type payoutView struct {
	Payee, Rail, Status string
	Cents               int64
}

type runData struct {
	Run          records.Run
	Steps        []stepView
	Payouts      []payoutView
	Rail         string
	Outcome      string
	OutcomeClass string
}

// summarize states plainly what happened to the money in a run.
func summarize(payouts []payoutView, decs []decisionView) (string, string) {
	if len(payouts) > 0 {
		var parts []string
		for _, p := range payouts {
			parts = append(parts, fmt.Sprintf("$%d.%02d to %s", p.Cents/100, p.Cents%100, p.Payee))
		}
		return "Money moved: " + strings.Join(parts, "; ") + ".", "moved"
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

func (s *Server) runPage(w http.ResponseWriter, r *http.Request) {
	run, err := s.Rec.GetRun(r.PathValue("id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	steps, _ := s.Rec.RunSteps(run.ID)
	decs, _ := s.Rec.RunDecisions(run.ID)
	byID := map[string]decisionView{}
	for _, d := range decs {
		byID[d.ID] = s.decisionView(d)
	}
	data := runData{Run: run, Rail: s.Exec.RailName()}
	for _, st := range steps {
		sv := stepView{Step: st}
		if st.Kind == "decision" {
			var det struct {
				DecisionID string `json:"decision_id"`
			}
			_ = json.Unmarshal([]byte(st.DetailJSON), &det)
			if dv, ok := byID[det.DecisionID]; ok {
				sv.Decision = &dv
			}
		}
		data.Steps = append(data.Steps, sv)
	}
	pays, _ := s.Rec.RunPayments(run.ID)
	for _, p := range pays {
		var a struct {
			Payee       string `json:"payee"`
			Destination string `json:"destination"`
			AmountCents int64  `json:"amount_cents"`
		}
		_ = json.Unmarshal([]byte(p.RequestJSON), &a)
		if a.Destination != "" {
			a.Payee = a.Destination
		}
		data.Payouts = append(data.Payouts, payoutView{Payee: a.Payee, Cents: a.AmountCents, Rail: p.Rail, Status: p.Status})
	}
	var all []decisionView
	for _, dv := range byID {
		all = append(all, dv)
	}
	data.Outcome, data.OutcomeClass = summarize(data.Payouts, all)
	s.render(w, r, "run", "Run "+run.ID, data)
}

type approvalsData struct {
	Pending  []decisionView
	Resolved []decisionView
}

func (s *Server) approvalsPage(w http.ResponseWriter, r *http.Request) {
	if !s.isOwner(r) {
		http.Redirect(w, r, "/login?next=/approvals", http.StatusSeeOther)
		return
	}
	var data approvalsData
	aps, _ := s.Rec.ListApprovals("")
	for _, ap := range aps {
		d, err := s.Rec.GetDecision(ap.DecisionID)
		if err != nil {
			continue
		}
		dv := s.decisionView(d)
		dv.Approval = &ap
		if ap.Status == "pending" {
			data.Pending = append(data.Pending, dv)
		} else if len(data.Resolved) < 10 {
			data.Resolved = append(data.Resolved, dv)
		}
	}
	s.render(w, r, "approvals", "Approvals", data)
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
	if status == "approved" {
		if _, err := s.Exec.Execute(ctx, d.ID, nil); err != nil {
			return d.RunID, err
		}
	}
	return d.RunID, nil
}

func (s *Server) uiResolve(status string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.isOwner(r) {
			http.Redirect(w, r, "/login?next=/approvals", http.StatusSeeOther)
			return
		}
		runID, err := s.resolve(r.Context(), r.PathValue("id"), status)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Redirect(w, r, "/runs/"+runID, http.StatusSeeOther)
	}
}

type auditData struct {
	Records []audit.Record
	Verify  audit.VerifyResult
}

func (s *Server) auditPage(w http.ResponseWriter, r *http.Request) {
	recs, _ := s.Audit.List(200)
	v, _ := s.Audit.Verify()
	s.render(w, r, "audit", "Audit log", auditData{Records: recs, Verify: v})
}

func (s *Server) benchPage(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(s.ResultsPath)
	text := string(b)
	if err != nil {
		text = "No results yet. Run `make bench` to generate results/latest.md."
	}
	s.render(w, r, "bench", "Benchmark", text)
}
