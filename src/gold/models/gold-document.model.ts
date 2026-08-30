import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GoldExtractionItemModel } from './gold-extraction-item.model';

@ObjectType('GoldDocument')
export class GoldDocumentModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'original_file_name' })
  originalFileName: string;

  @Field(() => String, { name: 'mime_type' })
  mimeType: string;

  @Field(() => Int, { name: 'file_size_bytes' })
  fileSizeBytes: number;

  @Field(() => String, { name: 'extraction_status' })
  extractionStatus: string;

  @Field(() => String, { name: 'extraction_error', nullable: true })
  extractionError: string | null;

  @Field(() => Int, { name: 'page_count', nullable: true })
  pageCount: number | null;

  @Field(() => Date, { name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  @Field(() => Int, { name: 'extracted_item_count' })
  extractedItemCount: number;

  @Field(() => Int, { name: 'confirmed_item_count' })
  confirmedItemCount: number;

  @Field(() => Int, { name: 'rejected_item_count' })
  rejectedItemCount: number;

  @Field(() => Int, { name: 'pending_item_count' })
  pendingItemCount: number;

  @Field(() => [GoldExtractionItemModel], {
    name: 'extraction_items',
    nullable: true,
  })
  extractionItems?: GoldExtractionItemModel[] | null;

  /**
   * JWT-protected REST path for the original file (requires PUBLIC_APP_URL on server).
   */
  @Field(() => String, { name: 'file_url', nullable: true })
  fileUrl: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
