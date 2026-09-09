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
import { User } from '../user/user.entity';

export type GoldProfitGoalStatusValue = 'ACTIVE' | 'ACHIEVED' | 'CANCELLED';

@Entity('gold_profit_goals')
@Index('idx_gold_profit_goals_user_id', ['userId'])
@Index('idx_gold_profit_goals_user_status', ['userId', 'status'])
@Index('uq_gold_profit_goals_one_active', ['userId'], {
  unique: true,
  where: "is_active = TRUE AND status = 'ACTIVE'",
})
export class GoldProfitGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'target_profit_cents', type: 'int' })
  targetProfitCents: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: GoldProfitGoalStatusValue;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'achieved_at', type: 'timestamptz', nullable: true })
  achievedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
