import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('completed_challenges')
@Index(
  'idx_completed_challenges_user_total_days_year',
  ['userId', 'totalDays', 'challengeYear'],
  { unique: true },
)
export class CompletedChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'total_days', type: 'int' })
  totalDays: number;

  @Column({ name: 'challenge_year', type: 'int', default: 1970 })
  challengeYear: number;

  @CreateDateColumn({ name: 'completed_at', type: 'timestamptz' })
  completedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
