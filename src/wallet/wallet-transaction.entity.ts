import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type WalletType = 'GLOBAL' | 'CHALLENGE';
export type WalletTransactionType = 'CREDIT' | 'DEBIT';

@Entity('wallet_transactions')
@Index('idx_wallet_transactions_user', ['userId'])
@Index('idx_wallet_transactions_reference', ['referenceType', 'referenceId'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_type', type: 'varchar', length: 16 })
  walletType: WalletType;

  // Store the wallet row uuid for the given wallet_type.
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'type', type: 'varchar', length: 16 })
  type: WalletTransactionType;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'balance_after_cents', type: 'int' })
  balanceAfterCents: number;

  @Column({ name: 'reference_type', type: 'varchar', length: 64 })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
