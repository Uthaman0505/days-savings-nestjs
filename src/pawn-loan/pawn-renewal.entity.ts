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
import { PawnLoan } from './pawn-loan.entity';

@Entity('pawn_renewals')
@Index('idx_pawn_renewals_pawn_loan_id', ['pawnLoanId'])
@Index('idx_pawn_renewals_renewal_date', ['renewalDate'])
export class PawnRenewal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pawn_loan_id', type: 'uuid' })
  pawnLoanId: string;

  @ManyToOne(() => PawnLoan, (loan) => loan.renewals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pawn_loan_id' })
  pawnLoan: PawnLoan;

  @Column({ name: 'renewal_date', type: 'timestamptz' })
  renewalDate: Date;

  @Column({ name: 'previous_maturity_date', type: 'date' })
  previousMaturityDate: string;

  @Column({ name: 'new_maturity_date', type: 'date' })
  newMaturityDate: string;

  @Column({ name: 'interest_paid_cents', type: 'int', default: 0 })
  interestPaidCents: number;

  @Column({ name: 'principal_reduction_cents', type: 'int', default: 0 })
  principalReductionCents: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
