import { AppDataSource } from './data-source';
import { claimOne, startProviderCall, handleRetryOrFail } from './services/worker.service';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.info('[worker] starting');
  try {
    await AppDataSource.initialize();
    console.info('[worker] AppDataSource initialized');
  } catch (e) {
    console.error('[worker] AppDataSource failed to initialize', e);
    throw e;
  }
  while (true) {
    try {
      const call = await claimOne();
      if (!call) { await sleep(250); continue; }
      try {
        console.info('[worker] starting provider call', { callId: call.id, to: call.to });
        await startProviderCall(call);
        console.info('[worker] provider call started for', { callId: call.id });
        // completion via webhook later
      } catch (err: any) {
        console.error('[worker] error while starting provider call', { callId: call.id, err: err?.message || err });
        await handleRetryOrFail(call.id, err?.message || 'provider error');
      }
    } catch (e) {
      console.error('[worker] error in main loop', e);
      await sleep(1000);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
