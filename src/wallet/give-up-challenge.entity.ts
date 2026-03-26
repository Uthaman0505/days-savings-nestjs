import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('give_up_challenges')
@Index('idx_give_up_challenges_user_id', ['userId'])
export class GiveUpChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_saving_plan_id', type: 'uuid', unique: true })
  userSavingPlanId: string;

  @Column({ name: 'total_days', type: 'int' })
  totalDays: number;

  @Column({ name: 'transferred_cents', type: 'int' })
  transferredCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
