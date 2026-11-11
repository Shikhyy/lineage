// Command lineage runs the guard service, payment executor, AP agent and web UI.
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/audit"
	"github.com/Shikhyy/lineage/internal/db"
	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
	"github.com/Shikhyy/lineage/internal/paypal"
	"github.com/Shikhyy/lineage/internal/records"
	"github.com/Shikhyy/lineage/internal/scenario"
	"github.com/Shikhyy/lineage/internal/web"
)

// loadDotEnv reads KEY=VALUE lines from .env without overriding real
// environment variables.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
		}
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int64) int64 {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
		log.Fatalf("%s must be an integer, got %q", k, v)
	}
	return def
}

func main() {
	seedOnly := flag.Bool("seed-only", false, "seed demo data and exit")
	flag.Parse()
	loadDotEnv(".env")

	d, err := db.Open(env("DB_PATH", "data/lineage.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer d.Close()
	rec := records.New(d)
	alog := audit.New(d)

	ad := scenario.DefaultAddresses()
	ad.VendorA = env("VENDOR_A_EMAIL", ad.VendorA)
	ad.VendorB = env("VENDOR_B_EMAIL", ad.VendorB)
	ad.Attacker = env("ATTACKER_EMAIL", ad.Attacker)

	if vs, _ := rec.ListVendors(); len(vs) == 0 || *seedOnly {
		if err := scenario.Seed(rec, scenario.Scenario{}, ad); err != nil {
			log.Fatalf("seed: %v", err)
		}
		log.Printf("seeded demo vendors, purchase order and invoice inv_1")
	}
	if *seedOnly {
		return
	}

	gcfg := guard.DefaultConfig()
	gcfg.PerTxCapCents = envInt("PER_TX_CAP_CENTS", gcfg.PerTxCapCents)
	gcfg.DailyCapCents = envInt("DAILY_CAP_CENTS", gcfg.DailyCapCents)
	gcfg.ToleranceBPS = envInt("PO_TOLERANCE_BPS", gcfg.ToleranceBPS)
	gcfg.Currencies = strings.Split(env("ALLOWED_CURRENCIES", "USD"), ",")

	// Rail: PayPal sandbox when credentials exist, otherwise a labelled simulation.
	var rail executor.Rail = executor.SimRail{}
	simulated := true
	if id, secret := os.Getenv("PAYPAL_CLIENT_ID"), os.Getenv("PAYPAL_CLIENT_SECRET"); id != "" && secret != "" {
		pc, err := paypal.New(env("PAYPAL_ENV", "sandbox"), id, secret)
		if err != nil {
			log.Fatal(err)
		}
		rail, simulated = executor.PayPalRail{Client: pc}, false
		log.Printf("payment rail: PayPal sandbox")
	} else {
		log.Printf("payment rail: SIMULATED (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the PayPal sandbox)")
	}

	var llm agent.LLM
	model := os.Getenv("LLM_MODEL")
	if key := os.Getenv("LLM_API_KEY"); key != "" && model != "" {
		llm = &agent.AnthropicLLM{APIKey: key, Model: model}
		log.Printf("llm mode enabled with model %s", model)
	}

	secret := os.Getenv("OWNER_SECRET")
	if secret == "" || secret == "change-me" {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		secret = hex.EncodeToString(b)
		log.Printf("OWNER_SECRET is not set: generated one for this process: %s", secret)
	}

	srv := &web.Server{
		Rec: rec, Audit: alog, Exec: executor.New(rec, alog, rail), Guard: gcfg, Addr: ad,
		Secret: secret, LLM: llm, LLMModel: model, Simulated: simulated, ResultsPath: "results/latest.md",
	}
	h, err := srv.Handler()
	if err != nil {
		log.Fatal(err)
	}
	port := env("PORT", "8080")
	hs := &http.Server{Addr: ":" + port, Handler: h, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("lineage listening on http://localhost:%s", port)
	log.Fatal(hs.ListenAndServe())
}
