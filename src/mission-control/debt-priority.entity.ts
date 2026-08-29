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
  DebtPriorityMethod,
  DebtPriorityStatus,
  DebtSourceType,
} from './mission-control.enums';

@Entity('debt_priorities')
@Index('idx_debt_priorities_user_id', ['userId'])
@Index('idx_debt_priorities_status', ['userId', 'status'])
@Index(
  'uq_debt_priorities_user_source',
  ['userId', 'sourceType', 'sourceId'],
  { unique: true },
)
export class DebtPriority {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: DebtSourceType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'debt_name', type: 'varchar', length: 120 })
  debtName: string;

  @Column({ name: 'outstanding_cents', type: 'int', default: 0 })
  outstandingCents: number;

  @Column({ name: 'original_amount_cents', type: 'int', default: 0 })
  originalAmountCents: number;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
  })
  interestRate: string;

  @Column({ name: 'minimum_payment_cents', type: 'int', default: 0 })
  minimumPaymentCents: number;

  @Column({ name: 'current_payment_cents', type: 'int', default: 0 })
  currentPaymentCents: number;

  @Column({ name: 'priority_rank', type: 'int', default: 1 })
  priorityRank: number;

  @Column({ type: 'varchar', length: 32, default: 'QUEUED' })
  status: DebtPriorityStatus;

  @Column({ name: 'priority_method', type: 'varchar', length: 32 })
  priorityMethod: DebtPriorityMethod;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
