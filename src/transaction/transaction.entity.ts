import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { Category } from '../category/category.entity';
import { User } from '../user/user.entity';

export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'LOAN_PAYMENT'
  | 'LOAN_RECEIVED'
  | 'LOAN_GIVEN'
  | 'FAMILY_LOAN_PAYMENT'
  | 'FAMILY_LOAN_COLLECTION'
  | 'INSURANCE_PAYMENT'
  | 'SAVING_DEPOSIT'
  | 'SAVING_WITHDRAW'
  | 'GOAL_CONTRIBUTION'
  | 'GOAL_WITHDRAW'
  | 'CREDIT_CARD_PAYMENT'
  | 'ADJUSTMENT';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

@Entity('transactions')
@Index('idx_transactions_user_id', ['userId'])
@Index('idx_transactions_account_id', ['accountId'])
@Index('idx_transactions_category_id', ['categoryId'])
@Index('idx_transactions_type', ['transactionType'])
@Index('idx_transactions_status', ['status'])
@Index('idx_transactions_date', ['transactionDate'])
@Index('idx_transactions_user_date', ['userId', 'transactionDate'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'transaction_type', type: 'varchar', length: 32 })
  transactionType: TransactionType;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  transactionDate: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 32, default: 'COMPLETED' })
  status: TransactionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
