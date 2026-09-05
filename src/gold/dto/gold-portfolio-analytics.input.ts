import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { GOLD_PRICE_HISTORY_RANGES } from '../gold-price-analytics';

@InputType()
export class GoldPortfolioAnalyticsInput {
  @Field(() => String, { defaultValue: 'D7' })
  @IsString()
  @IsIn([...GOLD_PRICE_HISTORY_RANGES])
  range: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
