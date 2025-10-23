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

## Full usage & testing guide

Prerequisites
- Node.js (18+ recommended)
- A Postgres database (local or remote) for running the app and worker

1) Configure environment
- Copy `.env.example` -> `.env` and set DB connection and URLs.

2) Build and run migrations
- Build TypeScript:

```bash
npm run build
```

- Generate or apply migrations (project includes a migration file). To run migrations with TypeORM CLI:

```bash
npm run typeorm migration:run -d dist/data-source.js
```

3) Run the API and worker
- Development (hot-reload):

```bash
npm run dev:api
npm run dev:worker
```

- Production (after build):

```bash
npm run start:api
npm run start:worker
```

4) Testing (unit tests)
- Install dev dependencies (only needed once):

```bash
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest
```

- Run tests:

```bash
npm test
```

The repository includes basic Jest tests that cover the HTTP routes. Tests mock repository and service layers so they run fast without a DB. Coverage report is produced in `coverage/`.

5) End-to-end checks
- To exercise the full end-to-end flow (DB + worker + provider):
  - Ensure Postgres is running and migrations applied.
  - Start API and worker (either dev or prod mode).
  - Create a call via POST /calls (see `postman_collection.json`).
  - If using the simulated provider (`USE_SIMULATOR=true`) the provider returns a providerCallId; use `scripts/inspect_call.js <CALL_ID>` or check `provider_calls` table to find the provider_call mapping. Then POST to `/callbacks/call-status` with `{ providerCallId, status: 'COMPLETED' }` to settle.

Troubleshooting
- If worker never claims calls: check `GLOBAL_CONCURRENCY` and `STALE_INPROG_SECONDS`, and ensure the worker process can connect to the DB.
- If `provider_calls` mapping is missing: make sure `startProviderCall()` runs successfully (check worker logs). You can use `scripts/insert_provider_mapping.js` to manually add a mapping for testing.

Where to look next
- `src/services/worker.service.ts` — core claim/worker logic
- `src/repositories/call.repo.ts` — DB CRUD helpers
- `src/providers` — provider implementations (simulated + HTTP)


## Notes
This project intentionally uses a persistence-first approach (Postgres as queue + locking).
See `PROJECT_SUMMARY.md` for in-depth architecture notes and remaining work.
