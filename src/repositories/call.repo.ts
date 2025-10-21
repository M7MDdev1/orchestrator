import { AppDataSource } from '../data-source';
import { Call, CallStatus } from '../entities/Call';

export const CallRepo = () => AppDataSource.getRepository(Call);

export interface CreateCallInput { to: string; scriptId: string; metadata?: Record<string, any> }

export async function createCall(input: CreateCallInput): Promise<Call> {
  const repo = CallRepo();
  const c = repo.create({ to: input.to, scriptId: input.scriptId, metadata: input.metadata || {} });
  return await repo.save(c);
}

export async function getCall(id: string): Promise<Call | null> {
  return await CallRepo().findOne({ where: { id } });
}

export async function updateIfPending(id: string, body: Partial<Pick<Call, 'to'|'scriptId'|'metadata'>>): Promise<Call | null> {
  const repo = CallRepo();
  const existing = await repo.findOne({ where: { id } });
  if (!existing || existing.status !== 'PENDING') return null;
  if (body.to !== undefined) existing.to = body.to;
  if (body.scriptId !== undefined) existing.scriptId = body.scriptId;
  if (body.metadata !== undefined) existing.metadata = body.metadata as Record<string, any>;
  return await repo.save(existing);
}

export async function listByStatus(status: CallStatus, page = 1, pageSize = 20): Promise<Call[]> {
  const repo = CallRepo();
  return repo.find({
    where: { status },
    order: { createdAt: 'DESC' },
    skip: (page - 1) * pageSize,
    take: pageSize
  });
}
