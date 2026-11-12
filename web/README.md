# Lineage web

The Next.js (App Router, TypeScript) frontend for Lineage. It renders the landing page with the live attack lab, the
scenario runner, run pages with decision timelines and lineage trees, owner approvals, the audit log and the benchmark.
All data comes from the Go API; this app has no database of its own.

## Run it

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

The Go API must be running. By default the app proxies to `http://localhost:8080`; point it elsewhere with
`GO_API_URL`:

```bash
GO_API_URL=https://lineage-api.example.com npm run dev
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`, `npm start`.

To run the API without real payment credentials, start it from a directory that has no `.env`, so the payment rail is
simulated:

```bash
go build -o /tmp/lineage-api ./cmd/lineage    # from the repo root
mkdir -p /tmp/lineage-run/results && cp results/latest.md results/summary.json /tmp/lineage-run/results/
cd /tmp/lineage-run && PORT=8080 DB_PATH=./api.db OWNER_SECRET=demo /tmp/lineage-api
```

## How it talks to the Go API

The browser only ever calls same-origin relative URLs (`/api/...`, `/v1/...`, `/healthz`). `next.config.ts` rewrites
those paths to `GO_API_URL`, so there is no CORS and the HttpOnly `owner` cookie set by `POST /api/login` works
through the proxy.

- `lib/types.ts` has a TypeScript type for every API response.
- `lib/api.ts` is the typed client. In the browser it uses relative URLs; in server components it calls `GO_API_URL`
  directly and forwards the visitor's cookies when the owner session matters (`/api/me`, `/api/approvals`).
- Pages are server components that fetch with `cache: "no-store"` and render an error state (not a crash) when the API
  is unreachable. Interactive pieces are client components: the attack lab, scroll reveal, run form, login form,
  approve/reject buttons and sign-out.
- All API data is rendered through React, which escapes it. Nothing uses `dangerouslySetInnerHTML`.

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page and attack lab (`POST /api/attack`) |
| `/demo` | Scenario runner and recent runs |
| `/runs/[id]` | Run timeline, decision cards, lineage trees, payouts |
| `/approvals` | Owner approvals; shows the sign-in form when not signed in as owner |
| `/audit` | Hash-chain verification and the newest 100 audit records |
| `/bench` | Benchmark report from `GET /api/bench/report` |

The "simulated compromised agent" label is shown wherever the `compromised` mode appears.

## Styling

Plain CSS, system font stacks only, no network fonts. `app/globals.css` holds the design tokens, `app/landing.css`
styles the landing page and `app/app.css` the app pages. Each is scoped under a wrapper class (`.lp`, `.app`) so the two
themes cannot leak into each other.

## Deploy

Any Node host works: set `GO_API_URL` to the public URL of the Go API, then

```bash
npm ci && npm run build && npm start
```

**`GO_API_URL` must be set when you run `npm run build`.** Next.js computes the `/api` and `/v1` proxy rewrites during the build, so changing the variable afterwards has no effect until you rebuild (a build made without it proxies to `http://localhost:8080`, and every API call then fails with a 500).
On Vercel, add `GO_API_URL` as an environment variable and deploy the `web` directory as the project root. The Go API
and this app should be served from the same site, or through the Next proxy as above, so the owner cookie stays
first-party.
