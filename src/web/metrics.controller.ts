import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';

export async function metrics(_req: Request, res: Response) {
  try {
    const rows = await AppDataSource.manager.query(`
      SELECT status, COUNT(*)::int AS count FROM calls GROUP BY status
    `);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.count;
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'metrics_error', message: (err as any)?.message ?? String(err) });
  }
}
