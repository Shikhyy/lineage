package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// ScriptedLLM follows a fixed tool sequence: read the inbox, fetch the
// invoice, look up the vendor, recall memory, then pay the invoice to the
// address on the vendor master. It is deterministic and used for tests and
// benign baselines.
type ScriptedLLM struct{}

// CompromisedLLM simulates a worst-case jailbroken agent. It follows the same
// sequence, but pays the most recent payment instruction found in any text
// that reached its context (mail, chat, memory, tool output), and falls back
// to the vendor master only if there is none. It never reads the system
// prompt. Results using it must be labelled "simulated compromised agent".
type CompromisedLLM struct{}

func (ScriptedLLM) Complete(_ context.Context, _ string, msgs []Message, _ []ToolSpec) (Response, error) {
	return plan(msgs, false), nil
}

func (CompromisedLLM) Complete(_ context.Context, _ string, msgs []Message, _ []ToolSpec) (Response, error) {
	return plan(msgs, true), nil
}

var (
	invoiceRe = regexp.MustCompile(`inv_[A-Za-z0-9_]+`)
	// "pay x@y", "payout email is x@y", "route payment to x@y", ...
	instructionRe = regexp.MustCompile(`(?i)\b(?:pay|payout|payments?|send|route|remit|transfer|paypal)\b[^.\n@]{0,60}?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})`)
)

func call(id, name string, args any) Response {
	b, _ := json.Marshal(args)
	return Response{ToolCalls: []ToolCall{{ID: id, Name: name, Args: b}}}
}

func plan(msgs []Message, compromised bool) Response {
	called := map[string]bool{}
	var texts []string
	results := map[string]string{} // tool name -> latest result text
	byID := map[string]string{}
	for _, m := range msgs {
		if m.Text != "" {
			texts = append(texts, m.Text)
		}
		for _, c := range m.ToolCalls {
			called[c.Name] = true
			byID[c.ID] = c.Name
		}
		for _, r := range m.ToolResults {
			texts = append(texts, r.Content)
			results[byID[r.CallID]] = r.Content
		}
	}
	all := strings.Join(texts, "\n")
	n := len(byID)

	if !called["read_inbox"] {
		return call(fmt.Sprintf("c%d", n), "read_inbox", map[string]any{})
	}
	invID := invoiceRe.FindString(all)
	if invID == "" {
		return Response{Text: "No invoice to process."}
	}
	if !called["get_invoice"] {
		return call(fmt.Sprintf("c%d", n), "get_invoice", map[string]any{"id": invID})
	}
	var inv struct {
		VendorID    string `json:"vendor_id"`
		AmountCents int64  `json:"amount_cents"`
		Currency    string `json:"currency"`
	}
	_ = json.Unmarshal([]byte(jsonPart(results["get_invoice"])), &inv)
	if !called["lookup_vendor"] {
		return call(fmt.Sprintf("c%d", n), "lookup_vendor", map[string]any{"name": inv.VendorID})
	}
	if !called["recall"] {
		return call(fmt.Sprintf("c%d", n), "recall", map[string]any{"query": "payout"})
	}
	if called["pay_vendor"] {
		return Response{Text: "Processed."}
	}
	var vendor struct {
		PayoutEmail string `json:"payout_email"`
	}
	_ = json.Unmarshal([]byte(jsonPart(results["lookup_vendor"])), &vendor)
	payee := vendor.PayoutEmail
	if compromised {
		// Everything except the authoritative records can carry instructions.
		var last string
		for _, t := range texts {
			for _, m := range instructionRe.FindAllStringSubmatch(t, -1) {
				last = m[1]
			}
		}
		if last != "" {
			payee = last
		}
	}
	return call(fmt.Sprintf("c%d", n), "pay_vendor", map[string]any{
		"invoice_id": invID, "payee": payee, "amount_cents": inv.AmountCents, "currency": inv.Currency,
	})
}

// jsonPart returns the first JSON object in s (tool results are prefixed
// with a fragment tag such as "[frag_ab12] ").
func jsonPart(s string) string {
	i := strings.Index(s, "{")
	if i < 0 {
		return "{}"
	}
	var raw json.RawMessage
	if err := json.NewDecoder(strings.NewReader(s[i:])).Decode(&raw); err != nil {
		return "{}"
	}
	return string(raw)
}
