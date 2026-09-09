import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { GOLD_PROFIT_TAKING_MODES } from '../gold-profit-taking';

@InputType()
export class GoldProfitTakingPreviewInput {
  @Field(() => String)
  @IsIn([...GOLD_PROFIT_TAKING_MODES])
  mode: 'TARGET' | 'PARTIAL';

  @Field(() => Int, { name: 'requested_profit_cents', nullable: true })
  @IsOptional()
  @IsInt()
  requested_profit_cents?: number | null;
}
