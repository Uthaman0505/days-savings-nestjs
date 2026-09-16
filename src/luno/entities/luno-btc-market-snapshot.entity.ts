import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { LunoBtcMarketDataSource } from './luno-btc-market-candle.entity';

export type LunoBtcMarketDirection = 'RISING' | 'FALLING' | 'UNCLEAR';
export type LunoBtcBuyingCondition = 'GOOD' | 'NORMAL' | 'EXPENSIVE' | 'RISKY';
export type LunoBtcMarketStability = 'STABLE' | 'NORMAL' | 'UNSTABLE';
export type LunoBtcMarketConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type LunoBtcMarketContextStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';

@Entity('luno_btc_market_snapshots')
@Index('idx_luno_btc_market_snapshots_calculated', ['pair', 'calculatedAt'])
export class LunoBtcMarketSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ type: 'varchar', length: 16 })
  pair: string;

  @Column({
    name: 'current_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  currentPriceMyr: string | null;

  @Column({ type: 'varchar', length: 16 })
  direction: LunoBtcMarketDirection;

  @Column({ name: 'buying_condition', type: 'varchar', length: 16 })
  buyingCondition: LunoBtcBuyingCondition;

  @Column({ type: 'varchar', length: 16 })
  stability: LunoBtcMarketStability;

  @Column({ type: 'varchar', length: 16 })
  confidence: LunoBtcMarketConfidence;

  @Column({
    name: 'short_trend_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  shortTrendPct: string | null;

  @Column({
    name: 'medium_trend_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  mediumTrendPct: string | null;

  @Column({
    name: 'drawdown_from_recent_high_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  drawdownFromRecentHighPct: string | null;

  @Column({
    name: 'volatility_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  volatilityPct: string | null;

  @Column({
    name: 'momentum_value',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  momentumValue: string | null;

  @Column({
    name: 'sma20_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  sma20Myr: string | null;

  @Column({
    name: 'sma50_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  sma50Myr: string | null;

  @Column({
    name: 'recent_high_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  recentHighMyr: string | null;

  @Column({
    name: 'recent_low_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  recentLowMyr: string | null;

  @Column({
    name: 'market_score',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  marketScore: string | null;

  @Column({ name: 'reason_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  reasonJson: string[];

  @Column({ type: 'varchar', length: 32 })
  source: LunoBtcMarketDataSource;

  @Column({ name: 'latest_candle_at', type: 'timestamptz', nullable: true })
  latestCandleAt: Date | null;

  @Column({
    name: 'market_data_age_minutes',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  marketDataAgeMinutes: string | null;

  @Column({ name: 'market_context_status', type: 'varchar', length: 16 })
  marketContextStatus: LunoBtcMarketContextStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
