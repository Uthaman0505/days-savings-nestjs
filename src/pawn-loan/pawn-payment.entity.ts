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
import type {
  PawnPaymentMethod,
  PawnPaymentType,
} from './pawn-loan.enums';
import { PawnLoan } from './pawn-loan.entity';

@Entity('pawn_payments')
@Index('idx_pawn_payments_pawn_loan_id', ['pawnLoanId'])
@Index('idx_pawn_payments_payment_date', ['paymentDate'])
@Index('idx_pawn_payments_payment_type', ['paymentType'])
export class PawnPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pawn_loan_id', type: 'uuid' })
  pawnLoanId: string;

  @ManyToOne(() => PawnLoan, (loan) => loan.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pawn_loan_id' })
  pawnLoan: PawnLoan;

  @Column({ name: 'payment_type', type: 'varchar', length: 32 })
  paymentType: PawnPaymentType;

  @Column({ name: 'payment_date', type: 'timestamptz' })
  paymentDate: Date;

  @Column({ name: 'principal_paid_cents', type: 'int', default: 0 })
  principalPaidCents: number;

  @Column({ name: 'interest_paid_cents', type: 'int', default: 0 })
  interestPaidCents: number;

  @Column({ name: 'total_paid_cents', type: 'int' })
  totalPaidCents: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 32 })
  paymentMethod: PawnPaymentMethod;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
