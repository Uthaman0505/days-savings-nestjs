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
import type {
  FinancialMissionKind,
  FinancialMissionStatus,
} from './mission-control.enums';

@Entity('financial_missions')
@Index('idx_financial_missions_user_id', ['userId'])
@Index('idx_financial_missions_status', ['userId', 'status'])
export class FinancialMission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'mission_kind', type: 'varchar', length: 32 })
  missionKind: FinancialMissionKind;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: FinancialMissionStatus;

  @Column({ name: 'debt_priority_id', type: 'uuid', nullable: true })
  debtPriorityId: string | null;

  @Column({ name: 'goal_id', type: 'uuid', nullable: true })
  goalId: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'progress_percent', type: 'int', default: 0 })
  progressPercent: number;

  @Column({ name: 'target_amount_cents', type: 'int', default: 0 })
  targetAmountCents: number;

  @Column({ name: 'current_amount_cents', type: 'int', default: 0 })
  currentAmountCents: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
