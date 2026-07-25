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
  PawnCollateralItemType,
  PawnCollateralStatus,
} from './pawn-loan.enums';
import { PawnLoan } from './pawn-loan.entity';

@Entity('pawn_collaterals')
@Index('idx_pawn_collaterals_pawn_loan_id', ['pawnLoanId'])
@Index('idx_pawn_collaterals_status', ['currentStatus'])
export class PawnCollateral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pawn_loan_id', type: 'uuid' })
  pawnLoanId: string;

  @ManyToOne(() => PawnLoan, (loan) => loan.collaterals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pawn_loan_id' })
  pawnLoan: PawnLoan;

  @Column({ name: 'item_type', type: 'varchar', length: 32 })
  itemType: PawnCollateralItemType;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'owner_name', type: 'varchar', length: 120 })
  ownerName: string;

  @Column({ name: 'estimated_value_cents', type: 'int' })
  estimatedValueCents: number;

  /** Weight in grams (nullable). */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
  })
  weight: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({
    name: 'serial_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  serialNumber: string | null;

  @Column({ name: 'image_urls', type: 'jsonb', nullable: true })
  imageUrls: string[] | null;

  @Column({
    name: 'current_status',
    type: 'varchar',
    length: 32,
    default: 'HELD',
  })
  currentStatus: PawnCollateralStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
