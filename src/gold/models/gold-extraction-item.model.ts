import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldExtractionItem')
export class GoldExtractionItemModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'gold_document_id' })
  goldDocumentId: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => Int, { name: 'row_index' })
  rowIndex: number;

  @Field(() => String)
  status: string;

  @Field(() => String, { name: 'purchase_date', nullable: true })
  purchaseDate: string | null;

  @Field(() => String, { name: 'weight_grams', nullable: true })
  weightGrams: string | null;

  @Field(() => Int, { name: 'amount_paid_cents', nullable: true })
  amountPaidCents: number | null;

  @Field(() => Int, { name: 'price_per_gram_cents', nullable: true })
  pricePerGramCents: number | null;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => Float, { nullable: true })
  confidence: number | null;

  @Field(() => [String], { name: 'validation_warnings' })
  validationWarnings: string[];

  @Field(() => ID, { name: 'gold_purchase_id', nullable: true })
  goldPurchaseId: string | null;

  @Field(() => Date, { name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  @Field(() => Date, { name: 'rejected_at', nullable: true })
  rejectedAt: Date | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
