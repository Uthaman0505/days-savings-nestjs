import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type LunoBtcMarketInterval = '1h' | '4h' | '1d';
export type LunoBtcMarketDataSource = 'LUNO' | 'SECONDARY_PROVIDER';

@Entity('luno_btc_market_candles')
@Unique('uq_luno_btc_market_candles', [
  'pair',
  'interval',
  'candleTime',
  'source',
])
@Index('idx_luno_btc_market_candles_pair_interval_time', [
  'pair',
  'interval',
  'candleTime',
])
export class LunoBtcMarketCandle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  pair: string;

  @Column({ type: 'varchar', length: 8 })
  interval: LunoBtcMarketInterval;

  @Column({ name: 'candle_time', type: 'timestamptz' })
  candleTime: Date;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  open: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  high: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  low: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  close: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  volume: string;

  @Column({ type: 'varchar', length: 32 })
  source: LunoBtcMarketDataSource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
