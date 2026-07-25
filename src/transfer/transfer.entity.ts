import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

@Entity('transfers')
@Index('idx_transfers_user_id', ['userId'])
@Index('idx_transfers_from_account_id', ['fromAccountId'])
@Index('idx_transfers_to_account_id', ['toAccountId'])
@Index('idx_transfers_transfer_date', ['transferDate'])
@Index('idx_transfers_user_transfer_date', ['userId', 'transferDate'])
@Index('uq_transfers_out_transaction_id', ['outTransactionId'], {
  unique: true,
})
@Index('uq_transfers_in_transaction_id', ['inTransactionId'], { unique: true })
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'from_account_id', type: 'uuid' })
  fromAccountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount: Account;

  @Column({ name: 'to_account_id', type: 'uuid' })
  toAccountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_account_id' })
  toAccount: Account;

  @Column({ name: 'out_transaction_id', type: 'uuid' })
  outTransactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'out_transaction_id' })
  outTransaction: Transaction;

  @Column({ name: 'in_transaction_id', type: 'uuid' })
  inTransactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'in_transaction_id' })
  inTransaction: Transaction;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'transfer_date', type: 'timestamptz' })
  transferDate: Date;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
