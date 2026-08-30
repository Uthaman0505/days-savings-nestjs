import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

@InputType()
export class ConfirmGoldPriceCaptureInput {
  @Field(() => ID)
  @IsUUID()
  capture_id: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  pg_buy_price_per_gram_cents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  pg_sell_price_per_gram_cents?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  price_date?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  captured_price_at?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
