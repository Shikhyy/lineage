// Package records is the persistence layer: vendors, purchase orders,
// invoices, fragments, decisions, approvals, payments and runs.
//
// Vendors and POs are the "trusted records" (tier T2). Only code paths that
// have authenticated the owner may modify them.
package records

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/Shikhyy/lineage/internal/prov"
)

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("not found")

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// NewID returns a random identifier with the given prefix.
func NewID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

// Store wraps the database.
type Store struct{ db *sql.DB }

// New returns a Store.
func New(db *sql.DB) *Store { return &Store{db: db} }

// ---- vendors ----

type Vendor struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	PayoutEmail string `json:"payout_email"`
	Rail        string `json:"rail"`
	NearAccount string `json:"near_account,omitempty"`
	UpdatedBy   string `json:"updated_by"`
	UpdatedAt   string `json:"updated_at"`
}

func (s *Store) UpsertVendor(v Vendor) error {
	if v.Rail == "" {
		v.Rail = "paypal"
	}
	if v.UpdatedBy == "" {
		v.UpdatedBy = "seed"
	}
	_, err := s.db.Exec(`INSERT INTO vendors(id,name,payout_email,rail,near_account,updated_by,updated_at)
VALUES(?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, payout_email=excluded.payout_email, rail=excluded.rail,
  near_account=excluded.near_account, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
		v.ID, v.Name, v.PayoutEmail, v.Rail, v.NearAccount, v.UpdatedBy, now())
	return err
}

func scanVendor(r *sql.Row) (Vendor, error) {
	var v Vendor
	err := r.Scan(&v.ID, &v.Name, &v.PayoutEmail, &v.Rail, &v.NearAccount, &v.UpdatedBy, &v.UpdatedAt)
	if err == sql.ErrNoRows {
		return v, ErrNotFound
	}
	return v, err
}

const vendorCols = `id,name,payout_email,rail,near_account,updated_by,updated_at`

func (s *Store) GetVendor(id string) (Vendor, error) {
	return scanVendor(s.db.QueryRow(`SELECT `+vendorCols+` FROM vendors WHERE id=?`, id))
}

// VendorByEmail finds a vendor by payout email or by sender address
// (normalized). Used to decide whether an email sender is a "known sender".
func (s *Store) VendorByEmail(email string) (Vendor, error) {
	want := prov.Normalize(email)
	vs, err := s.ListVendors()
	if err != nil {
		return Vendor{}, err
	}
	for _, v := range vs {
		if prov.Normalize(v.PayoutEmail) == want {
			return v, nil
		}
	}
	return Vendor{}, ErrNotFound
}

// VendorByNear finds a vendor by registered NEAR account (normalized).
func (s *Store) VendorByNear(account string) (Vendor, error) {
	want := prov.Normalize(account)
	vs, err := s.ListVendors()
	if err != nil {
		return Vendor{}, err
	}
	for _, v := range vs {
		if v.NearAccount != "" && prov.Normalize(v.NearAccount) == want {
			return v, nil
		}
	}
	return Vendor{}, ErrNotFound
}

// NonceUsed reports whether an intent nonce was already consumed.
func (s *Store) NonceUsed(nonce string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM intent_nonces WHERE nonce=?`, nonce).Scan(&n)
	return n > 0, err
}

// UseNonce consumes a nonce; it fails if the nonce was already used.
func (s *Store) UseNonce(nonce string) error {
	_, err := s.db.Exec(`INSERT INTO intent_nonces(nonce, used_at) VALUES(?,?)`, nonce, now())
	return err
}

func (s *Store) ListVendors() ([]Vendor, error) {
	rows, err := s.db.Query(`SELECT ` + vendorCols + ` FROM vendors ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Vendor
	for rows.Next() {
		var v Vendor
		if err := rows.Scan(&v.ID, &v.Name, &v.PayoutEmail, &v.Rail, &v.NearAccount, &v.UpdatedBy, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ---- purchase orders ----

type PO struct {
	ID                  string `json:"id"`
	VendorID            string `json:"vendor_id"`
	ApprovedAmountCents int64  `json:"approved_amount_cents"`
	Currency            string `json:"currency"`
	Status              string `json:"status"`
}

func (s *Store) UpsertPO(p PO) error {
	if p.Status == "" {
		p.Status = "approved"
	}
	_, err := s.db.Exec(`INSERT INTO purchase_orders(id,vendor_id,approved_amount_cents,currency,status) VALUES(?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET vendor_id=excluded.vendor_id, approved_amount_cents=excluded.approved_amount_cents,
  currency=excluded.currency, status=excluded.status`,
		p.ID, p.VendorID, p.ApprovedAmountCents, p.Currency, p.Status)
	return err
}

func (s *Store) GetPO(id string) (PO, error) {
	var p PO
	err := s.db.QueryRow(`SELECT id,vendor_id,approved_amount_cents,currency,status FROM purchase_orders WHERE id=?`, id).
		Scan(&p.ID, &p.VendorID, &p.ApprovedAmountCents, &p.Currency, &p.Status)
	if err == sql.ErrNoRows {
		return p, ErrNotFound
	}
	return p, err
}

// ---- invoices ----

type Invoice struct {
	ID                 string `json:"id"`
	VendorID           string `json:"vendor_id"`
	POID               string `json:"po_id"`
	AmountCents        int64  `json:"amount_cents"`
	Currency           string `json:"currency"`
	Status             string `json:"status"`
	ReceivedFragmentID string `json:"received_fragment_id,omitempty"`
}

func (s *Store) UpsertInvoice(i Invoice) error {
	if i.Status == "" {
		i.Status = "open"
	}
	_, err := s.db.Exec(`INSERT INTO invoices(id,vendor_id,po_id,amount_cents,currency,status,received_fragment_id) VALUES(?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET vendor_id=excluded.vendor_id, po_id=excluded.po_id, amount_cents=excluded.amount_cents,
  currency=excluded.currency, status=excluded.status, received_fragment_id=excluded.received_fragment_id`,
		i.ID, i.VendorID, i.POID, i.AmountCents, i.Currency, i.Status, i.ReceivedFragmentID)
	return err
}

func (s *Store) GetInvoice(id string) (Invoice, error) {
	var i Invoice
	err := s.db.QueryRow(`SELECT id,vendor_id,po_id,amount_cents,currency,status,received_fragment_id FROM invoices WHERE id=?`, id).
		Scan(&i.ID, &i.VendorID, &i.POID, &i.AmountCents, &i.Currency, &i.Status, &i.ReceivedFragmentID)
	if err == sql.ErrNoRows {
		return i, ErrNotFound
	}
	return i, err
}

func (s *Store) ListInvoices() ([]Invoice, error) {
	rows, err := s.db.Query(`SELECT id,vendor_id,po_id,amount_cents,currency,status,received_fragment_id FROM invoices ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Invoice
	for rows.Next() {
		var i Invoice
		if err := rows.Scan(&i.ID, &i.VendorID, &i.POID, &i.AmountCents, &i.Currency, &i.Status, &i.ReceivedFragmentID); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// MarkInvoicePaid flags the invoice paid and stamps the time.
func (s *Store) MarkInvoicePaid(id string) error {
	_, err := s.db.Exec(`UPDATE invoices SET status='paid', paid_at=? WHERE id=?`, now(), id)
	return err
}

// PaidToday returns the total of invoices paid since 00:00 UTC today.
func (s *Store) PaidToday() (int64, error) {
	start := time.Now().UTC().Truncate(24 * time.Hour).Format(time.RFC3339Nano)
	var total sql.NullInt64
	err := s.db.QueryRow(`SELECT SUM(amount_cents) FROM invoices WHERE status='paid' AND paid_at >= ?`, start).Scan(&total)
	return total.Int64, err
}

// ---- fragments ----

func (s *Store) SaveFragment(f prov.Fragment) (prov.Fragment, error) {
	if f.ID == "" {
		f.ID = NewID("frag")
	}
	if f.CreatedAt.IsZero() {
		f.CreatedAt = time.Now().UTC()
	}
	f.SHA256 = prov.Hash(f.Content)
	parents, _ := json.Marshal(append([]string{}, f.ParentIDs...))
	_, err := s.db.Exec(`INSERT INTO fragments(id,run_id,kind,content,trust,source,parent_ids_json,created_at,sha256) VALUES(?,?,?,?,?,?,?,?,?)`,
		f.ID, f.RunID, string(f.Kind), f.Content, int(f.Trust), f.Source, string(parents),
		f.CreatedAt.UTC().Format(time.RFC3339Nano), f.SHA256)
	return f, err
}

func scanFragments(rows *sql.Rows) ([]prov.Fragment, error) {
	defer rows.Close()
	var out []prov.Fragment
	for rows.Next() {
		var f prov.Fragment
		var kind, parents, at string
		var trust int
		if err := rows.Scan(&f.ID, &f.RunID, &kind, &f.Content, &trust, &f.Source, &parents, &at, &f.SHA256); err != nil {
			return nil, err
		}
		f.Kind, f.Trust = prov.Kind(kind), prov.Trust(trust)
		_ = json.Unmarshal([]byte(parents), &f.ParentIDs)
		f.CreatedAt, _ = time.Parse(time.RFC3339Nano, at)
		out = append(out, f)
	}
	return out, rows.Err()
}

const fragCols = `id,run_id,kind,content,trust,source,parent_ids_json,created_at,sha256`

// Fragments loads fragments by ID, preserving the requested order and
// skipping unknown IDs.
func (s *Store) Fragments(ids []string) ([]prov.Fragment, error) {
	var out []prov.Fragment
	for _, id := range ids {
		rows, err := s.db.Query(`SELECT `+fragCols+` FROM fragments WHERE id=?`, id)
		if err != nil {
			return nil, err
		}
		fs, err := scanFragments(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, fs...)
	}
	return out, nil
}

// ArchiveRunFragments moves the fragments of a run out of the way (used to reset the shared
// memory before a demo scenario re-seeds it) without deleting them, so earlier runs can still
// show where their memory came from.
func (s *Store) ArchiveRunFragments(runID, archiveID string) error {
	_, err := s.db.Exec(`UPDATE fragments SET run_id=? WHERE run_id=?`, archiveID, runID)
	return err
}

func (s *Store) RunFragments(runID string) ([]prov.Fragment, error) {
	rows, err := s.db.Query(`SELECT `+fragCols+` FROM fragments WHERE run_id=? ORDER BY created_at, id`, runID)
	if err != nil {
		return nil, err
	}
	return scanFragments(rows)
}

// ---- decisions, approvals, payments ----

type Decision struct {
	ID          string `json:"id"`
	RunID       string `json:"run_id"`
	Tool        string `json:"tool"`
	ArgsJSON    string `json:"args_json"`
	ArgsHash    string `json:"args_hash"`
	Decision    string `json:"decision"`
	ReasonsJSON string `json:"reasons_json"`
	LineageJSON string `json:"lineage_json"`
	CreatedAt   string `json:"created_at"`
}

func (s *Store) SaveDecision(d Decision) (Decision, error) {
	if d.ID == "" {
		d.ID = NewID("dec")
	}
	d.CreatedAt = now()
	_, err := s.db.Exec(`INSERT INTO decisions(id,run_id,tool,args_json,args_hash,decision,reasons_json,lineage_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		d.ID, d.RunID, d.Tool, d.ArgsJSON, d.ArgsHash, d.Decision, d.ReasonsJSON, d.LineageJSON, d.CreatedAt)
	return d, err
}

const decCols = `id,run_id,tool,args_json,args_hash,decision,reasons_json,lineage_json,created_at`

func (s *Store) GetDecision(id string) (Decision, error) {
	var d Decision
	err := s.db.QueryRow(`SELECT `+decCols+` FROM decisions WHERE id=?`, id).
		Scan(&d.ID, &d.RunID, &d.Tool, &d.ArgsJSON, &d.ArgsHash, &d.Decision, &d.ReasonsJSON, &d.LineageJSON, &d.CreatedAt)
	if err == sql.ErrNoRows {
		return d, ErrNotFound
	}
	return d, err
}

func (s *Store) RunDecisions(runID string) ([]Decision, error) {
	rows, err := s.db.Query(`SELECT `+decCols+` FROM decisions WHERE run_id=? ORDER BY created_at, id`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Decision
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.RunID, &d.Tool, &d.ArgsJSON, &d.ArgsHash, &d.Decision, &d.ReasonsJSON, &d.LineageJSON, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type Approval struct {
	ID         string `json:"id"`
	DecisionID string `json:"decision_id"`
	Status     string `json:"status"` // pending|approved|rejected
	ResolvedBy string `json:"resolved_by,omitempty"`
	ResolvedAt string `json:"resolved_at,omitempty"`
}

func (s *Store) CreateApproval(decisionID string) (Approval, error) {
	a := Approval{ID: NewID("appr"), DecisionID: decisionID, Status: "pending"}
	_, err := s.db.Exec(`INSERT INTO approvals(id,decision_id,status) VALUES(?,?,?)`, a.ID, a.DecisionID, a.Status)
	return a, err
}

func (s *Store) GetApproval(id string) (Approval, error) {
	var a Approval
	err := s.db.QueryRow(`SELECT id,decision_id,status,resolved_by,resolved_at FROM approvals WHERE id=?`, id).
		Scan(&a.ID, &a.DecisionID, &a.Status, &a.ResolvedBy, &a.ResolvedAt)
	if err == sql.ErrNoRows {
		return a, ErrNotFound
	}
	return a, err
}

// ApprovalForDecision returns the latest approval attached to a decision.
func (s *Store) ApprovalForDecision(decisionID string) (Approval, error) {
	var a Approval
	err := s.db.QueryRow(`SELECT id,decision_id,status,resolved_by,resolved_at FROM approvals WHERE decision_id=? ORDER BY rowid DESC LIMIT 1`, decisionID).
		Scan(&a.ID, &a.DecisionID, &a.Status, &a.ResolvedBy, &a.ResolvedAt)
	if err == sql.ErrNoRows {
		return a, ErrNotFound
	}
	return a, err
}

// ListApprovals lists approvals; an empty status lists all.
func (s *Store) ListApprovals(status string) ([]Approval, error) {
	q := `SELECT id,decision_id,status,resolved_by,resolved_at FROM approvals`
	args := []any{}
	if status != "" {
		q += ` WHERE status=?`
		args = append(args, status)
	}
	rows, err := s.db.Query(q+` ORDER BY rowid DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Approval
	for rows.Next() {
		var a Approval
		if err := rows.Scan(&a.ID, &a.DecisionID, &a.Status, &a.ResolvedBy, &a.ResolvedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ResolveApproval moves a pending approval to approved or rejected. It
// returns ErrNotFound if the approval is missing or no longer pending.
func (s *Store) ResolveApproval(id, status, by string) error {
	res, err := s.db.Exec(`UPDATE approvals SET status=?, resolved_by=?, resolved_at=? WHERE id=? AND status='pending'`,
		status, by, now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

type Payment struct {
	ID           string `json:"id"`
	DecisionID   string `json:"decision_id"`
	Rail         string `json:"rail"`
	RequestJSON  string `json:"request_json"`
	ResponseJSON string `json:"response_json"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
}

// SavePayment inserts a payment. The unique constraint on decision_id means
// a decision can never produce two payments.
func (s *Store) SavePayment(p Payment) (Payment, error) {
	if p.ID == "" {
		p.ID = NewID("pay")
	}
	p.CreatedAt = now()
	_, err := s.db.Exec(`INSERT INTO payments(id,decision_id,rail,request_json,response_json,status,created_at) VALUES(?,?,?,?,?,?,?)`,
		p.ID, p.DecisionID, p.Rail, p.RequestJSON, p.ResponseJSON, p.Status, p.CreatedAt)
	return p, err
}

func (s *Store) UpdatePayment(id, responseJSON, status string) error {
	_, err := s.db.Exec(`UPDATE payments SET response_json=?, status=? WHERE id=?`, responseJSON, status, id)
	return err
}

func (s *Store) PaymentForDecision(decisionID string) (Payment, error) {
	var p Payment
	err := s.db.QueryRow(`SELECT id,decision_id,rail,request_json,response_json,status,created_at FROM payments WHERE decision_id=?`, decisionID).
		Scan(&p.ID, &p.DecisionID, &p.Rail, &p.RequestJSON, &p.ResponseJSON, &p.Status, &p.CreatedAt)
	if err == sql.ErrNoRows {
		return p, ErrNotFound
	}
	return p, err
}

// RunPayments lists payments made for decisions of a run.
func (s *Store) RunPayments(runID string) ([]Payment, error) {
	rows, err := s.db.Query(`SELECT p.id,p.decision_id,p.rail,p.request_json,p.response_json,p.status,p.created_at
FROM payments p JOIN decisions d ON d.id=p.decision_id WHERE d.run_id=? ORDER BY p.rowid`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Payment
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.DecisionID, &p.Rail, &p.RequestJSON, &p.ResponseJSON, &p.Status, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ---- run steps (timeline) ----

type Step struct {
	ID         int64  `json:"id"`
	RunID      string `json:"run_id"`
	Kind       string `json:"kind"`
	Summary    string `json:"summary"`
	DetailJSON string `json:"detail_json"`
	CreatedAt  string `json:"created_at"`
}

func (s *Store) AddStep(runID, kind, summary string, detail any) error {
	d, _ := json.Marshal(detail)
	if detail == nil {
		d = []byte("{}")
	}
	_, err := s.db.Exec(`INSERT INTO run_steps(run_id,kind,summary,detail_json,created_at) VALUES(?,?,?,?,?)`,
		runID, kind, summary, string(d), now())
	return err
}

func (s *Store) RunSteps(runID string) ([]Step, error) {
	rows, err := s.db.Query(`SELECT id,run_id,kind,summary,detail_json,created_at FROM run_steps WHERE run_id=? ORDER BY id`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Step
	for rows.Next() {
		var st Step
		if err := rows.Scan(&st.ID, &st.RunID, &st.Kind, &st.Summary, &st.DetailJSON, &st.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// ---- runs ----

type Run struct {
	ID         string `json:"id"`
	Mode       string `json:"mode"`
	Defense    string `json:"defense"`
	ScenarioID string `json:"scenario_id"`
	StartedAt  string `json:"started_at"`
	FinishedAt string `json:"finished_at,omitempty"`
}

func (s *Store) CreateRun(mode, defense, scenarioID string) (Run, error) {
	r := Run{ID: NewID("run"), Mode: mode, Defense: defense, ScenarioID: scenarioID, StartedAt: now()}
	_, err := s.db.Exec(`INSERT INTO runs(id,mode,defense,scenario_id,started_at) VALUES(?,?,?,?,?)`,
		r.ID, r.Mode, r.Defense, r.ScenarioID, r.StartedAt)
	return r, err
}

func (s *Store) FinishRun(id string) error {
	_, err := s.db.Exec(`UPDATE runs SET finished_at=? WHERE id=?`, now(), id)
	return err
}

func (s *Store) GetRun(id string) (Run, error) {
	var r Run
	err := s.db.QueryRow(`SELECT id,mode,defense,scenario_id,started_at,finished_at FROM runs WHERE id=?`, id).
		Scan(&r.ID, &r.Mode, &r.Defense, &r.ScenarioID, &r.StartedAt, &r.FinishedAt)
	if err == sql.ErrNoRows {
		return r, ErrNotFound
	}
	return r, err
}

func (s *Store) ListRuns(limit int) ([]Run, error) {
	rows, err := s.db.Query(`SELECT id,mode,defense,scenario_id,started_at,finished_at FROM runs ORDER BY rowid DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Run
	for rows.Next() {
		var r Run
		if err := rows.Scan(&r.ID, &r.Mode, &r.Defense, &r.ScenarioID, &r.StartedAt, &r.FinishedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
