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

export type InsuranceType =
  | 'MEDICAL'
  | 'LIFE'
  | 'CAR'
  | 'MOTORCYCLE'
  | 'HOUSE'
  | 'TRAVEL'
  | 'PERSONAL_ACCIDENT'
  | 'EDUCATION'
  | 'OTHER';

export type PaymentFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY';

@Entity('insurances')
@Index('idx_insurances_user_id', ['userId'])
@Index('idx_insurances_insurance_type', ['insuranceType'])
@Index('idx_insurances_is_active', ['isActive'])
@Index('idx_insurances_renewal_date', ['renewalDate'])
@Index('idx_insurances_last_payment_date', ['lastPaymentDate'])
@Index('uq_insurances_user_policy_number', ['userId', 'policyNumber'], {
  unique: true,
})
export class Insurance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'policy_name', type: 'varchar', length: 120 })
  policyName: string;

  @Column({ name: 'insurance_company', type: 'varchar', length: 120 })
  insuranceCompany: string;

  @Column({ name: 'policy_number', type: 'varchar', length: 64 })
  policyNumber: string;

  @Column({ name: 'insurance_type', type: 'varchar', length: 32 })
  insuranceType: InsuranceType;

  @Column({ name: 'coverage_amount_cents', type: 'int' })
  coverageAmountCents: number;

  @Column({ name: 'annual_premium_cents', type: 'int' })
  annualPremiumCents: number;

  @Column({ name: 'monthly_premium_cents', type: 'int', nullable: true })
  monthlyPremiumCents: number | null;

  @Column({ name: 'payment_frequency', type: 'varchar', length: 32 })
  paymentFrequency: PaymentFrequency;

  @Column({ name: 'policy_start_date', type: 'date' })
  policyStartDate: string;

  @Column({ name: 'policy_end_date', type: 'date' })
  policyEndDate: string;

  @Column({ name: 'renewal_date', type: 'date' })
  renewalDate: string;

  /** Most recent premium payment date; supports overdue/reminder workflows. */
  @Column({ name: 'last_payment_date', type: 'date', nullable: true })
  lastPaymentDate: string | null;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
