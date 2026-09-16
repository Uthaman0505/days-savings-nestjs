import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';

@Entity('luno_btc_monthly_budgets')
@Unique('uq_luno_btc_monthly_budgets_user_month', ['userId', 'budgetMonth'])
@Index('idx_luno_btc_monthly_budgets_user_id', ['userId'])
@Index('idx_luno_btc_monthly_budgets_user_month', ['userId', 'budgetMonth'])
export class LunoBtcMonthlyBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** First calendar day of the month (DATE, Asia/Kuala_Lumpur month). */
  @Column({ name: 'budget_month', type: 'date' })
  budgetMonth: string;

  @Column({
    name: 'monthly_budget_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  monthlyBudgetMyr: string;

  @Column({
    name: 'normal_buy_allocation_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  normalBuyAllocationMyr: string | null;

  @Column({
    name: 'dip_reserve_allocation_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  dipReserveAllocationMyr: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
