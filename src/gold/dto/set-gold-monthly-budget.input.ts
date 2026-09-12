import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

@InputType()
export class SetGoldMonthlyBudgetInput {
  @Field(() => Int, { name: 'monthly_budget_cents' })
  @IsInt()
  @Min(1, { message: 'monthly_budget_cents must be greater than 0.' })
  monthly_budget_cents: number;
}
