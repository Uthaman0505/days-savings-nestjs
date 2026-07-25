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

@Entity('expenses')
@Index('idx_expenses_user_id', ['userId'])
@Index('idx_expenses_account_id', ['accountId'])
@Index('idx_expenses_category_id', ['categoryId'])
@Index('idx_expenses_expense_date', ['expenseDate'])
@Index('idx_expenses_merchant_name', ['merchantName'])
@Index('idx_expenses_user_expense_date', ['userId', 'expenseDate'])
@Index('uq_expenses_transaction_id', ['transactionId'], { unique: true })
export class Expense {
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

  @Column({
    name: 'merchant_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  merchantName: string | null;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'expense_date', type: 'timestamptz' })
  expenseDate: Date;

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
