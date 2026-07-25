import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { GoalContribution } from './goal-contribution.entity';

export type GoalType =
  | 'EMERGENCY'
  | 'TRAVEL'
  | 'HOUSE'
  | 'CAR'
  | 'EDUCATION'
  | 'RETIREMENT'
  | 'BUSINESS'
  | 'GADGET'
  | 'CUSTOM';

export type GoalPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

@Entity('goals')
@Index('idx_goals_user_id', ['userId'])
@Index('idx_goals_goal_type', ['goalType'])
@Index('idx_goals_priority', ['priority'])
@Index('idx_goals_status', ['status'])
@Index('idx_goals_is_active', ['isActive'])
@Index('idx_goals_target_date', ['targetDate'])
@Index('uq_goals_user_name', ['userId', 'name'], { unique: true })
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'goal_type', type: 'varchar', length: 32 })
  goalType: GoalType;

  @Column({ name: 'target_amount_cents', type: 'int' })
  targetAmountCents: number;

  @Column({ name: 'current_amount_cents', type: 'int', default: 0 })
  currentAmountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 16, default: 'MEDIUM' })
  priority: GoalPriority;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'target_date', type: 'date' })
  targetDate: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: GoalStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Reserved for future automatic monthly contribution amount. */
  @Column({
    name: 'monthly_contribution_cents',
    type: 'int',
    nullable: true,
  })
  monthlyContributionCents: number | null;

  /** Reserved for future family / shared goals. */
  @Column({ name: 'is_shared', type: 'boolean', default: false })
  isShared: boolean;

  /** Reserved for future reminder scheduling. */
  @Column({
    name: 'reminder_enabled',
    type: 'boolean',
    default: false,
  })
  reminderEnabled: boolean;

  @OneToMany(() => GoalContribution, (contribution) => contribution.goal)
  contributions: GoalContribution[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
