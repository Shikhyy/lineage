// Package prov assigns provenance labels to context fragments and traces
// payment-critical values back to the fragments they appear in.
//
// Labels are assigned by code at ingestion. The LLM can never create or
// upgrade a label.
package prov

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"time"

	"golang.org/x/text/unicode/norm"
)

// Trust is a trust tier. Higher is more trusted.
type Trust int

const (
	T0Untrusted Trust = iota // inbound email body, unknown chat, tool output, tainted memory
	T1Known                  // email whose sender matches a vendor on file (spoofable)
	T2Records                // vendor master, approved POs
	T3Owner                  // authenticated owner instruction or approval
)

func (t Trust) String() string {
	switch t {
	case T0Untrusted:
		return "T0"
	case T1Known:
		return "T1"
	case T2Records:
		return "T2"
	case T3Owner:
		return "T3"
	}
	return "T?"
}

// Label is a human readable name for the tier.
func (t Trust) Label() string {
	switch t {
	case T0Untrusted:
		return "untrusted"
	case T1Known:
		return "known sender"
	case T2Records:
		return "trusted record"
	case T3Owner:
		return "owner"
	}
	return "unknown"
}

// Kind is the type of a fragment.
type Kind string

const (
	KindEmail  Kind = "email"
	KindChat   Kind = "chat"
	KindMemory Kind = "memory"
	KindTool   Kind = "tool"
	KindOwner  Kind = "owner"
	KindRecord Kind = "record"
)

func (k Kind) String() string { return string(k) }

// Fragment is one piece of context that can enter an agent prompt.
type Fragment struct {
	ID        string    `json:"id"`
	RunID     string    `json:"run_id"`
	Kind      Kind      `json:"kind"`
	Content   string    `json:"content"`
	Trust     Trust     `json:"trust"`
	Source    string    `json:"source"`
	ParentIDs []string  `json:"parent_ids,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	SHA256    string    `json:"sha256"`
}

// Hash returns the hex sha256 of the fragment content.
func Hash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// AssignTrust applies the ingestion rules. senderKnown reports whether an
// email sender matches a vendor on file. Owner and record fragments must be
// created by code paths that have authenticated the owner; this function
// never lets a caller-supplied source claim those tiers for other kinds.
func AssignTrust(kind Kind, senderKnown bool) Trust {
	switch kind {
	case KindOwner:
		return T3Owner
	case KindRecord:
		return T2Records
	case KindEmail:
		if senderKnown {
			return T1Known
		}
		return T0Untrusted
	default:
		// chat, tool output and memory (before taint is applied) are untrusted.
		return T0Untrusted
	}
}

// MemoryTrust computes the trust of a memory entry written while the given
// fragments were in the prompt: the minimum trust of all of them. An empty
// context yields T0 (nothing vouches for the entry).
func MemoryTrust(context []Fragment) Trust {
	if len(context) == 0 {
		return T0Untrusted
	}
	min := T3Owner
	for _, f := range context {
		if f.Trust < min {
			min = f.Trust
		}
	}
	return min
}

// Normalize canonicalizes an identifier (email, account id) for comparison:
// Unicode NFKC, trimmed, lower-cased, with zero-width characters removed.
func Normalize(s string) string {
	s = norm.NFKC.String(s)
	s = strings.Map(func(r rune) rune {
		switch r {
		case 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF:
			return -1
		}
		return r
	}, s)
	return strings.ToLower(strings.TrimSpace(s))
}

// Origin is one fragment in which a traced value was found.
type Origin struct {
	FragmentID string   `json:"fragment_id"`
	Kind       Kind     `json:"kind"`
	Trust      Trust    `json:"trust"`
	Source     string   `json:"source"`
	Chain      []string `json:"chain,omitempty"` // parent fragment IDs, nearest first
}

// Trace finds every fragment whose normalized content contains the
// normalized value. Results are sorted most trusted first, then by ID.
// Memory fragments report their parent chain so the UI can show the taint
// path back to the original untrusted source.
func Trace(value string, fragments []Fragment) []Origin {
	needle := Normalize(value)
	if needle == "" {
		return nil
	}
	byID := make(map[string]Fragment, len(fragments))
	for _, f := range fragments {
		byID[f.ID] = f
	}
	var out []Origin
	for _, f := range fragments {
		if !strings.Contains(Normalize(f.Content), needle) {
			continue
		}
		out = append(out, Origin{
			FragmentID: f.ID,
			Kind:       f.Kind,
			Trust:      f.Trust,
			Source:     f.Source,
			Chain:      chain(f, byID),
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Trust != out[j].Trust {
			return out[i].Trust > out[j].Trust
		}
		return out[i].FragmentID < out[j].FragmentID
	})
	return out
}

func chain(f Fragment, byID map[string]Fragment) []string {
	var out []string
	seen := map[string]bool{f.ID: true}
	queue := append([]string(nil), f.ParentIDs...)
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
		if p, ok := byID[id]; ok {
			queue = append(queue, p.ParentIDs...)
		}
	}
	return out
}
