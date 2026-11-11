// Package agent runs an accounts-payable clerk: an LLM (or a deterministic
// stand-in) that reads mail, looks up records and tries to pay invoices
// through the guarded pay_vendor tool.
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ToolCall is a request from the model to run a tool.
type ToolCall struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

// ToolResult is the output of a tool call, fed back to the model.
type ToolResult struct {
	CallID  string `json:"call_id"`
	Content string `json:"content"`
}

// Message is one conversation turn. Role is "user" or "assistant".
type Message struct {
	Role        string       `json:"role"`
	Text        string       `json:"text,omitempty"`
	ToolCalls   []ToolCall   `json:"tool_calls,omitempty"`
	ToolResults []ToolResult `json:"tool_results,omitempty"`
}

// ToolSpec describes a tool to the model.
type ToolSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Schema      map[string]any `json:"input_schema"`
}

// Response is the model's reply.
type Response struct {
	Text      string
	ToolCalls []ToolCall
}

// LLM is the model interface. Implementations: AnthropicLLM, and the
// deterministic ScriptedLLM and CompromisedLLM.
type LLM interface {
	Complete(ctx context.Context, system string, msgs []Message, tools []ToolSpec) (Response, error)
}

// AnthropicLLM calls the Anthropic Messages API with tool use over plain HTTP.
type AnthropicLLM struct {
	APIKey string
	Model  string
	HTTP   *http.Client
	URL    string // defaults to the public API
}

func (a *AnthropicLLM) Complete(ctx context.Context, system string, msgs []Message, tools []ToolSpec) (Response, error) {
	if a.APIKey == "" || a.Model == "" {
		return Response{}, errors.New("anthropic: LLM_API_KEY and LLM_MODEL are required")
	}
	var out []map[string]any
	for _, m := range msgs {
		var blocks []map[string]any
		if m.Text != "" {
			blocks = append(blocks, map[string]any{"type": "text", "text": m.Text})
		}
		for _, c := range m.ToolCalls {
			var in any = map[string]any{}
			if len(c.Args) > 0 {
				_ = json.Unmarshal(c.Args, &in)
			}
			blocks = append(blocks, map[string]any{"type": "tool_use", "id": c.ID, "name": c.Name, "input": in})
		}
		for _, r := range m.ToolResults {
			blocks = append(blocks, map[string]any{"type": "tool_result", "tool_use_id": r.CallID, "content": r.Content})
		}
		out = append(out, map[string]any{"role": m.Role, "content": blocks})
	}
	body := map[string]any{
		"model": a.Model, "max_tokens": 1024, "temperature": 0,
		"system": system, "messages": out, "tools": tools,
	}
	b, _ := json.Marshal(body)
	url := a.URL
	if url == "" {
		url = "https://api.anthropic.com/v1/messages"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("x-api-key", a.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")
	hc := a.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	resp, err := hc.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		if len(raw) > 300 {
			raw = raw[:300]
		}
		return Response{}, fmt.Errorf("anthropic: status %d: %s", resp.StatusCode, raw)
	}
	var parsed struct {
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Response{}, err
	}
	var r Response
	for _, c := range parsed.Content {
		switch c.Type {
		case "text":
			r.Text += c.Text
		case "tool_use":
			r.ToolCalls = append(r.ToolCalls, ToolCall{ID: c.ID, Name: c.Name, Args: c.Input})
		}
	}
	return r, nil
}
