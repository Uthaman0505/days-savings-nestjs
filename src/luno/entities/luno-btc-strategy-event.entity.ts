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
import { User } from '../../user/user.entity';

export type LunoBtcStrategyAction =
  | 'HOLD'
  | 'WAIT'
  | 'BUY_SMALL'
  | 'BUY_MORE'
  | 'STOP_BUYING_THIS_MONTH'
  | 'BLOCKED';

export type LunoBtcStrategyZone =
  | 'ABOVE_AVERAGE'
  | 'SMALL_DISCOUNT'
  | 'FIRST_BUY_ZONE'
  | 'STRONGER_BUY_ZONE'
  | 'DEEPER_DIP'
  | 'MONTHLY_LIMIT'
  | 'BLOCKED';

export type LunoBtcStrategyEventStatus =
  | 'OPEN'
  | 'ACTED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type LunoBtcStrategySource = 'NORMAL_BUY' | 'DIP_BUY';

@Entity('luno_btc_strategy_events')
@Index('idx_luno_btc_strategy_events_user_month', ['userId', 'budgetMonth'])
@Index('idx_luno_btc_strategy_events_user_status', ['userId', 'status'])
export class LunoBtcStrategyEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'budget_month', type: 'date' })
  budgetMonth: string;

  @Column({ type: 'varchar', length: 32 })
  action: LunoBtcStrategyAction;

  @Column({ type: 'varchar', length: 32 })
  zone: LunoBtcStrategyZone;

  @Column({ type: 'varchar', length: 16, nullable: true })
  source: LunoBtcStrategySource | null;

  @Column({
    name: 'suggested_amount_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  suggestedAmountMyr: string | null;

  @Column({
    name: 'current_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  currentPriceMyr: string | null;

  @Column({
    name: 'average_buy_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  averageBuyPriceMyr: string | null;

  @Column({
    name: 'price_difference_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  priceDifferencePct: string | null;

  @Column({
    name: 'monthly_remaining_before_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  monthlyRemainingBeforeMyr: string | null;

  @Column({
    name: 'expected_remaining_after_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  expectedRemainingAfterMyr: string | null;

  @Column({
    name: 'luno_myr_available_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  lunoMyrAvailableMyr: string | null;

  @Column({
    name: 'top_up_needed_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  topUpNeededMyr: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: LunoBtcStrategyEventStatus;

  @Column({ name: 'reason_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  reasonJson: string[];

  @Column({ name: 'triggered_at', type: 'timestamptz' })
  triggeredAt: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'acted_at', type: 'timestamptz', nullable: true })
  actedAt: Date | null;

  @Column({
    name: 'matched_transaction_ref',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  matchedTransactionRef: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
