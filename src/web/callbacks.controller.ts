import { Request, Response, NextFunction } from 'express';
import { settleFromProvider } from '../services/worker.service';

export async function callStatus(req: Request, res: Response, next: NextFunction) {
  try {
    // Accept either providerCallId (from provider) or callId (internal) for compatibility.
    const { providerCallId, callId: internalCallId, status, durationSec, completedAt } = req.body || {};
    const callId = providerCallId || internalCallId;
    if (!callId) return res.status(400).json({ error: 'missing_call_id' });
    if (!status) return res.status(400).json({ error: 'missing_status' });
    await settleFromProvider({ callId, status, completedAt });
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
