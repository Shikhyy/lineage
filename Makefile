.PHONY: run test bench demo lint build near-test

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
