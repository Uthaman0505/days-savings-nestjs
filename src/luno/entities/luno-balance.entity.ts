import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LunoSyncRun } from './luno-sync-run.entity';

@Entity('luno_balances')
@Index('uq_luno_balances_run_account', ['syncRunId', 'lunoAccountId'], {
  unique: true,
})
export class LunoBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sync_run_id', type: 'uuid' })
  syncRunId: string;

  @ManyToOne(() => LunoSyncRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sync_run_id' })
  syncRun: LunoSyncRun;

  @Column({ name: 'luno_account_id', type: 'varchar', length: 64 })
  lunoAccountId: string;

  @Column({ type: 'varchar', length: 16 })
  asset: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, default: '0' })
  balance: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, default: '0' })
  reserved: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, default: '0' })
  unconfirmed: string;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
