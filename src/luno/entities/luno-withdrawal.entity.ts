import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_withdrawals')
@Index('uq_luno_withdrawals_id', ['lunoWithdrawalId'], { unique: true })
export class LunoWithdrawalRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'luno_withdrawal_id', type: 'varchar', length: 64 })
  lunoWithdrawalId: string;

  @Column({ type: 'varchar', length: 16 })
  currency: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  amount: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, nullable: true })
  fee: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  type: string | null;

  @Column({ name: 'transfer_id', type: 'varchar', length: 64, nullable: true })
  transferId: string | null;

  @Column({ name: 'created_at_luno', type: 'timestamptz' })
  createdAtLuno: Date;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
