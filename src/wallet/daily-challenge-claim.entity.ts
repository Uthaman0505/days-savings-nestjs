import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('daily_challenge_claims')
@Index('idx_daily_challenge_claims_user_plan_date', [
  'userSavingPlanId',
  'claimDateKey',
])
@Index(
  'idx_daily_challenge_claims_user_plan_day',
  ['userSavingPlanId', 'claimedDayNumber'],
  { unique: true },
)
export class DailyChallengeClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_saving_plan_id', type: 'uuid' })
  userSavingPlanId: string;

  @Column({ name: 'claim_date_key', type: 'varchar', length: 10 })
  claimDateKey: string; // YYYY-MM-DD in Malaysia time

  @Column({ name: 'claimed_day_number', type: 'int' })
  claimedDayNumber: number;

  @Column({ name: 'credit_amount_cents', type: 'int' })
  creditAmountCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
