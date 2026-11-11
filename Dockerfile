FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/lineage ./cmd/lineage

FROM alpine:3.20
RUN adduser -D -u 10001 lineage
WORKDIR /app
COPY --from=build /out/lineage /app/lineage
COPY results/latest.md results/summary.json /app/results/
USER lineage
ENV PORT=8080 DB_PATH=/tmp/lineage.db
EXPOSE 8080
CMD ["/app/lineage"]
