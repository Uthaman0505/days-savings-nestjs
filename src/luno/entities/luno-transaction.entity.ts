import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Uniqueness: Luno numbers statement rows per account from 1 (oldest).
 * (luno_account_id, row_index) is the stable identity. `reference` can repeat
 * (e.g. withdrawal + withdrawal fee share a reference).
 */
@Entity('luno_transactions')
@Index('uq_luno_transactions_account_row', ['lunoAccountId', 'rowIndex'], {
  unique: true,
})
@Index('idx_luno_transactions_account_ts', ['lunoAccountId', 'occurredAt'])
export class LunoTransactionRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'luno_account_id', type: 'varchar', length: 64 })
  lunoAccountId: string;

  @Column({ name: 'row_index', type: 'bigint' })
  rowIndex: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 16 })
  currency: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  kind: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 28, scale: 18, default: '0' })
  balance: string;

  @Column({ name: 'balance_delta', type: 'numeric', precision: 28, scale: 18 })
  balanceDelta: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, default: '0' })
  available: string;

  @Column({
    name: 'available_delta',
    type: 'numeric',
    precision: 28,
    scale: 18,
    default: '0',
  })
  availableDelta: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
