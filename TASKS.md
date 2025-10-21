# Ebra Back End Challenge: AI Call Orchestrator Service

## 1. Context
You’re building the backend “orchestrator” for an AI-driven calling platform. Clients enqueue call
requests; a pool of workers invokes an external AI-call API, tracks progress, retries on failure,
and enforces a maximum of 30 concurrent calls.

## 2. Assumptions & Schema
- Persistence: PostgreSQL
- Queue: Kafka or alternative durable queue (optional)
- Locking/State: Redis (optional)

Call interface (DB-backed)

- id: UUID
- payload: { to: string, scriptId: string, metadata?: Record<string, any> }
- status: 'PENDING'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'EXPIRED'
- attempts: number
- lastError?: string
- createdAt, startedAt?, endedAt?

## 3. Functional Requirements (implemented status)
Below is a checklist that tracks the tasks described in the spec and whether they're implemented.

### 3.1 HTTP API
- [x] Create Call — POST /calls (stores row with status 'PENDING')
- [x] Fetch Call — GET /calls/:id
- [x] Update Call (PENDING only) — PATCH /calls/:id (implemented in repository/controller)
- [x] List by Status — GET /calls?status=...
- [x] Metrics endpoint — GET /metrics (counts by status)

### 3.2 Worker service
- [x] Concurrency limiter (configurable GLOBAL_CONCURRENCY) — enforced at claim time
- [x] Fetch & lock (transactional) — `claimOne()` implemented with QueryRunner FOR UPDATE SKIP LOCKED
- [x] Invoke provider — provider abstraction implemented (HTTP + Simulated)
- [x] Record provider_call mapping — `provider_calls` table and insertion
- [x] Retries & exponential backoff — implemented (BASE_RETRY_SECONDS, MAX_ATTEMPTS)
- [x] Reclaim stale IN_PROGRESS rows — implemented (`reclaimStaleInProgress()`)
- [ ] DB-level partial unique index to guarantee single in-flight per phone — recommended but implemented via migration

### Completion detection (webhook)
- [x] Callback endpoint `/callbacks/call-status` implemented and accepts `providerCallId` or `callId`.
- [ ] Full E2E auto-simulation (worker + simulated provider auto-callback) — simulator exists but auto-callbacking is optional (not enabled by default)

## 4. Non-functional
- [x] TypeScript, Express, TypeORM, Postgres
- [x] `.env.example` provided and `.env` supported
- [x] Documentation: `README.md`, `PROJECT_SUMMARY.md`, `postman_collection.json` added

## 5. What was done (code highlights)
- Added provider abstraction: `src/providers/provider.interface.ts`, `httpProvider.ts`, `simulatedProvider.ts`
- Worker refactor: `src/services/worker.service.ts` now uses QueryRunner for transactional `claimOne()` and uses DI for provider
- DTO layer: `src/dto/call.dto.ts` (mapping helper)
- Migration: `src/migrations/1697920000000-CreateCallsAndProviderCalls.ts` and migration run via TypeORM
- Scripts: `scripts/init_db.sql`, `scripts/run_init_db.js`, `scripts/insert_provider_mapping.js`, `scripts/inspect_call.js`

## 6. Current status (as of now)
- API server runs and accepts requests
- Migrations applied; DB contains `calls` and `provider_calls`
- You can create calls via curl and view them
- Provider mapping can be inserted manually or via worker (worker must be started to auto-call provider)

## 7. Remaining / optional improvements (recommended)
- [ ] Enable automatic simulated provider callbacks (configurable) for easier E2E testing
- [ ] Add integration tests for the worker + webhook flow
- [ ] Add webhook signature verification & idempotency checks
- [ ] Add CI script and minimal unit tests
- [ ] Add docker-compose for dev (api + db) and a one-shot e2e script
- [ ] Add observability: structured logs and metrics for retries/claims/failures

## 8. How to reproduce locally (quick)
1. Copy `.env.example` to `.env` and set DB connection
2. Run migrations:

```bash
npm run typeorm -- migration:run -d src/data-source.ts
```

3. Build & run the server:

```bash
npm run build
node dist/server.js
```

4. Create a call (in another terminal):

```bash
curl -s -X POST http://localhost:3000/calls -H "Content-Type: application/json" \
 -d '{"to":"+15555555555","scriptId":"greeting_v1","metadata":{"customerId":"1234"}}' | jq
```

5. Simulate callback (if worker not running, insert provider mapping first):

```bash
node scripts/insert_provider_mapping.js <CALL_ID> sim-test-1
curl -s -X POST http://localhost:3000/callbacks/call-status -H "Content-Type: application/json" \
 -d '{"providerCallId":"sim-test-1","status":"COMPLETED","completedAt":"2025-10-21T12:00:00.000Z"}'
```

## 9. Acceptance checklist
- [x] Correctness: transactional claim, no double-processing (best-effort)
- [x] Reliability: retries/backoff and reclaim implemented
- [x] Code quality: refactor into provider abstraction and DTOs


---

_Last updated: 2025-10-21_
