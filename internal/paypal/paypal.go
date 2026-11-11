// Package paypal is a minimal client for the PayPal sandbox REST API
// (OAuth and Payouts). The host is pinned to the sandbox: there is no code
// path to the live API.
package paypal

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// SandboxBase is the only host this client will talk to.
const SandboxBase = "https://api-m.sandbox.paypal.com"

// Client talks to the sandbox. Credentials never leave this package.
type Client struct {
	id, secret string
	HTTP       *http.Client // replaceable transport for tests; the URL stays pinned

	mu      sync.Mutex
	token   string
	expires time.Time
}

// New returns a client. env must be "sandbox".
func New(env, clientID, secret string) (*Client, error) {
	if env != "sandbox" {
		return nil, fmt.Errorf("PAYPAL_ENV must be %q (got %q): live PayPal is not supported", "sandbox", env)
	}
	if clientID == "" || secret == "" {
		return nil, errors.New("PayPal client id and secret are required")
	}
	u, _ := url.Parse(SandboxBase)
	if u.Host != "api-m.sandbox.paypal.com" {
		panic("paypal: base URL is not the sandbox host")
	}
	return &Client{id: clientID, secret: secret, HTTP: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.expires.Add(-30*time.Second)) {
		return c.token, nil
	}
	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, SandboxBase+"/v1/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(c.id+":"+c.secret)))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("paypal oauth: status %d: %s", resp.StatusCode, truncate(body))
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tr); err != nil || tr.AccessToken == "" {
		return "", errors.New("paypal oauth: unexpected response")
	}
	c.token = tr.AccessToken
	c.expires = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	return c.token, nil
}

func truncate(b []byte) string {
	if len(b) > 400 {
		b = b[:400]
	}
	return string(b)
}

// PayoutRequest is one single-item payout.
type PayoutRequest struct {
	IdempotencyKey string // PayPal-Request-Id and sender_batch_id suffix (the decision ID)
	Receiver       string
	AmountCents    int64
	Currency       string
	Note           string
	ItemID         string // sender_item_id (the invoice ID)
	EmailSubject   string
}

// FormatCents renders integer cents as "125.00". Money is never a float.
func FormatCents(c int64) string { return fmt.Sprintf("%d.%02d", c/100, c%100) }

// PayoutResult carries the batch ID, status and the raw JSON response.
type PayoutResult struct {
	BatchID string          `json:"batch_id"`
	Status  string          `json:"status"`
	Raw     json.RawMessage `json:"raw"`
}

// CreatePayout creates a one-item payout batch.
func (c *Client) CreatePayout(ctx context.Context, p PayoutRequest) (PayoutResult, error) {
	subject := p.EmailSubject
	if subject == "" {
		subject = "Payment from Lineage Demo Co"
	}
	body := map[string]any{
		"sender_batch_header": map[string]any{
			"sender_batch_id": "lineage-" + p.IdempotencyKey,
			"email_subject":   subject,
			"email_message":   p.Note,
		},
		"items": []map[string]any{{
			"recipient_type": "EMAIL",
			"amount":         map[string]string{"value": FormatCents(p.AmountCents), "currency": p.Currency},
			"receiver":       p.Receiver,
			"note":           p.Note,
			"sender_item_id": p.ItemID,
		}},
	}
	raw, status, err := c.do(ctx, http.MethodPost, "/v1/payments/payouts", body, map[string]string{"PayPal-Request-Id": p.IdempotencyKey})
	if err != nil {
		return PayoutResult{}, err
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return PayoutResult{Raw: raw}, fmt.Errorf("paypal payout: status %d: %s", status, truncate(raw))
	}
	var r struct {
		Header struct {
			ID     string `json:"payout_batch_id"`
			Status string `json:"batch_status"`
		} `json:"batch_header"`
	}
	if err := json.Unmarshal(raw, &r); err != nil || r.Header.ID == "" {
		return PayoutResult{Raw: raw}, errors.New("paypal payout: missing payout_batch_id in response")
	}
	return PayoutResult{BatchID: r.Header.ID, Status: r.Header.Status, Raw: raw}, nil
}

// GetPayout fetches batch status.
func (c *Client) GetPayout(ctx context.Context, batchID string) (PayoutResult, error) {
	raw, status, err := c.do(ctx, http.MethodGet, "/v1/payments/payouts/"+url.PathEscape(batchID), nil, nil)
	if err != nil {
		return PayoutResult{}, err
	}
	if status != http.StatusOK {
		return PayoutResult{Raw: raw}, fmt.Errorf("paypal get payout: status %d: %s", status, truncate(raw))
	}
	var r struct {
		Header struct {
			ID     string `json:"payout_batch_id"`
			Status string `json:"batch_status"`
		} `json:"batch_header"`
	}
	_ = json.Unmarshal(raw, &r)
	return PayoutResult{BatchID: r.Header.ID, Status: r.Header.Status, Raw: raw}, nil
}

func (c *Client) do(ctx context.Context, method, path string, body any, headers map[string]string) ([]byte, int, error) {
	tok, err := c.accessToken(ctx)
	if err != nil {
		return nil, 0, err
	}
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, SandboxBase+path, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, nil
}
