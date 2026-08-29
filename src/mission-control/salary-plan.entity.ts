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
import { SalaryAllocation } from './salary-allocation.entity';

@Entity('salary_plans')
@Index('idx_salary_plans_user_id', ['userId'])
@Index('idx_salary_plans_month_key', ['userId', 'monthKey'], { unique: true })
export class SalaryPlan {
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

  @Column({ name: 'salary_amount_cents', type: 'int' })
  salaryAmountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => SalaryAllocation, (row) => row.salaryPlan, {
    cascade: true,
  })
  allocations: SalaryAllocation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
