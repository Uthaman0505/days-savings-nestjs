import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { Insurance } from '../insurance/insurance.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type InsurancePaymentType =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'SPECIAL_PAYMENT';

@Entity('insurance_payments')
@Index('idx_insurance_payments_user_id', ['userId'])
@Index('idx_insurance_payments_insurance_id', ['insuranceId'])
@Index('idx_insurance_payments_payment_account_id', ['paymentAccountId'])
@Index('idx_insurance_payments_payment_type', ['paymentType'])
@Index('idx_insurance_payments_payment_date', ['paymentDate'])
@Index('idx_insurance_payments_coverage_period_end', ['coveragePeriodEnd'])
@Index('idx_insurance_payments_user_payment_date', ['userId', 'paymentDate'])
@Index('uq_insurance_payments_transaction_id', ['transactionId'], {
  unique: true,
})
export class InsurancePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'insurance_id', type: 'uuid' })
  insuranceId: string;

  @ManyToOne(() => Insurance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insurance_id' })
  insurance: Insurance;

  @Column({ name: 'payment_account_id', type: 'uuid' })
  paymentAccountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_account_id' })
  paymentAccount: Account;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'payment_date', type: 'timestamptz' })
  paymentDate: Date;

  @Column({ name: 'payment_type', type: 'varchar', length: 32 })
  paymentType: InsurancePaymentType;

  @Column({ name: 'coverage_period_start', type: 'date' })
  coveragePeriodStart: string;

  @Column({ name: 'coverage_period_end', type: 'date' })
  coveragePeriodEnd: string;

  /**
   * Snapshot of policy renewal_date before this payment was applied.
   * Used to restore metadata on delete/update without breaking history.
   */
  @Column({ name: 'previous_renewal_date', type: 'date', nullable: true })
  previousRenewalDate: string | null;

  /**
   * Snapshot of policy last_payment_date before this payment was applied.
   */
  @Column({
    name: 'previous_last_payment_date',
    type: 'date',
    nullable: true,
  })
  previousLastPaymentDate: string | null;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
