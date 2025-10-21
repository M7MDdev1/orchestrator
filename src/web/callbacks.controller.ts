import { Request, Response } from 'express';
import { settleFromProvider } from '../services/worker.service';

export async function callStatus(req: Request, res: Response) {
  // Accept either providerCallId (from provider) or callId (internal) for compatibility.
  const { providerCallId, callId: internalCallId, status, durationSec, completedAt } = req.body || {};
  const callId = providerCallId || internalCallId;
  if (!callId) return res.status(400).send('missing call id');
  await settleFromProvider({ callId, status, completedAt });
  res.sendStatus(200);
}
