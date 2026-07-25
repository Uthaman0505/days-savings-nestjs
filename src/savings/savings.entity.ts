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
import { User } from '../user/user.entity';

export type SavingType =
  | 'GENERAL'
  | 'EMERGENCY'
  | 'VACATION'
  | 'CAR'
  | 'HOUSE'
  | 'EDUCATION'
  | 'RETIREMENT'
  | 'INVESTMENT'
  | 'FIXED_DEPOSIT'
  | 'CUSTOM';

export type SavingsStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

@Entity('savings')
@Index('idx_savings_user_id', ['userId'])
@Index('idx_savings_account_id', ['accountId'])
@Index('idx_savings_saving_type', ['savingType'])
@Index('idx_savings_status', ['status'])
@Index('idx_savings_is_active', ['isActive'])
@Index('idx_savings_start_date', ['startDate'])
@Index('uq_savings_user_name', ['userId', 'name'], { unique: true })
export class Savings {
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

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'saving_type', type: 'varchar', length: 32 })
  savingType: SavingType;

  @Column({ name: 'target_amount_cents', type: 'int', nullable: true })
  targetAmountCents: number | null;

  @Column({ name: 'current_balance_cents', type: 'int', default: 0 })
  currentBalanceCents: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: SavingsStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Reserved for future automatic / recurring deposits (cents). */
  @Column({
    name: 'monthly_deposit_cents',
    type: 'int',
    nullable: true,
  })
  monthlyDepositCents: number | null;

  /** Reserved for future interest / FD earnings. */
  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  interestRate: string | null;

  /** Reserved for future FD / product maturity (distinct from goal target_date). */
  @Column({ name: 'maturity_date', type: 'date', nullable: true })
  maturityDate: string | null;

  /** Reserved for future linked financial goal. */
  @Column({ name: 'linked_goal_id', type: 'uuid', nullable: true })
  linkedGoalId: string | null;

  /** Reserved for future early-withdrawal penalties. */
  @Column({
    name: 'penalty_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  penaltyRate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
