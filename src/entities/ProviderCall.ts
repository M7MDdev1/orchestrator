import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'provider_calls' })
export class ProviderCall {
  @PrimaryColumn({ name: 'provider_call_id', type: 'uuid' })
  providerCallId!: string;

  @Column({ name: 'call_id', type: 'uuid' })
  callId!: string;
}
