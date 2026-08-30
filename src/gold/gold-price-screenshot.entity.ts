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
import { GoldPriceCapture } from './gold-price-capture.entity';

export type GoldPriceScreenshotSide = 'BUY' | 'SELL';

export type GoldPriceScreenshotScreenType = 'BUY_GAP' | 'SELL_GAP' | 'UNKNOWN';

@Entity('gold_price_screenshots')
@Index('idx_gold_price_screenshots_capture', ['captureId'])
@Index('uq_gold_price_screenshots_user_sha256', ['userId', 'sha256Hash'], {
  unique: true,
})
@Index('uq_gold_price_screenshots_capture_side', ['captureId', 'side'], {
  unique: true,
})
export class GoldPriceScreenshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'capture_id', type: 'uuid' })
  captureId: string;

  @ManyToOne(() => GoldPriceCapture, (capture) => capture.screenshots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'capture_id' })
  capture: GoldPriceCapture;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** BUY = Buy GAP screenshot (maps to PG SELL). SELL = Sell GAP (maps to PG BUY). */
  @Column({ name: 'side', type: 'varchar', length: 8 })
  side: GoldPriceScreenshotSide;

  @Column({ name: 'screen_type', type: 'varchar', length: 16, nullable: true })
  screenType: string | null;

  @Column({ name: 'original_file_name', type: 'varchar', length: 255 })
  originalFileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 127 })
  mimeType: string;

  @Column({ name: 'file_size_bytes', type: 'int' })
  fileSizeBytes: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  @Column({ name: 'sha256_hash', type: 'char', length: 64 })
  sha256Hash: string;

  @Column({
    name: 'extracted_pg_price_per_gram_cents',
    type: 'int',
    nullable: true,
  })
  extractedPgPricePerGramCents: number | null;

  @Column({ name: 'extracted_updated_at', type: 'timestamptz', nullable: true })
  extractedUpdatedAt: Date | null;

  @Column({
    name: 'extraction_status',
    type: 'varchar',
    length: 32,
    default: 'UPLOADED',
  })
  extractionStatus: string;

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError: string | null;

  @Column({ name: 'warnings', type: 'jsonb', nullable: true })
  warnings: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
