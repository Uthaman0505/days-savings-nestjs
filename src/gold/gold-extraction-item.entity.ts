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
import { GoldDocument } from './gold-document.entity';
import { GoldPurchase } from './gold-purchase.entity';

export type GoldExtractionItemStatus =
  | 'DETECTED'
  | 'NEEDS_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED';

@Entity('gold_extraction_items')
@Index('idx_gold_extraction_items_user_status', ['userId', 'status'])
@Index(
  'uq_gold_extraction_items_document_row',
  ['goldDocumentId', 'rowIndex'],
  {
    unique: true,
  },
)
export class GoldExtractionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'gold_document_id', type: 'uuid' })
  goldDocumentId: string;

  @ManyToOne(() => GoldDocument, (doc) => doc.extractionItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'gold_document_id' })
  goldDocument: GoldDocument;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'row_index', type: 'int' })
  rowIndex: number;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status: GoldExtractionItemStatus;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column({
    name: 'weight_grams',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  weightGrams: string | null;

  @Column({ name: 'amount_paid_cents', type: 'int', nullable: true })
  amountPaidCents: number | null;

  @Column({ name: 'price_per_gram_cents', type: 'int', nullable: true })
  pricePerGramCents: number | null;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({
    name: 'confidence',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence: string | null;

  @Column({ name: 'raw_fields', type: 'jsonb', nullable: true })
  rawFields: Record<string, unknown> | null;

  @Column({ name: 'validation_warnings', type: 'jsonb', nullable: true })
  validationWarnings: string[] | null;

  @Column({ name: 'gold_purchase_id', type: 'uuid', nullable: true })
  goldPurchaseId: string | null;

  @ManyToOne(() => GoldPurchase, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'gold_purchase_id' })
  goldPurchase: GoldPurchase | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
