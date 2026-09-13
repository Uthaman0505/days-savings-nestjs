import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_btc_lots')
@Index('idx_luno_btc_lots_acquired_at', ['acquiredAt'])
export class LunoBtcLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_transaction_id', type: 'uuid', nullable: true })
  sourceTransactionId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  @Column({ name: 'acquired_at', type: 'timestamptz' })
  acquiredAt: Date;

  @Column({ name: 'origin', type: 'varchar', length: 16 })
  origin: 'BUY' | 'DEPOSIT' | 'TRANSFER_IN';

  @Column({
    name: 'btc_quantity_original',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  btcQuantityOriginal: string;

  @Column({
    name: 'btc_quantity_remaining',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  btcQuantityRemaining: string;

  @Column({
    name: 'myr_cost_original',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  myrCostOriginal: string;

  @Column({
    name: 'myr_cost_remaining',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  myrCostRemaining: string;

  @Column({ name: 'fee_myr', type: 'numeric', precision: 28, scale: 18 })
  feeMyr: string;

  @Column({
    name: 'effective_cost_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  effectiveCostMyr: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
