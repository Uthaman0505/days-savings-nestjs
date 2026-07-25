import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import type { PawnInterestType, PawnLoanStatus } from './pawn-loan.enums';
import { PawnCollateral } from './pawn-collateral.entity';
import { PawnPayment } from './pawn-payment.entity';
import { PawnRenewal } from './pawn-renewal.entity';
import { PawnTransaction } from './pawn-transaction.entity';

@Entity('pawn_loans')
@Index('idx_pawn_loans_user_id', ['userId'])
@Index('idx_pawn_loans_status', ['status'])
@Index('idx_pawn_loans_maturity_date', ['maturityDate'])
@Index('uq_pawn_loans_user_receipt', ['userId', 'receiptNumber'], {
  unique: true,
})
export class PawnLoan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'pawn_shop_name', type: 'varchar', length: 120 })
  pawnShopName: string;

  @Column({ name: 'receipt_number', type: 'varchar', length: 64 })
  receiptNumber: string;

  @Column({ name: 'principal_amount_cents', type: 'int' })
  principalAmountCents: number;

  @Column({ name: 'outstanding_principal_cents', type: 'int' })
  outstandingPrincipalCents: number;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
  })
  interestRate: string;

  @Column({
    name: 'interest_type',
    type: 'varchar',
    length: 32,
    default: 'FLAT',
  })
  interestType: PawnInterestType;

  /** Loan term used for maturity / renewal cycles (months). */
  @Column({ name: 'loan_term_months', type: 'int', default: 6 })
  loanTermMonths: number;

  /** Grace days after maturity before forfeiture eligibility. */
  @Column({ name: 'grace_period_days', type: 'int', default: 14 })
  gracePeriodDays: number;

  @Column({ name: 'loan_start_date', type: 'date' })
  loanStartDate: string;

  @Column({ name: 'maturity_date', type: 'date' })
  maturityDate: string;

  @Column({ name: 'grace_period_end_date', type: 'date' })
  gracePeriodEndDate: string;

  @Column({ type: 'varchar', length: 32, default: 'CREATED' })
  status: PawnLoanStatus;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => PawnCollateral, (c) => c.pawnLoan)
  collaterals: PawnCollateral[];

  @OneToMany(() => PawnPayment, (p) => p.pawnLoan)
  payments: PawnPayment[];

  @OneToMany(() => PawnRenewal, (r) => r.pawnLoan)
  renewals: PawnRenewal[];

  @OneToMany(() => PawnTransaction, (t) => t.pawnLoan)
  transactions: PawnTransaction[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
