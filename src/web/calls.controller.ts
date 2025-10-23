import { Request, Response, NextFunction } from 'express';
import * as repo from '../repositories/call.repo';
import { CallStatus } from '../entities/Call';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuid(id: string) {
  return UUID_RE.test(id);
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { to, scriptId, metadata } = req.body || {};
    const missing: Record<string, string> = {};
    if (!to || typeof to !== 'string') missing.to = 'required string';
    if (!scriptId || typeof scriptId !== 'string') missing.scriptId = 'required string';
    if (Object.keys(missing).length) return res.status(400).json({ error: 'validation_error', missing });

    const c = await repo.createCall({ to, scriptId, metadata });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!validateUuid(id)) return res.status(400).json({ error: 'invalid_id', message: 'id must be a UUID' });
    const c = await repo.getCall(id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c);
  } catch (err) {
    next(err);
  }
}

export async function updateIfPending(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!validateUuid(id)) return res.status(400).json({ error: 'invalid_id', message: 'id must be a UUID' });
    const body = req.body || {};
    // only allow specific fields
    const allowed: Array<'to'|'scriptId'|'metadata'> = ['to','scriptId','metadata'];
    const payload: Partial<Record<'to'|'scriptId'|'metadata', any>> = {};
    for (const k of allowed) if (body[k] !== undefined) payload[k] = body[k];
    if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'validation_error', message: 'no updatable fields provided' });

    const c = await repo.updateIfPending(id, payload as any);
    if (!c) return res.status(409).json({ error: 'conflict', message: 'Not pending or not found' });
    res.json(c);
  } catch (err) {
    next(err);
  }
}

export async function listByStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = String(req.query.status ?? 'PENDING');
    // validate status against CallStatus union
    const allowed: CallStatus[] = ['PENDING','IN_PROGRESS','COMPLETED','FAILED','EXPIRED'];
    const status: CallStatus = (allowed.includes(raw as CallStatus) ? (raw as CallStatus) : 'PENDING');
    const page = Number(req.query.page ?? 1) || 1;
    const pageSize = Number(req.query.pageSize ?? 20) || 20;
    const data = await repo.listByStatus(status, page, pageSize);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
