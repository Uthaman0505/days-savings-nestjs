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
import { HouseLoan } from '../house-loan/house-loan.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type HouseLoanPaymentType =
  | 'MONTHLY_INSTALLMENT'
  | 'PARTIAL_PAYMENT'
  | 'EXTRA_PAYMENT'
  | 'FULL_SETTLEMENT';

@Entity('house_loan_payments')
@Index('idx_house_loan_payments_user_id', ['userId'])
@Index('idx_house_loan_payments_house_loan_id', ['houseLoanId'])
@Index('idx_house_loan_payments_payment_account_id', ['paymentAccountId'])
@Index('idx_house_loan_payments_payment_type', ['paymentType'])
@Index('idx_house_loan_payments_payment_date', ['paymentDate'])
@Index('idx_house_loan_payments_user_payment_date', ['userId', 'paymentDate'])
@Index('uq_house_loan_payments_transaction_id', ['transactionId'], {
  unique: true,
})
export class HouseLoanPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'house_loan_id', type: 'uuid' })
  houseLoanId: string;

  @ManyToOne(() => HouseLoan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'house_loan_id' })
  houseLoan: HouseLoan;

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
  paymentType: HouseLoanPaymentType;

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
