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
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type FamilyLoanType = 'BORROWED' | 'LENT';

export type FamilyLoanStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'DEFAULTED'
  | 'CANCELLED';

@Entity('family_loans')
@Index('idx_family_loans_user_id', ['userId'])
@Index('idx_family_loans_loan_type', ['loanType'])
@Index('idx_family_loans_status', ['status'])
@Index('idx_family_loans_relationship', ['relationship'])
@Index('idx_family_loans_is_active', ['isActive'])
@Index('idx_family_loans_loan_start_date', ['loanStartDate'])
@Index('uq_family_loans_transaction_id', ['transactionId'], { unique: true })
export class FamilyLoan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'loan_type', type: 'varchar', length: 32 })
  loanType: FamilyLoanType;

  @Column({ name: 'person_name', type: 'varchar', length: 120 })
  personName: string;

  @Column({ type: 'varchar', length: 64 })
  relationship: string;

  @Column({
    name: 'contact_number',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  contactNumber: string | null;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @Column({ name: 'principal_amount_cents', type: 'int' })
  principalAmountCents: number;

  @Column({ name: 'outstanding_balance_cents', type: 'int' })
  outstandingBalanceCents: number;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
  })
  interestRate: string;

  @Column({ name: 'loan_start_date', type: 'date' })
  loanStartDate: string;

  @Column({ name: 'expected_end_date', type: 'date', nullable: true })
  expectedEndDate: string | null;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Reserved for future agreement document storage (e.g. S3 key). */
  @Column({
    name: 'agreement_document_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  agreementDocumentKey: string | null;

  /** Reserved for future guarantor support. */
  @Column({
    name: 'guarantor_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  guarantorName: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: FamilyLoanStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
