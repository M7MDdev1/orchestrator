import { Request, Response } from 'express';
import * as repo from '../repositories/call.repo';
import { CallStatus } from '../entities/Call';

export async function create(req: Request, res: Response) {
  const { to, scriptId, metadata } = req.body || {};
  const c = await repo.createCall({ to, scriptId, metadata });
  res.status(201).json(c);
}
export async function getOne(req: Request, res: Response) {
  const c = await repo.getCall(req.params.id);
  if (!c) return res.sendStatus(404);
  res.json(c);
}
export async function updateIfPending(req: Request, res: Response) {
  const c = await repo.updateIfPending(req.params.id, req.body);
  if (!c) return res.status(409).json({ error: 'Not pending or not found' });
  res.json(c);
}
export async function listByStatus(req: Request, res: Response) {
  const raw = String(req.query.status ?? 'PENDING');
  // validate status against CallStatus union
  const allowed: CallStatus[] = ['PENDING','IN_PROGRESS','COMPLETED','FAILED','EXPIRED'];
  const status: CallStatus = (allowed.includes(raw as CallStatus) ? (raw as CallStatus) : 'PENDING');
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  const data = await repo.listByStatus(status, page, pageSize);
  res.json(data);
}
