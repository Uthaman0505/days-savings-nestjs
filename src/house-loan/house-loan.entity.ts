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

@Entity('house_loans')
@Index('idx_house_loans_user_id', ['userId'])
@Index('idx_house_loans_is_active', ['isActive'])
@Index(
  'uq_house_loans_user_loan_account_number',
  ['userId', 'loanAccountNumber'],
  {
    unique: true,
  },
)
export class HouseLoan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'loan_name', type: 'varchar', length: 120 })
  loanName: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 120 })
  bankName: string;

  @Column({ name: 'loan_account_number', type: 'varchar', length: 64 })
  loanAccountNumber: string;

  @Column({ name: 'principal_amount_cents', type: 'int' })
  principalAmountCents: number;

  @Column({ name: 'current_balance_cents', type: 'int' })
  currentBalanceCents: number;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
  })
  interestRate: string;

  @Column({ name: 'loan_term_months', type: 'int' })
  loanTermMonths: number;

  @Column({ name: 'monthly_installment_cents', type: 'int' })
  monthlyInstallmentCents: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'maturity_date', type: 'date' })
  maturityDate: string;

  @Column({ name: 'payment_due_day', type: 'int' })
  paymentDueDay: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
