import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('grab_profit_entries')
@Index('idx_grab_profit_entries_user', ['userId'])
@Index('idx_grab_profit_entries_work_date', ['workDate'])
@Index('uq_grab_profit_entries_user_work_date', ['userId', 'workDate'], {
  unique: true,
})
export class GrabProfitEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ name: 'daily_km', type: 'float' })
  dailyKm: number;

  @Column({ name: 'earning_cents', type: 'int' })
  earningCents: number;

  @Column({ name: 'fuel_cost_cents', type: 'int' })
  fuelCostCents: number;

  @Column({ name: 'maintenance_per_km_cents', type: 'int', default: 12 })
  maintenancePerKmCents: number;

  @Column({ name: 'maintenance_cost_cents', type: 'int' })
  maintenanceCostCents: number;

  @Column({ name: 'total_cost_cents', type: 'int' })
  totalCostCents: number;

  @Column({ name: 'net_profit_cents', type: 'int' })
  netProfitCents: number;

  @Column({ name: 'monthly_profit_cents', type: 'int' })
  monthlyProfitCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
