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
  await AppDataSource.createQueryBuilder()
    .update(Call)
    .set({
      attempts: () => 'attempts + 1',
      status: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN 'FAILED' ELSE 'PENDING' END`,
      nextRunAt: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN next_run_at ELSE NOW() END`,
      endedAt: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN NOW() ELSE NULL END`,
      lastError: () => `CASE WHEN attempts + 1 >= ${maxAttempts} THEN coalesce(last_error, 'stale-in-progress') ELSE last_error END`
    })
    .where(`status = 'IN_PROGRESS' AND started_at < NOW() - INTERVAL '${STALE_INPROG_SECONDS} seconds'`)
    .execute();
}

export async function claimOne(): Promise<CallDTO | null> {
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    // Reclaim stale IN_PROGRESS before counting and claiming
    await reclaimStaleInProgress();

    await qr.startTransaction();
    try {
      const inprog = await qr.manager.count(Call, { where: { status: 'IN_PROGRESS' as CallStatus } });
      if (inprog >= GLOBAL_CAP) {
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
      if (!candidate || !candidate[0]) {
        await qr.rollbackTransaction();
        return null;
      }

      const id = candidate[0].id as string;
      // flip to IN_PROGRESS and set startedAt
      await qr.manager.update(Call, { id }, { status: 'IN_PROGRESS', startedAt: new Date() });

      const updated = await qr.manager.findOne(Call, { where: { id } });
      await qr.commitTransaction();
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

  const resp = await provider.startCall(payload);
  if (resp.callId) {
    // Use QueryBuilder insert with orIgnore to emulate ON CONFLICT DO NOTHING
    await AppDataSource.createQueryBuilder()
      .insert()
      .into(ProviderCall)
      .values({ providerCallId: resp.callId as any, callId: call.id })
      .orIgnore()
      .execute();
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
    await repo.update(callId, {
      attempts,
      status: 'PENDING',
      nextRunAt: new Date(Date.now() + delaySec * 1000),
      lastError: message
    });
  } else {
    await repo.update(callId, {
      attempts,
      status: 'FAILED',
      endedAt: new Date(),
      lastError: message
    });
  }
}

export async function settleFromProvider({ callId, status, completedAt }: { callId: string; status: string; completedAt?: string }): Promise<void> {
  // callId here is the provider's id (provider_call_id). Resolve the internal call_id.
  const pcRepo = AppDataSource.getRepository(ProviderCall);
  const pc = await pcRepo.findOne({ where: { providerCallId: callId as any } });
  if (!pc) return; // unknown provider call
  const internalId = pc.callId;
  const final = status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
  // avoid overwriting an already COMPLETED call with FAILED
  await AppDataSource.createQueryBuilder()
    .update(Call)
    .set({ status: final, endedAt: completedAt ? new Date(completedAt) : new Date() })
    .where('id = :id AND status != :completed', { id: internalId, completed: 'COMPLETED' })
    .execute();
}
