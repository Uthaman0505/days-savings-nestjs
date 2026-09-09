import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  GOLD_NEXT_TARGET_RULES,
  MAX_NEXT_TARGET_PERCENT,
} from '../gold-next-profit-goal';

@InputType()
export class GoldNextProfitGoalPreviewInput {
  @Field(() => ID, { name: 'previous_goal_id' })
  @IsUUID()
  previous_goal_id: string;

  @Field(() => String)
  @IsIn([...GOLD_NEXT_TARGET_RULES])
  rule: 'SAME' | 'FIXED_RM_INCREASE' | 'PERCENT_INCREASE';

  @Field(() => Int, { name: 'fixed_increase_cents', nullable: true })
  @IsOptional()
  @Min(1)
  fixed_increase_cents?: number | null;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(MAX_NEXT_TARGET_PERCENT)
  percentage?: number | null;
}
