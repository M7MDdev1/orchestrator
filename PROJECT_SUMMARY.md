# Ebra — AI Call Orchestrator

## Project overview
This is a small backend service that orchestrates outbound AI-powered calls. Clients enqueue call requests; a pool of workers pulls work from the DB, invokes an external AI provider API, tracks progress, retries failures with exponential backoff, and enforces a global concurrent-in-progress cap.

Tech stack
- Node.js (TypeScript)
- Express for HTTP
- TypeORM + PostgreSQL for persistence
- Axios for provider HTTP

Important design decisions
- Persistence-first approach: queueing/locking and concurrency enforcement are implemented using PostgreSQL (FOR UPDATE SKIP LOCKED, transactional QueryRunner). This keeps the project simple and self-contained.
- Minimal external infra: Redis/Kafka/Docker are intentionally ignored to keep the solution compact and focused on correctness.

---

## What the code does today (summary of implemented features)

HTTP API
- POST /calls
  - Create a call: `{ to, scriptId, metadata? }` → stored with status `PENDING`, `attempts=0`.
- GET /calls/:id
  - Fetch call by id.
- PATCH /calls/:id
  - Update payload (to/scriptId/metadata) only when `status === 'PENDING'`.
- GET /calls?status=...&page=&pageSize=
  - List calls by status (paginated).
- GET /metrics
  - Returns counts of calls by status.
- POST /callbacks/call-status
  - Provider webhook endpoint. Maps provider `callId` to internal call and marks it `COMPLETED` or `FAILED`.

Worker logic
- `src/services/worker.service.ts` implements:
  - claimOne(): transactionally claim a `PENDING` call, set `IN_PROGRESS`, and return the call. Uses `FOR UPDATE SKIP LOCKED` and respects a global `GLOBAL_CONCURRENCY` cap.
  - startProviderCall(): POST to provider, insert provider_calls mapping.
  - handleRetryOrFail(): increment attempts, compute exponential backoff (configurable base), re-schedule or mark FAILED based on `MAX_ATTEMPTS`.
  - reclaimStaleInProgress(): detect stuck `IN_PROGRESS` rows older than a configurable TTL, increment attempts and re-queue or mark FAILED.
  - settleFromProvider(): resolves provider_call_id → internal call id and sets final state, avoiding overwriting COMPLETED.

Type improvements
- Added DTOs (`src/dto/call.dto.ts`) and mapping helper to convert DB rows to DTOs.
- Replaced brittle multi-statement SQL claim with QueryRunner-based transaction and typed returns.
- Repository functions typed (createCall, getCall, updateIfPending, listByStatus).

Safety & correctness
- Single in-flight per phone enforced via `NOT EXISTS` check when claiming.
- Global concurrency cap enforced by counting `IN_PROGRESS` before claiming.

---

## Files removed (cleanup)
- `src/routes/userRoutes.ts` (empty)
- `src/controllers/userController.ts` (empty)
- `src/config/database.ts` (unused placeholder)
- `src/config/dotenv.ts` (unused placeholder)

These files were empty and not referenced by the project; removing them reduces clutter.

---

## What we changed (chronological)
1. Fixed decorator settings in `tsconfig.json` so TypeORM decorators compile.
2. Removed `node_modules` from git history and cleaned .git (local purge).
3. Made migration script generic in `package.json`.
4. Audited worker logic and fixed critical bugs:
   - Fixed `settleFromProvider` mapping bug (provider call id → internal id).
   - Fixed exponential backoff calculation and made it configurable.
   - Added stale `IN_PROGRESS` reclamation.
   - Rewrote `claimOne()` to use QueryRunner transaction and enforce single in-flight per phone.
5. Added DTO layer and mapping helpers to reduce ad-hoc `any` usage and make service boundaries explicit.
6. Typed repository APIs and added small type annotations across services.

---

## Remaining work (recommended, prioritized)
Priority: High
- Add idempotency and signature verification for provider webhook (HMAC or API key) so the webhook cannot be spoofed.
- Strengthen tests:
  - Unit tests for `handleRetryOrFail`, `reclaimStaleInProgress`, and `settleFromProvider`.
  - Integration test for `claimOne` concurrency behavior (using a test Postgres instance).
- Replace DB counting approach for concurrency with a more robust mechanism if you expect high throughput (Redis-based semaphore or Postgres advisory locks keyed by worker shard).

Priority: Medium
- Replace remaining `any` in code with full DTO types and provider payload types.
- Add request validation on API routes (zod or class-validator).
- Add logging & metrics (Prometheus or structured logs) for retries, failures, and stuck jobs.

Priority: Low / Optional
- Add Docker compose for local dev (DB + app).
- Use BFG/git-filter-repo for a safer remote history purge if you plan to push the rewritten history upstream.

---

## How to run locally (quick)
1. Copy `.env.example` to `.env` and fill DB config + PROVIDER_BASE_URL + PUBLIC_BASE_URL.
2. Install deps: `npm install`
3. Build: `npm run build` or run worker in dev: `npm run dev:worker` and API: `npm run dev:api`.
4. Type-check: `npx tsc --noEmit`.

---

## Configuration (env vars)
- GLOBAL_CONCURRENCY (default 30)
- BASE_RETRY_SECONDS (default 30)
- MAX_ATTEMPTS (default 3)
- STALE_INPROG_SECONDS (default 900 = 15min)
- PROVIDER_BASE_URL, PUBLIC_BASE_URL
- DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME

---

## Final notes
This codebase now implements the essential orchestrator functionality required by the challenge:
- Correctness: avoids double-processing through DB locking + per-phone single-in-flight guard.
- Reliability: retries and exponential backoff are implemented; stuck calls are reclaimed.
- Code quality: improved typing and DTOs, transaction-safe claim logic.

If you want, I can now:
- Add webhook signature verification and validation (next priority),
- Add unit tests and a small CI workflow to run `npx tsc && npm test`, or
- Finish type-hardening the entire codebase (remove remaining `any`).

Pick one and I'll implement it next.

---

## File-by-file reference (complete)
Below is a complete description of every important file in this repository, what it does, key functions/symbols, and notes about current status.

Repository root
- `.env` — runtime environment variables used by the running app (not committed; holds DB credentials, simulator toggle, etc.).
- `.env.example` — example env file with documented defaults and toggles (USE_SIMULATOR, PROVIDER_BASE_URL, PUBLIC_BASE_URL, GLOBAL_CONCURRENCY, BASE_RETRY_SECONDS, MAX_ATTEMPTS, STALE_INPROG_SECONDS). Use as a template for `.env`.
- `package.json` — npm manifest. Important scripts: `dev:api`, `dev:worker`, `typeorm` (CLI wrapper), `build`, `start:api`, `start:worker`, `migrate:generate`.
- `tsconfig.json` — TypeScript compiler options (decorators enabled, outDir=./dist, strict checks enabled).
- `README.md` — Quickstart, provider DI notes, API summary, and environment variables.
- `TASKS.md` — high-level checklist and current implementation status (what's done and what's pending).
- `postman_collection.json` — Postman collection with example requests (create, get, patch, list, metrics, provider callback).

Top-level scripts and helpers (`/scripts`)
- `scripts/insert_provider_mapping.js` — small Node helper to insert a `provider_calls(provider_call_id, call_id)` mapping for testing callback handling when the worker has not created the mapping. Usage: `node scripts/insert_provider_mapping.js <CALL_ID> [PROVIDER_CALL_ID]`.
- `scripts/inspect_call.js` — debug helper to print `calls` and `provider_calls` rows for a provided id. Usage: `node scripts/inspect_call.js <CALL_ID>` or `node scripts/inspect_call.js <PROVIDER_CALL_ID> --provider`.

Source code (`/src`)

- `src/app.ts`
  - Purpose: Express application wiring. Mounts the JSON body parser and routes: `/calls`, `/metrics`, `/callbacks`.
  - Important: lightweight; this is the app instance exported and consumed by `src/server.ts`.

- `src/server.ts`
  - Purpose: API server bootstrap. Loads dotenv, initializes `AppDataSource` (TypeORM), and starts Express on configured PORT.
  - Behavior: Exits on DataSource initialization failure.

- `src/data-source.ts`
  - Purpose: TypeORM DataSource configuration. Registers entities `Call` and `ProviderCall`, configures migrations, and reads DB env vars.
  - Important: `synchronize` is false (migrations required).

- `src/worker.ts`
  - Purpose: Long-running worker process that claims work and triggers provider calls. Intended to be started separately from API.
  - Behavior: infinite loop: claimOne() -> startProviderCall(call) -> handle failures via handleRetryOrFail(). Sleeps between attempts when nothing to process.

Entities and DTOs
- `src/entities/Call.ts`
  - Purpose: TypeORM entity for `calls` table. Declares columns (id, to_phone, script_id, metadata, status, attempts, last_error, created_at, started_at, ended_at, next_run_at).
  - Key notes: `next_run_at` is used for scheduling backoffs; `status` uses string union in TS and enum-like behavior in DB numeric migration.

- `src/entities/ProviderCall.ts`
  - Purpose: TypeORM entity for provider mapping table (`provider_calls`). Fields: `provider_call_id` (PK) and `call_id` (FK to calls.id).

- `src/dto/call.dto.ts`
  - Purpose: DTO definitions and `mapDbRowToCallDTO` helper that maps snake_case DB rows to camelCase DTO shape used by the service layer and HTTP responses.

Providers (external integration)
- `src/providers/provider.interface.ts`
  - Purpose: small interface declaring `startCall(payload) -> { callId }` so implementations can be swapped.

- `src/providers/httpProvider.ts`
  - Purpose: real provider implementation; posts to `${PROVIDER_BASE_URL}/api/v1/calls`, expects 200/202 and `callId` in response.
  - Throws on non-200/202 or missing `callId`.

- `src/providers/simulatedProvider.ts`
  - Purpose: local simulator used for development/testing. Returns deterministic `sim-<timestamp>-<n>` provider call ids.
  - Default behavior: passive — returns callId but does not auto-post webhook callbacks. This avoids accidental network side-effects and keeps tests deterministic. Auto-callbacking is a planned opt-in enhancement.

Repositories (DB access wrappers)
- `src/repositories/call.repo.ts`
  - Purpose: wrapper around TypeORM repository methods for `Call` entity. Exposes `createCall`, `getCall`, `updateIfPending`, and `listByStatus`.
  - Notes: `updateIfPending` enforces the PATCH semantics (only allowed when status==='PENDING').

Routes & controllers (HTTP API)
- `src/routes/calls.ts` + `src/web/calls.controller.ts`
  - Routes: `POST /calls`, `GET /calls/:id`, `PATCH /calls/:id`, `GET /calls` (list)
  - Controller: delegates to repository methods; responds with appropriate status codes. `PATCH` returns 409 if not allowed.

- `src/routes/callbacks.ts` + `src/web/callbacks.controller.ts`
  - Route: `POST /callbacks/call-status`
  - Controller: accepts either `providerCallId` or `callId` (internal); calls `settleFromProvider`. Returns 400 if missing id. Updated to be compatible with provider vs internal payloads.

- `src/routes/metrics.ts` + `src/web/metrics.controller.ts`
  - Route: `GET /metrics` — controller runs a `SELECT status, COUNT(*)` and returns simple JSON counts by status.

Services (worker logic)
- `src/services/worker.service.ts`
  - Purpose: core orchestration functions used by worker and callback handling.
  - Key functions:
    - `reclaimStaleInProgress()` — finds and requeues or fails `IN_PROGRESS` rows older than `STALE_INPROG_SECONDS`.
    - `claimOne()` — QueryRunner transaction: ensures `GLOBAL_CONCURRENCY` cap is respected; selects a `PENDING` candidate with `FOR UPDATE SKIP LOCKED` and a `NOT EXISTS` guard for same-phone `IN_PROGRESS`; flips to `IN_PROGRESS` and returns the DTO.
    - `startProviderCall(call)` — picks provider impl depending on `USE_SIMULATOR`, calls provider.startCall(), and inserts `provider_calls` mapping.
    - `handleRetryOrFail(callId, message)` — increments attempts and either requeues with exponential backoff or marks `FAILED`.
    - `settleFromProvider({ callId, status, completedAt })` — resolves `provider_call_id` -> internal `call_id` via `provider_calls` and updates `calls` to `COMPLETED` or `FAILED` (doesn't overwrite already COMPLETED rows).

Migrations
- `src/migrations/1761046586238-AutoMigration.ts`
  - Purpose: initial DB schema migration. Creates `call_status` enum type, `calls` table, `provider_calls` table, indexes for next_run/status selection, and a partial unique index to enforce single IN_PROGRESS per phone.
  - Status: applied via `npm run typeorm -- migration:run -d src/data-source.ts` in your environment.

Compiled output (`dist/`)
- `dist/` contains compiled JS equivalents of the TypeScript sources. These are used when running `node dist/server.js` or `node dist/worker.js` (useful in runtime environments without ts-node).

Notes, outstanding items & recommendations
- E2E Simulator: the `SimulatedProvider` is intentionally passive. If you want an opt-in auto-callback feature, I recommend adding `SIMULATOR_AUTO_CALLBACK=true` and `SIMULATOR_CALLBACK_DELAY_SEC` env vars, and implementing a safe fire-and-forget POST in the simulator.
- Webhook security: add signature (HMAC) verification for `/callbacks/call-status` and idempotency checks.
- Tests & CI: unit tests for retry logic, settle logic, and concurrency; integration test for claimOne under concurrent clients.
- Observability: structured logs on claim/start/settle and counters for retries/failed/reclaimed.

---

If you want this file exported as a new `FULL_FILE_EXPLAINER.md` in repo, I can add it and commit it. Alternatively, I can implement one of the pending items (auto-callback, webhook verification, tests) next — tell me which and I'll create a small todo and implement it.
