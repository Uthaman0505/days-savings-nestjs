import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('SavingPlan')
export class SavingPlanModel {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  name: string;

  @Field(() => Int, { name: 'total_days' })
  totalDays: number;

  @Field(() => Int, { name: 'total_amount' })
  totalAmount: number;

  @Field(() => Int, { name: 'allowed_hours' })
  allowedHours: number;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;
}
