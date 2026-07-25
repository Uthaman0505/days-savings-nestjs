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
import { FamilyLoan } from '../family-loan/family-loan.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type FamilyLoanPaymentDirection =
  | 'PAY_TO_LENDER'
  | 'RECEIVE_FROM_BORROWER';

@Entity('family_loan_payments')
@Index('idx_family_loan_payments_user_id', ['userId'])
@Index('idx_family_loan_payments_family_loan_id', ['familyLoanId'])
@Index('idx_family_loan_payments_payment_account_id', ['paymentAccountId'])
@Index('idx_family_loan_payments_payment_direction', ['paymentDirection'])
@Index('idx_family_loan_payments_payment_date', ['paymentDate'])
@Index('idx_family_loan_payments_user_payment_date', ['userId', 'paymentDate'])
@Index('uq_family_loan_payments_transaction_id', ['transactionId'], {
  unique: true,
})
export class FamilyLoanPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'family_loan_id', type: 'uuid' })
  familyLoanId: string;

  @ManyToOne(() => FamilyLoan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'family_loan_id' })
  familyLoan: FamilyLoan;

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

  @Column({ name: 'payment_direction', type: 'varchar', length: 32 })
  paymentDirection: FamilyLoanPaymentDirection;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Reserved for future installment schedule linkage. */
  @Column({
    name: 'installment_number',
    type: 'int',
    nullable: true,
  })
  installmentNumber: number | null;

  /** Reserved for future payment attachment storage (e.g. S3 key). */
  @Column({
    name: 'attachment_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  attachmentKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
