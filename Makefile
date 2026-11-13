.PHONY: run test bench demo lint build near-test near-stack

web-install:
	cd web && npm install

web-dev:
	cd web && GO_API_URL=$${GO_API_URL:-http://localhost:8080} npm run dev

web-build:
	cd web && GO_API_URL=$${GO_API_URL:-http://localhost:8080} npm run build

near-test:
	cd adapters/near && cargo test

run:
	go run ./cmd/lineage

build:
	go build -o bin/lineage ./cmd/lineage

test:
	go test ./...

bench:
	go run ./cmd/bench

demo:
	go run ./cmd/lineage -seed-only
	@echo "Demo ready: run 'make run' then open http://localhost:8080"

lint:
	go vet ./...
	gofmt -l .

# Guard API on :8080 with the Rust signer on :8090 wired in (needs cargo). Ctrl-C stops both.
near-stack:
	cd adapters/near && cargo build --release
	@trap 'kill 0' INT TERM EXIT; \
	(cd adapters/near && GUARD_URL=http://localhost:8080 ADAPTER_PORT=8090 ./target/release/lineage-near) & \
	NEAR_ADAPTER_URL=http://localhost:8090 go run ./cmd/lineage & \
	wait
