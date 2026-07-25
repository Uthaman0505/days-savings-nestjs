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

export type RecurringTargetModule =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'SAVINGS'
  | 'GOAL'
  | 'CREDIT_CARD_PAYMENT'
  | 'HOUSE_LOAN_PAYMENT'
  | 'INSURANCE_PAYMENT'
  | 'FAMILY_LOAN_PAYMENT';

export type RecurringTransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'PAYMENT'
  | 'TRANSFER'
  | 'SAVINGS_DEPOSIT'
  | 'GOAL_CONTRIBUTION';

export type RecurringFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | 'CUSTOM';

/** Module-specific execution parameters stored as JSONB. */
export type RecurringExecutionPayload = {
  to_account_id?: string;
  income_source?: string;
  payment_method?: string;
  payment_type?: string;
  merchant_name?: string;
  coverage_period_days?: number;
  goal_source_type?: 'ACCOUNT' | 'SAVINGS';
  savings_id?: string;
  reference_number?: string;
  [key: string]: unknown;
};

@Entity('recurring_transactions')
@Index('idx_recurring_transactions_user_id', ['userId'])
@Index('idx_recurring_transactions_account_id', ['accountId'])
@Index('idx_recurring_transactions_target_module', ['targetModule'])
@Index('idx_recurring_transactions_frequency', ['frequency'])
@Index('idx_recurring_transactions_is_active', ['isActive'])
@Index('idx_recurring_transactions_next_execution_date', ['nextExecutionDate'])
@Index('idx_recurring_transactions_auto_execute', ['autoExecute'])
@Index('idx_recurring_due', ['isActive', 'autoExecute', 'nextExecutionDate'])
export class RecurringTransaction {
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

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ name: 'target_module', type: 'varchar', length: 32 })
  targetModule: RecurringTargetModule;

  @Column({ name: 'target_reference_id', type: 'uuid', nullable: true })
  targetReferenceId: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'transaction_type', type: 'varchar', length: 32 })
  transactionType: RecurringTransactionType;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 16 })
  frequency: RecurringFrequency;

  @Column({ name: 'interval_value', type: 'int', default: 1 })
  intervalValue: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'next_execution_date', type: 'timestamptz' })
  nextExecutionDate: Date;

  @Column({ name: 'last_execution_date', type: 'timestamptz', nullable: true })
  lastExecutionDate: Date | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'auto_execute', type: 'boolean', default: true })
  autoExecute: boolean;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retry_count', type: 'int', default: 3 })
  maxRetryCount: number;

  /** Module-specific params (payment_type, to_account_id, income_source, …). */
  @Column({ name: 'execution_payload', type: 'jsonb', nullable: true })
  executionPayload: RecurringExecutionPayload | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /** Reserved for future email / push reminders. */
  @Column({ name: 'reminder_enabled', type: 'boolean', default: false })
  reminderEnabled: boolean;

  /** Reserved for future missed-payment alerts. */
  @Column({ name: 'alert_on_failure', type: 'boolean', default: true })
  alertOnFailure: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
