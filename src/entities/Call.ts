import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";


export type CallStatus = 'PENDING'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'EXPIRED';

@Entity({ name: 'calls' })
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'to_phone', type: 'text' })
  to!: string;

  @Column({ name: 'script_id', type: 'text' })
  scriptId!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: CallStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt?: Date;

  // for backoff scheduling
  @Column({ name: 'next_run_at', type: 'timestamptz', default: () => 'NOW()' })
  nextRunAt!: Date;
}
