package paypal

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// rewrite sends every request to the test server while the client still
// builds URLs against the pinned sandbox host.
type rewrite struct{ target *httptest.Server }

func (r rewrite) RoundTrip(req *http.Request) (*http.Response, error) {
	u := *req.URL
	u.Scheme, u.Host = "http", strings.TrimPrefix(r.target.URL, "http://")
	req2 := req.Clone(req.Context())
	req2.URL = &u
	return http.DefaultTransport.RoundTrip(req2)
}

func TestRefusesLive(t *testing.T) {
	if _, err := New("live", "id", "secret"); err == nil {
		t.Fatal("live environment must be refused")
	}
	if _, err := New("sandbox", "", ""); err == nil {
		t.Fatal("missing credentials must be refused")
	}
}

func TestFormatCents(t *testing.T) {
	cases := map[int64]string{0: "0.00", 5: "0.05", 125000: "1250.00", 12345: "123.45"}
	for in, want := range cases {
		if got := FormatCents(in); got != want {
			t.Errorf("FormatCents(%d)=%s want %s", in, got, want)
		}
	}
}

func TestCreateAndGetPayout(t *testing.T) {
	tokens := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/oauth2/token":
			tokens++
			if u, p, ok := r.BasicAuth(); !ok || u != "cid" || p != "sec" {
				t.Errorf("bad basic auth")
			}
			_, _ = w.Write([]byte(`{"access_token":"tok123","expires_in":3600}`))
		case r.URL.Path == "/v1/payments/payouts" && r.Method == http.MethodPost:
			if r.Header.Get("Authorization") != "Bearer tok123" {
				t.Errorf("missing bearer token")
			}
			if r.Header.Get("PayPal-Request-Id") != "dec_1" {
				t.Errorf("missing idempotency header")
			}
			b, _ := io.ReadAll(r.Body)
			var got map[string]any
			_ = json.Unmarshal(b, &got)
			item := got["items"].([]any)[0].(map[string]any)
			amt := item["amount"].(map[string]any)
			if amt["value"] != "1250.00" || item["receiver"] != "v@x.test" {
				t.Errorf("unexpected payout body: %s", b)
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"batch_header":{"payout_batch_id":"B1","batch_status":"PENDING"}}`))
		case r.URL.Path == "/v1/payments/payouts/B1":
			_, _ = w.Write([]byte(`{"batch_header":{"payout_batch_id":"B1","batch_status":"SUCCESS"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c, err := New("sandbox", "cid", "sec")
	if err != nil {
		t.Fatal(err)
	}
	c.HTTP = &http.Client{Transport: rewrite{srv}}

	res, err := c.CreatePayout(context.Background(), PayoutRequest{
		IdempotencyKey: "dec_1", Receiver: "v@x.test", AmountCents: 125000, Currency: "USD", Note: "Invoice inv_1", ItemID: "inv_1",
	})
	if err != nil || res.BatchID != "B1" || res.Status != "PENDING" {
		t.Fatalf("got %+v err=%v", res, err)
	}
	st, err := c.GetPayout(context.Background(), "B1")
	if err != nil || st.Status != "SUCCESS" {
		t.Fatalf("got %+v err=%v", st, err)
	}
	if tokens != 1 {
		t.Errorf("token should be cached, fetched %d times", tokens)
	}
}

func TestPayoutErrorIsSurfaced(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/oauth2/token" {
			_, _ = w.Write([]byte(`{"access_token":"t","expires_in":60}`))
			return
		}
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"name":"AUTHORIZATION_ERROR"}`))
	}))
	defer srv.Close()
	c, _ := New("sandbox", "a", "b")
	c.HTTP = &http.Client{Transport: rewrite{srv}}
	if _, err := c.CreatePayout(context.Background(), PayoutRequest{IdempotencyKey: "k", Receiver: "x@y.test", AmountCents: 100, Currency: "USD"}); err == nil {
		t.Fatal("expected an error for a 403")
	}
}
