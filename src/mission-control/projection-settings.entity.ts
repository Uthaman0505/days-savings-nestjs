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
import type { DebtPriorityMethod } from './mission-control.enums';

@Entity('projection_settings')
@Index('uq_projection_settings_user', ['userId'], { unique: true })
export class ProjectionSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'monthly_extra_payment_cents', type: 'int', default: 0 })
  monthlyExtraPaymentCents: number;

  @Column({
    name: 'priority_method',
    type: 'varchar',
    length: 32,
    default: 'AVALANCHE',
  })
  priorityMethod: DebtPriorityMethod;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
