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

@Entity('monthly_snapshots')
@Index('idx_monthly_snapshots_user_id', ['userId'])
@Index('uq_monthly_snapshots_user_month', ['userId', 'monthKey'], {
  unique: true,
})
export class MonthlySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** YYYY-MM */
  @Column({ name: 'month_key', type: 'varchar', length: 7 })
  monthKey: string;

  @Column({ name: 'salary_cents', type: 'int', default: 0 })
  salaryCents: number;

  @Column({ name: 'cash_available_cents', type: 'int', default: 0 })
  cashAvailableCents: number;

  @Column({ name: 'total_debt_cents', type: 'int', default: 0 })
  totalDebtCents: number;

  @Column({ name: 'debt_paid_cents', type: 'int', default: 0 })
  debtPaidCents: number;

  @Column({ name: 'expenses_cents', type: 'int', default: 0 })
  expensesCents: number;

  @Column({ name: 'income_cents', type: 'int', default: 0 })
  incomeCents: number;

  @Column({ name: 'savings_cents', type: 'int', default: 0 })
  savingsCents: number;

  @Column({ name: 'remaining_cash_cents', type: 'int', default: 0 })
  remainingCashCents: number;

  @Column({ name: 'health_score', type: 'int', default: 0 })
  healthScore: number;

  @Column({ name: 'health_band', type: 'varchar', length: 32, default: 'FAIR' })
  healthBand: string;

  @Column({ name: 'payload_json', type: 'jsonb', nullable: true })
  payloadJson: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
