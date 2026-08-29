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
import { SalaryPlan } from './salary-plan.entity';
import type { SalaryAllocationCategory } from './mission-control.enums';

@Entity('salary_allocations')
@Index('idx_salary_allocations_plan_id', ['salaryPlanId'])
@Index('uq_salary_allocations_plan_category', ['salaryPlanId', 'category'], {
  unique: true,
})
export class SalaryAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'salary_plan_id', type: 'uuid' })
  salaryPlanId: string;

  @ManyToOne(() => SalaryPlan, (plan) => plan.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salary_plan_id' })
  salaryPlan: SalaryPlan;

  @Column({ type: 'varchar', length: 32 })
  category: SalaryAllocationCategory;

  @Column({ name: 'amount_cents', type: 'int', default: 0 })
  amountCents: number;

  /** Percent of salary (0–100), stored for editable rebalancing. */
  @Column({
    name: 'percent_share',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
  })
  percentShare: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
