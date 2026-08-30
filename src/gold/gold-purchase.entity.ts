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

export type GoldPurchaseSource = 'MANUAL' | 'IMPORT' | 'OCR';

@Entity('gold_purchases')
@Index('idx_gold_purchases_user_id', ['userId'])
@Index('idx_gold_purchases_user_purchase_date', ['userId', 'purchaseDate'])
@Index('idx_gold_purchases_user_active', ['userId', 'isActive'])
export class GoldPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Calendar purchase day (YYYY-MM-DD). */
  @Column({ name: 'purchase_date', type: 'date' })
  purchaseDate: string;

  /** Weight in grams (numeric(12,4) as string). */
  @Column({
    name: 'weight_grams',
    type: 'numeric',
    precision: 12,
    scale: 4,
  })
  weightGrams: string;

  @Column({ name: 'amount_paid_cents', type: 'int' })
  amountPaidCents: number;

  @Column({ name: 'price_per_gram_cents', type: 'int' })
  pricePerGramCents: number;

  @Column({ name: 'source', type: 'varchar', length: 32, default: 'MANUAL' })
  source: GoldPurchaseSource;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
