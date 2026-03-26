import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('daily_transaction_leverages')
@Index(
  'idx_daily_transaction_leverages_min_completed',
  ['minCompletedChallenges'],
  {
    unique: true,
  },
)
export class DailyTransactionLeverage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'min_completed_challenges', type: 'int' })
  minCompletedChallenges: number;

  @Column({ name: 'allowed_transactions_per_day', type: 'int' })
  allowedTransactionsPerDay: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
