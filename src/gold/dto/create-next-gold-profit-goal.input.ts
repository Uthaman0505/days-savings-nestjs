import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsUUID, Min } from 'class-validator';

@InputType()
export class CreateNextGoldProfitGoalInput {
  @Field(() => ID, { name: 'previous_goal_id' })
  @IsUUID()
  previous_goal_id: string;

  @Field(() => Int, { name: 'target_profit_cents' })
  @IsInt()
  @Min(1, { message: 'target_profit_cents must be greater than 0.' })
  target_profit_cents: number;
}
