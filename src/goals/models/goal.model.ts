import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Goal')
export class GoalModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { name: 'goal_type' })
  goalType: string;

  @Field(() => Int, { name: 'target_amount_cents' })
  targetAmountCents: number;

  @Field(() => Int, { name: 'current_amount_cents' })
  currentAmountCents: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  priority: string;

  @Field(() => String, { name: 'start_date' })
  startDate: string;

  @Field(() => String, { name: 'target_date' })
  targetDate: string;

  @Field(() => String)
  status: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
