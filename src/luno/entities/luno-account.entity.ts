import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_accounts')
@Index('uq_luno_accounts_account_id', ['lunoAccountId'], { unique: true })
export class LunoAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'luno_account_id', type: 'varchar', length: 64 })
  lunoAccountId: string;

  @Column({ type: 'varchar', length: 16 })
  asset: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ name: 'account_type', type: 'varchar', length: 64, nullable: true })
  accountType: string | null;

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

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
