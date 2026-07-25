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
import { Category } from '../category/category.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type IncomeSource =
  | 'SALARY'
  | 'BONUS'
  | 'COMMISSION'
  | 'GRAB'
  | 'FREELANCE'
  | 'INTEREST'
  | 'DIVIDEND'
  | 'RENTAL'
  | 'REFUND'
  | 'OTHER';

@Entity('incomes')
@Index('idx_incomes_user_id', ['userId'])
@Index('idx_incomes_account_id', ['accountId'])
@Index('idx_incomes_category_id', ['categoryId'])
@Index('idx_incomes_received_date', ['receivedDate'])
@Index('idx_incomes_income_source', ['incomeSource'])
@Index('idx_incomes_user_received_date', ['userId', 'receivedDate'])
@Index('uq_incomes_transaction_id', ['transactionId'], { unique: true })
export class Income {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

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

  @Column({ name: 'income_source', type: 'varchar', length: 32 })
  incomeSource: IncomeSource;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'received_date', type: 'timestamptz' })
  receivedDate: Date;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
