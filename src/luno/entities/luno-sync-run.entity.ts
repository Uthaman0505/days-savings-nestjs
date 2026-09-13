import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_sync_runs')
@Index('idx_luno_sync_runs_started_at', ['startedAt'])
export class LunoSyncRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'btc_account_id', type: 'varchar', length: 64, nullable: true })
  btcAccountId: string | null;

  @Column({ name: 'myr_account_id', type: 'varchar', length: 64, nullable: true })
  myrAccountId: string | null;

  @Column({ name: 'accounts_upserted', type: 'int', default: 0 })
  accountsUpserted: number;

  @Column({ name: 'transactions_upserted', type: 'int', default: 0 })
  transactionsUpserted: number;

  @Column({ name: 'orders_upserted', type: 'int', default: 0 })
  ordersUpserted: number;

  @Column({ name: 'withdrawals_upserted', type: 'int', default: 0 })
  withdrawalsUpserted: number;

  @Column({ name: 'transfers_upserted', type: 'int', default: 0 })
  transfersUpserted: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
