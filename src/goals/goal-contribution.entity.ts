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
import { Savings } from '../savings/savings.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';
import { Goal } from './goals.entity';

export type GoalContributionMovement = 'CONTRIBUTION' | 'WITHDRAWAL';

export type GoalContributionSource = 'ACCOUNT' | 'SAVINGS';

@Entity('goal_contributions')
@Index('idx_goal_contributions_user_id', ['userId'])
@Index('idx_goal_contributions_goal_id', ['goalId'])
@Index('idx_goal_contributions_savings_id', ['savingsId'])
@Index('idx_goal_contributions_account_id', ['accountId'])
@Index('idx_goal_contributions_movement_type', ['movementType'])
@Index('idx_goal_contributions_source_type', ['sourceType'])
@Index('idx_goal_contributions_movement_date', ['movementDate'])
@Index('uq_goal_contributions_transaction_id', ['transactionId'], {
  unique: true,
})
export class GoalContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'goal_id', type: 'uuid' })
  goalId: string;

  @ManyToOne(() => Goal, (goal) => goal.contributions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goal_id' })
  goal: Goal;

  @Column({ name: 'savings_id', type: 'uuid', nullable: true })
  savingsId: string | null;

  @ManyToOne(() => Savings, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'savings_id' })
  savings: Savings | null;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: Account | null;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'movement_date', type: 'timestamptz' })
  movementDate: Date;

  @Column({ name: 'movement_type', type: 'varchar', length: 32 })
  movementType: GoalContributionMovement;

  /** ACCOUNT or SAVINGS — the pot/account involved in the transfer. */
  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: GoalContributionSource;

  /**
   * Whether the linked ledger row changed spendable account balance.
   * False for Savings ↔ Goal allocation transfers (money already earmarked).
   */
  @Column({ name: 'affects_account_balance', type: 'boolean', default: true })
  affectsAccountBalance: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
