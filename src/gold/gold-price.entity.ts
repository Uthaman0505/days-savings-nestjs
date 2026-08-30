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
import { User } from '../user/user.entity';

export type GoldPriceSource = 'MANUAL' | 'SCREENSHOT' | 'API';

/**
 * Public Gold price snapshot.
 *
 * PG SELL = Public Gold sells TO the customer (customer acquisition / pay price).
 * PG BUY  = Public Gold buys FROM the customer (liquidation / buyback value).
 *
 * Portfolio valuation MUST use PG BUY.
 */
@Entity('gold_prices')
@Index('idx_gold_prices_user_id', ['userId'])
@Index('idx_gold_prices_user_price_date', ['userId', 'priceDate'])
@Index('idx_gold_prices_user_captured_at', ['userId', 'capturedPriceAt'])
export class GoldPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'price_date', type: 'date' })
  priceDate: string;

  /**
   * Public Gold BUY — PG pays customer when customer sells gold back.
   * Used for portfolio valuation.
   */
  @Column({ name: 'pg_buy_price_per_gram_cents', type: 'int' })
  pgBuyPricePerGramCents: number;

  /**
   * Public Gold SELL — PG sells gold to customer (customer pays to acquire).
   * Display / reference only for holdings valuation.
   */
  @Column({ name: 'pg_sell_price_per_gram_cents', type: 'int' })
  pgSellPricePerGramCents: number;

  @Column({ name: 'source', type: 'varchar', length: 32, default: 'MANUAL' })
  source: GoldPriceSource;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Public Gold "Prices last updated on …" for screenshot-derived rows. */
  @Column({ name: 'captured_price_at', type: 'timestamptz', nullable: true })
  capturedPriceAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
