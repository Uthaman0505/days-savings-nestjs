import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_transfers')
@Index('uq_luno_transfers_id', ['lunoTransferId'], { unique: true })
@Index('idx_luno_transfers_account', ['lunoAccountId'])
export class LunoTransferRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'luno_transfer_id', type: 'varchar', length: 64 })
  lunoTransferId: string;

  @Column({ name: 'luno_account_id', type: 'varchar', length: 64 })
  lunoAccountId: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  amount: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, nullable: true })
  fee: string | null;

  @Column({ type: 'boolean' })
  inbound: boolean;

  @Column({ name: 'chain_tx_id', type: 'varchar', length: 128, nullable: true })
  chainTxId: string | null;

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
