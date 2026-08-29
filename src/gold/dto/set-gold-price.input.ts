import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class SetGoldPriceInput {
  @Field(() => String, { name: 'price_date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'price_date must be YYYY-MM-DD',
  })
  price_date: string;

  /**
   * Public Gold BUY — PG buys from customer (liquidation / portfolio valuation).
   */
  @Field(() => Int, { name: 'pg_buy_price_per_gram_cents' })
  @IsInt()
  @Min(1)
  pg_buy_price_per_gram_cents: number;

  /**
   * Public Gold SELL — PG sells to customer (acquisition / pay price).
   */
  @Field(() => Int, { name: 'pg_sell_price_per_gram_cents' })
  @IsInt()
  @Min(1)
  pg_sell_price_per_gram_cents: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
