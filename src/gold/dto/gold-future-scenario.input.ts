import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

@InputType()
export class GoldFutureScenarioInput {
  @Field(() => Int, { name: 'future_pg_buy_per_gram_cents' })
  @IsInt()
  @Min(1, { message: 'future_pg_buy_per_gram_cents must be greater than 0.' })
  future_pg_buy_per_gram_cents: number;

  @Field(() => Int, { name: 'planned_deployment_percent', nullable: true })
  @IsOptional()
  @IsInt()
  planned_deployment_percent?: number | null;

  @Field(() => Int, { name: 'requested_profit_cents', nullable: true })
  @IsOptional()
  @IsInt()
  requested_profit_cents?: number | null;
}

@InputType()
export class GoldFutureScenarioComparisonInput {
  @Field(() => [Int], { name: 'future_price_cents' })
  future_price_cents: number[];

  @Field(() => Int, { name: 'planned_deployment_percent', nullable: true })
  @IsOptional()
  @IsInt()
  planned_deployment_percent?: number | null;

  @Field(() => Int, { name: 'requested_profit_cents', nullable: true })
  @IsOptional()
  @IsInt()
  requested_profit_cents?: number | null;
}
