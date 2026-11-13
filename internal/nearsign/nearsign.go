// Package nearsign is the HTTP client for the lineage-near adapter, the Rust
// process that holds the NEAR key and signs NEP-413 intents.
package nearsign

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Shikhyy/lineage/internal/guard"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func New(base string) *Client {
	return &Client{BaseURL: strings.TrimRight(base, "/"), HTTP: &http.Client{Timeout: 10 * time.Second}}
}

func (c *Client) do(ctx context.Context, method, path string, body any) (json.RawMessage, int, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, rd)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return out, resp.StatusCode, err
}

// Nonce asks the adapter for a nonce that carries the Verifier's current salt.
func (c *Client) Nonce(ctx context.Context) (string, error) {
	out, code, err := c.do(ctx, http.MethodGet, "/nonce", nil)
	if err != nil {
		return "", err
	}
	if code != http.StatusOK {
		return "", fmt.Errorf("adapter /nonce: HTTP %d", code)
	}
	var r struct {
		Nonce string `json:"nonce"`
	}
	if err := json.Unmarshal(out, &r); err != nil || r.Nonce == "" {
		return "", fmt.Errorf("adapter /nonce: bad response")
	}
	return r.Nonce, nil
}

// Sign asks the adapter to sign an intent the guard already authorized. The
// adapter re-checks the decision with the guard and signs only if the
// arguments are identical to the decided ones. The reply is the adapter's
// JSON (signed payload, public key, signature).
func (c *Client) Sign(ctx context.Context, runID, decisionID string, intent guard.IntentArgs) (json.RawMessage, error) {
	out, code, err := c.do(ctx, http.MethodPost, "/sign-intent", map[string]any{
		"run_id": runID, "decision_id": decisionID, "intent": intent, "context": []string{},
	})
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("adapter refused (HTTP %d): %s", code, strings.TrimSpace(string(out)))
	}
	return out, nil
}
