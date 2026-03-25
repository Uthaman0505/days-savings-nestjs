import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ActiveSavingPlan')
export class ActiveSavingPlanModel {
  @Field(() => String)
  id: string;

  @Field(() => Int, { name: 'total_days' })
  totalDays: number;

  @Field(() => Int, { name: 'total_amount' })
  totalAmount: number;

  @Field(() => Int, { name: 'allowed_hours' })
  allowedHours: number;

  @Field(() => Date)
  startAt: Date;

  @Field(() => Date)
  endAt: Date;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;
}
