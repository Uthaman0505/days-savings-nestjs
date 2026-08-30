import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { GoldPrice } from './gold-price.entity';
import { GoldPriceScreenshot } from './gold-price-screenshot.entity';

export type GoldPriceCaptureStatus =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'CONFIRMED'
  | 'FAILED';

@Entity('gold_price_captures')
@Index('idx_gold_price_captures_user_created', ['userId', 'createdAt'])
@Index('idx_gold_price_captures_user_status', ['userId', 'status'])
export class GoldPriceCapture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'UPLOADED' })
  status: string;

  @Column({ name: 'pg_buy_price_per_gram_cents', type: 'int', nullable: true })
  pgBuyPricePerGramCents: number | null;

  @Column({ name: 'pg_sell_price_per_gram_cents', type: 'int', nullable: true })
  pgSellPricePerGramCents: number | null;

  @Column({ name: 'captured_price_at', type: 'timestamptz', nullable: true })
  capturedPriceAt: Date | null;

  @Column({ name: 'price_date', type: 'date', nullable: true })
  priceDate: string | null;

  @Column({ name: 'warnings', type: 'jsonb', nullable: true })
  warnings: string[] | null;

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError: string | null;

  @Column({ name: 'confirmed_gold_price_id', type: 'uuid', nullable: true })
  confirmedGoldPriceId: string | null;

  @ManyToOne(() => GoldPrice, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'confirmed_gold_price_id' })
  confirmedGoldPrice: GoldPrice | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => GoldPriceScreenshot, (shot) => shot.capture)
  screenshots: GoldPriceScreenshot[];
}
