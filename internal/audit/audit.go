// Package audit implements an append-only, hash-chained log in SQLite.
// Each record's hash is sha256(prev_hash || canonical(payload)).
package audit

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// GenesisHash is the prev_hash of the first record.
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

// Record is one audit row.
type Record struct {
	Seq        int64           `json:"seq"`
	PrevHash   string          `json:"prev_hash"`
	RecordHash string          `json:"record_hash"`
	Kind       string          `json:"kind"`
	Payload    json.RawMessage `json:"payload"`
	CreatedAt  string          `json:"created_at"`
}

// Log is the audit log.
type Log struct {
	db *sql.DB
	mu sync.Mutex
}

// New returns a Log backed by db (schema must already exist).
func New(db *sql.DB) *Log { return &Log{db: db} }

// canonical marshals v to JSON. encoding/json sorts map keys and uses a
// stable struct field order, which is canonical enough for hashing records
// we both write and verify with the same code.
func canonical(v any) ([]byte, error) { return json.Marshal(v) }

func hashOf(prev, kind string, payload []byte, createdAt string) string {
	h := sha256.New()
	h.Write([]byte(prev))
	h.Write([]byte{0})
	h.Write([]byte(kind))
	h.Write([]byte{0})
	h.Write(payload)
	h.Write([]byte{0})
	h.Write([]byte(createdAt))
	return hex.EncodeToString(h.Sum(nil))
}

// Append writes a record and returns it.
func (l *Log) Append(kind string, payload any) (Record, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	body, err := canonical(payload)
	if err != nil {
		return Record{}, fmt.Errorf("audit payload: %w", err)
	}
	prev := GenesisHash
	row := l.db.QueryRow(`SELECT record_hash FROM audit ORDER BY seq DESC LIMIT 1`)
	switch err := row.Scan(&prev); err {
	case nil, sql.ErrNoRows:
	default:
		return Record{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	rh := hashOf(prev, kind, body, now)
	res, err := l.db.Exec(
		`INSERT INTO audit(prev_hash, record_hash, kind, payload_json, created_at) VALUES(?,?,?,?,?)`,
		prev, rh, kind, string(body), now)
	if err != nil {
		return Record{}, err
	}
	seq, _ := res.LastInsertId()
	return Record{Seq: seq, PrevHash: prev, RecordHash: rh, Kind: kind, Payload: body, CreatedAt: now}, nil
}

// List returns the most recent records, newest first. limit <= 0 means all.
func (l *Log) List(limit int) ([]Record, error) {
	q := `SELECT seq, prev_hash, record_hash, kind, payload_json, created_at FROM audit ORDER BY seq DESC`
	args := []any{}
	if limit > 0 {
		q += ` LIMIT ?`
		args = append(args, limit)
	}
	rows, err := l.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Record
	for rows.Next() {
		var r Record
		var p string
		if err := rows.Scan(&r.Seq, &r.PrevHash, &r.RecordHash, &r.Kind, &p, &r.CreatedAt); err != nil {
			return nil, err
		}
		r.Payload = json.RawMessage(p)
		out = append(out, r)
	}
	return out, rows.Err()
}

// VerifyResult reports the outcome of a chain verification.
type VerifyResult struct {
	OK        bool  `json:"ok"`
	Records   int   `json:"records"`
	BrokenSeq int64 `json:"broken_seq,omitempty"`
}

// Verify walks the whole chain and returns the first broken sequence number.
func (l *Log) Verify() (VerifyResult, error) {
	rows, err := l.db.Query(`SELECT seq, prev_hash, record_hash, kind, payload_json, created_at FROM audit ORDER BY seq ASC`)
	if err != nil {
		return VerifyResult{}, err
	}
	defer rows.Close()
	prev := GenesisHash
	n := 0
	for rows.Next() {
		var seq int64
		var ph, rh, kind, payload, at string
		if err := rows.Scan(&seq, &ph, &rh, &kind, &payload, &at); err != nil {
			return VerifyResult{}, err
		}
		if ph != prev || hashOf(ph, kind, []byte(payload), at) != rh {
			return VerifyResult{OK: false, Records: n, BrokenSeq: seq}, nil
		}
		prev = rh
		n++
	}
	if err := rows.Err(); err != nil {
		return VerifyResult{}, err
	}
	return VerifyResult{OK: true, Records: n}, nil
}
