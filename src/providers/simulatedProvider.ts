import { ProviderInterface, ProviderCallResponse } from './provider.interface';

// Simulated provider for local testing. Returns deterministic provider call ids
// and optionally triggers the webhook by calling the webhookUrl (not implemented here).
// To use the simulator, set USE_SIMULATOR=true in your .env or swap the import in your DI layer.

import crypto from 'crypto';

export class SimulatedProvider implements ProviderInterface {
  async startCall(payload: { to: string; scriptId: string; webhookUrl: string }): Promise<ProviderCallResponse> {
    // Return a UUID so it matches the DB provider_call_id uuid column.
    const callId = crypto.randomUUID();
    // Optionally: you could POST to the webhookUrl here to simulate asynchronous callback.
    // For now we just return a provider-style response. Tests or scripts can then call the
    // /callbacks/call-status endpoint to simulate provider callback.
    return { callId };
  }
}
