import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { PawnTransactionType } from './pawn-loan.enums';
import { PawnLoan } from './pawn-loan.entity';

@Entity('pawn_transactions')
@Index('idx_pawn_transactions_pawn_loan_id', ['pawnLoanId'])
@Index('idx_pawn_transactions_type', ['transactionType'])
@Index('idx_pawn_transactions_date', ['transactionDate'])
export class PawnTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pawn_loan_id', type: 'uuid' })
  pawnLoanId: string;

  @ManyToOne(() => PawnLoan, (loan) => loan.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pawn_loan_id' })
  pawnLoan: PawnLoan;

  @Column({ name: 'transaction_type', type: 'varchar', length: 32 })
  transactionType: PawnTransactionType;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  transactionDate: Date;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
