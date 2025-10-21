export interface CallPayloadDTO {
  to: string;
  scriptId: string;
  metadata?: Record<string, any>;
}

export type CallStatusDTO = 'PENDING'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'EXPIRED';

export interface CallDTO {
  id: string;
  to: string;
  scriptId: string;
  metadata: Record<string, any>;
  status: CallStatusDTO;
  attempts: number;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  nextRunAt: string;
}

// helper to map snake_case DB row to DTO (loose mapping)
export function mapDbRowToCallDTO(row: any): CallDTO {
  return {
    id: row.id,
    to: row.to || row.to_phone,
    scriptId: row.script_id || row.scriptId,
    metadata: row.metadata || {},
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastError: row.last_error ?? undefined,
    createdAt: (row.created_at || row.createdAt)?.toString(),
    startedAt: row.started_at ? row.started_at.toString() : undefined,
    endedAt: row.ended_at ? row.ended_at.toString() : undefined,
    nextRunAt: (row.next_run_at || row.nextRunAt)?.toString()
  };
}
