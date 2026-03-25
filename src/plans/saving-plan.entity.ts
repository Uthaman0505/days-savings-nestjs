import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('saving_plans')
@Index('idx_saving_plans_total_days', ['totalDays'])
export class SavingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'total_days', type: 'int' })
  totalDays: number;

  @Column({ name: 'total_amount', type: 'int' })
  totalAmount: number;

  @Column({ name: 'allowed_hours', type: 'int' })
  allowedHours: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
