import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('yearly_challenge_resets')
@Index('idx_yearly_challenge_resets_user_created', ['userId', 'createdAt'])
export class YearlyChallengeReset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_saving_plan_id', type: 'uuid' })
  userSavingPlanId: string;

  @Column({ name: 'from_year', type: 'int' })
  fromYear: number;

  @Column({ name: 'to_year', type: 'int' })
  toYear: number;

  @Column({ name: 'transferred_cents', type: 'int', default: 0 })
  transferredCents: number;

  @Column({ name: 'reason', type: 'varchar', length: 64 })
  reason: string;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
