# Ebra — AI Call Orchestrator

This repository contains a small backend service that orchestrates outbound AI-driven calls.
Clients enqueue calls and a pool of workers invokes an external AI provider API, tracks progress
via webhooks, retries failures with exponential backoff, and enforces a global concurrency cap.

## What's included
- Express HTTP API for creating, reading, updating, and listing calls
- Worker logic that claims work transactionally from Postgres and invokes provider
- Retry/backoff and reclaiming for stuck jobs
- DTO mapping for DB rows

## Quick start
1. Copy `.env.example` to `.env` and set your DB and provider values.
2. Install dependencies

```bash
npm install
```

3. Run the API (dev)

```bash
npm run dev:api
```

4. Run the worker (dev)

```bash
npm run dev:worker
```

## Environment variables
- DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
- PROVIDER_BASE_URL
- PUBLIC_BASE_URL
- GLOBAL_CONCURRENCY (default 30)
- BASE_RETRY_SECONDS (default 30)
- MAX_ATTEMPTS (default 3)
- STALE_INPROG_SECONDS (default 900)

Provider simulation / dependency injection
- The code now uses a small provider abstraction (see `src/providers`). There are two implementations:
  - `HttpProvider` — calls the real provider over HTTP (requires `PROVIDER_BASE_URL`).
  - `SimulatedProvider` — a lightweight in-memory simulator useful for local development and tests.

By default the simulator is enabled for safety. To switch:
1. Copy `.env.example` to `.env` and set `USE_SIMULATOR=false` to use the real provider.
2. When `USE_SIMULATOR=false` ensure `PROVIDER_BASE_URL` points to the provider endpoint.

Files added:
- `src/providers/provider.interface.ts` — provider interface contract.
- `src/providers/httpProvider.ts` — real provider implementation using axios.
- `src/providers/simulatedProvider.ts` — simple deterministic simulator.

Tip: The code chooses the implementation based on `USE_SIMULATOR` at runtime. If you want to
hard-wire the provider in code (for integration tests), you can import the desired class and
instantiate it in the worker instead of using the env switch.

## API Endpoints (examples)
- POST /calls
  - Body: { to, scriptId, metadata? }
- GET /calls/:id
- PATCH /calls/:id
  - Only allowed when call.status === 'PENDING'
- GET /calls?status=PENDING&page=1&pageSize=20
- GET /metrics
- POST /callbacks/call-status
  - Provider webhook to settle calls

See `postman_collection.json` for ready-to-run examples you can import into Postman.

## Notes
This project intentionally uses a persistence-first approach (Postgres as queue + locking).
See `PROJECT_SUMMARY.md` for in-depth architecture notes and remaining work.
