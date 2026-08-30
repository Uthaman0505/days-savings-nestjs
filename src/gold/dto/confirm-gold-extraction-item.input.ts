import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class ConfirmGoldExtractionItemInput {
  @Field(() => ID, { name: 'extraction_item_id' })
  @IsUUID()
  extraction_item_id: string;

  @Field(() => String, { name: 'purchase_date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'purchase_date must be YYYY-MM-DD',
  })
  purchase_date: string;

  @Field(() => String, { name: 'weight_grams' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, {
    message: 'weight_grams must be a positive number with up to 4 decimals',
  })
  weight_grams: string;

  @Field(() => Int, { name: 'amount_paid_cents' })
  @IsInt()
  @Min(1)
  amount_paid_cents: number;

  @Field(() => Int, { name: 'price_per_gram_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  price_per_gram_cents?: number;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
