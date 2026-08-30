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
import { GoldExtractionItem } from './gold-extraction-item.entity';

export type GoldDocumentExtractionStatus =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'FAILED';

@Entity('gold_documents')
@Index('idx_gold_documents_user_created_at', ['userId', 'createdAt'])
@Index('idx_gold_documents_user_extraction_status', [
  'userId',
  'extractionStatus',
])
@Index('uq_gold_documents_user_sha256', ['userId', 'sha256Hash'], {
  unique: true,
})
export class GoldDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

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
    name: 'extraction_status',
    type: 'varchar',
    length: 32,
    default: 'UPLOADED',
  })
  extractionStatus: string;

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError: string | null;

  @Column({ name: 'raw_extract', type: 'jsonb', nullable: true })
  rawExtract: Record<string, unknown> | null;

  @Column({ name: 'page_count', type: 'int', nullable: true })
  pageCount: number | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => GoldExtractionItem, (item) => item.goldDocument)
  extractionItems: GoldExtractionItem[];
}
