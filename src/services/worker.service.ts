import { AppDataSource } from '../data-source';
import dotenv from 'dotenv';
dotenv.config();

const GLOBAL_CAP = Number(process.env.GLOBAL_CONCURRENCY || 30);
const BASE_RETRY_SECONDS = Number(process.env.BASE_RETRY_SECONDS || 30);
const STALE_INPROG_SECONDS = Number(process.env.STALE_INPROG_SECONDS || 60 * 15); // 15 minutes

// Atomically: (a) count IN_PROGRESS, (b) pick one PENDING SKIP LOCKED, (c) flip to IN_PROGRESS
import { Call, CallStatus } from '../entities/Call';
import { CallDTO, mapDbRowToCallDTO } from '../dto/call.dto';
import { ProviderInterface } from '../providers/provider.interface';
import { HttpProvider } from '../providers/httpProvider';
import { SimulatedProvider } from '../providers/simulatedProvider';
import { ProviderCall } from '../entities/ProviderCall';

export type CallRow = Partial<Call> & { id: string };

/**
 * Reclaim IN_PROGRESS rows that have been running for too long (stale).
 * Increments attempts; if attempts exceed MAX_ATTEMPTS marks FAILED.
 */
export async function reclaimStaleInProgress(): Promise<void> {
  const maxAttempts = Number(process.env.MAX_ATTEMPTS || 3);
  // Update rows stale longer than STALE_INPROG_SECONDS using QueryBuilder
  // Increment attempts and set status/next_run_at/ended_at/last_error according to maxAttempts
  console.debug('[worker] reclaimStaleInProgress: checking for stale IN_PROGRESS rows');
  await AppDataSource.createQueryBuilder()
    .update(Call)
    .set({
      attempts: () => 'attempts + 1',
      // cast the CASE result to the call_status enum to avoid text->enum type errors
      status: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN 'FAILED'::call_status ELSE 'PENDING'::call_status END`,
      nextRunAt: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN next_run_at ELSE NOW() END`,
      endedAt: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN NOW() ELSE NULL END`,
      lastError: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN coalesce(last_error, 'stale-in-progress') ELSE last_error END`
    })
    // cast literal in WHERE as well
    .where(`status = 'IN_PROGRESS'::call_status AND started_at < NOW() - INTERVAL '${STALE_INPROG_SECONDS} seconds'`)
    .execute();
  console.debug('[worker] reclaimStaleInProgress: done');
}

export async function claimOne(): Promise<CallDTO | null> {
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    // Reclaim stale IN_PROGRESS before counting and claiming
    await reclaimStaleInProgress();

    await qr.startTransaction();
    try {
      // Acquire an advisory lock to serialize concurrency checks across workers.
      // This makes the GLOBAL_CAP check atomic and prevents races where multiple
      // workers read the same count and both proceed to claim, exceeding the cap.
  const lockKey = Number(process.env.GLOBAL_CONCURRENCY_LOCK_KEY || 424242);
      // pg_advisory_xact_lock takes a bigint; we pass the lock key to serialize this transaction
  console.debug('[worker] claimOne: acquiring advisory lock', { lockKey });
  await qr.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  console.debug('[worker] claimOne: advisory lock acquired');

  const inprog = await qr.manager.count(Call, { where: { status: 'IN_PROGRESS' as CallStatus } });
  console.debug('[worker] claimOne: in-progress count', { inprog });
      if (inprog >= GLOBAL_CAP) {
        console.debug('[worker] claimOne: global cap reached', { inprog, GLOBAL_CAP });
        await qr.rollbackTransaction();
        return null;
      }
      // Use raw SELECT ... FOR UPDATE SKIP LOCKED to respect PG locking semantics.
      const candidate = await qr.manager.query(
        `SELECT * FROM calls c
         WHERE c.status='PENDING' AND c.next_run_at <= NOW()
           AND NOT EXISTS (
             SELECT 1 FROM calls c2 WHERE c2.to_phone = c.to_phone AND c2.status='IN_PROGRESS'
           )
         ORDER BY c.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      console.debug('[worker] claimOne: candidate rows found', { count: candidate ? candidate.length : 0 });
      if (!candidate || !candidate[0]) {
        // nothing to claim
        console.debug('[worker] claimOne: no pending calls found');
        await qr.rollbackTransaction();
        return null;
      }
      console.debug('[worker] claimOne: candidate sample', candidate[0]);

      const id = candidate[0].id as string;
  // flip to IN_PROGRESS and set startedAt
  // cast status to call_status to avoid text->enum assignment errors
  await qr.manager.query(`UPDATE calls SET status = 'IN_PROGRESS'::call_status, started_at = $1 WHERE id = $2`, [new Date(), id]);

      const updated = await qr.manager.findOne(Call, { where: { id } });
      await qr.commitTransaction();
      console.info('[worker] claimOne: claimed call', { id });
      if (updated) return mapDbRowToCallDTO(updated as any);
      return null;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    }
  } finally {
    await qr.release();
  }
}

export async function startProviderCall(call: CallDTO): Promise<void> {
  // Dependency injection: provider implementation is chosen by the env var USE_SIMULATOR.
  const useSim = (process.env.USE_SIMULATOR || 'true').toLowerCase() === 'true';


  let provider: ProviderInterface = useSim ? new SimulatedProvider() : new HttpProvider(process.env.PROVIDER_BASE_URL!);

  const webhookUrl = `${process.env.PUBLIC_BASE_URL}/callbacks/call-status`;
  const payload = {
    to: call.to,
    scriptId: call.scriptId,
    webhookUrl
  };

  console.info('[worker] startProviderCall: calling provider', { callId: call.id, to: call.to, useSim });
  const resp = await provider.startCall(payload);
  if (resp.callId) {
    // Use QueryBuilder insert with orIgnore to emulate ON CONFLICT DO NOTHING
    await AppDataSource.createQueryBuilder()
      .insert()
      .into(ProviderCall)
      .values({ providerCallId: resp.callId as any, callId: call.id })
      .orIgnore()
      .execute();
    console.info('[worker] startProviderCall: provider returned callId', { callId: resp.callId, internalId: call.id });
  }
}

export async function handleRetryOrFail(callId: string, message: string): Promise<void> {
  const repo = AppDataSource.getRepository(Call);
  const row = await repo.findOne({ where: { id: callId } });
  if (!row) return;
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = Number(process.env.MAX_ATTEMPTS || 3);
  if (attempts < maxAttempts) {
    const delaySec = BASE_RETRY_SECONDS * Math.pow(2, attempts - 1);
    console.warn('[worker] handleRetryOrFail: scheduling retry', { callId, attempts, delaySec, maxAttempts });
    await repo.update(callId, {
      attempts,
      status: 'PENDING',
      nextRunAt: new Date(Date.now() + delaySec * 1000),
      lastError: message
    });
  } else {
    console.error('[worker] handleRetryOrFail: marking FAILED', { callId, attempts, maxAttempts, message });
    await repo.update(callId, {
      attempts,
      status: 'FAILED',
      endedAt: new Date(),
      lastError: message
    });
  }
}

export async function settleFromProvider({ callId, status, completedAt }: { callId: string; status: string; completedAt?: string }): Promise<{ found: boolean; updated: boolean; internalId?: string; final?: string }> {
  // callId here is the provider's id (provider_call_id). Resolve the internal call_id.
  const pcRepo = AppDataSource.getRepository(ProviderCall);
  const pc = await pcRepo.findOne({ where: { providerCallId: callId as any } });
  if (!pc) {
    // unknown provider call
    console.info('[worker] settleFromProvider: unknown provider call', { providerCallId: callId });
    return { found: false, updated: false };
  }
  console.info('[worker] settleFromProvider: resolving provider call', { providerCallId: callId, status, completedAt });
  const internalId = pc.callId;
  const final = status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
  // avoid overwriting an already COMPLETED call with FAILED
  const result = await AppDataSource.createQueryBuilder()
    .update(Call)
    .set({ status: final, endedAt: completedAt ? new Date(completedAt) : new Date() })
    .where('id = :id AND status != :completed', { id: internalId, completed: 'COMPLETED' })
    .execute();

  // execute() returns a raw result; we can infer update by checking affected (driver dependent)
  const updated = (result && (result as any).affected ? (result as any).affected > 0 : true);
  return { found: true, updated, internalId, final };
}
