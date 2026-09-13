import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('luno_btc_disposals')
@Index('idx_luno_btc_disposals_disposed_at', ['disposedAt'])
export class LunoBtcDisposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_transaction_id', type: 'uuid', nullable: true })
  sourceTransactionId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  @Column({ name: 'disposed_at', type: 'timestamptz' })
  disposedAt: Date;

  @Column({ type: 'varchar', length: 16 })
  kind: 'SELL' | 'WITHDRAWAL' | 'TRANSFER_OUT';

  @Column({ name: 'btc_quantity', type: 'numeric', precision: 28, scale: 18 })
  btcQuantity: string;

  @Column({
    name: 'gross_proceeds_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  grossProceedsMyr: string;

  @Column({ name: 'fee_myr', type: 'numeric', precision: 28, scale: 18 })
  feeMyr: string;

  @Column({
    name: 'net_proceeds_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  netProceedsMyr: string;

  @Column({
    name: 'cost_basis_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  costBasisMyr: string;

  @Column({
    name: 'realised_pnl_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  realisedPnlMyr: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
