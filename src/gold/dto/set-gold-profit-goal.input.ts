import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

@InputType()
export class SetGoldProfitGoalInput {
  @Field(() => Int, { name: 'target_profit_cents' })
  @IsInt()
  @Min(1, { message: 'target_profit_cents must be greater than 0.' })
  target_profit_cents: number;
}
