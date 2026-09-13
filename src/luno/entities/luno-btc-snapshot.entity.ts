import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('luno_btc_accounting_snapshots')
@Index('idx_luno_btc_snapshots_calculated_at', ['calculatedAt'])
export class LunoBtcAccountingSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ type: 'varchar', length: 32 })
  status: 'READY' | 'APPROVED_PARTIAL' | 'PARTIAL' | 'NOT_READY';

  @Column({ name: 'cost_basis_method', type: 'varchar', length: 16 })
  costBasisMethod: 'FIFO';

  @Column({ name: 'btc_quantity', type: 'numeric', precision: 28, scale: 18 })
  btcQuantity: string;

  @Column({
    name: 'btc_market_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  btcMarketPriceMyr: string | null;

  @Column({
    name: 'current_value_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  currentValueMyr: string | null;

  @Column({
    name: 'money_put_in_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  moneyPutInMyr: string;

  @Column({
    name: 'remaining_cost_basis_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  remainingCostBasisMyr: string;

  @Column({
    name: 'average_buy_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  averageBuyPriceMyr: string | null;

  @Column({
    name: 'realised_pnl_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  realisedPnlMyr: string;

  @Column({
    name: 'unrealised_pnl_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  unrealisedPnlMyr: string | null;

  @Column({
    name: 'lifetime_pnl_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  lifetimePnlMyr: string | null;

  @Column({
    name: 'principal_recovered_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  principalRecoveredMyr: string;

  @Column({
    name: 'principal_recovery_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  principalRecoveryPct: string | null;

  @Column({
    name: 'reconciliation_status',
    type: 'varchar',
    length: 32,
  })
  reconciliationStatus: string;

  @Column({
    name: 'reconciliation_difference_btc',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  reconciliationDifferenceBtc: string;

  @Column({ name: 'portfolio_payload', type: 'jsonb' })
  portfolioPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
