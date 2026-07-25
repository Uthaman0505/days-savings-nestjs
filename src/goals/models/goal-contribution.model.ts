import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoalContribution')
export class GoalContributionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'goal_id' })
  goalId: string;

  @Field(() => ID, { name: 'savings_id', nullable: true })
  savingsId: string | null;

  @Field(() => ID, { name: 'account_id', nullable: true })
  accountId: string | null;

  @Field(() => ID, { name: 'transaction_id' })
  transactionId: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => Date, { name: 'movement_date' })
  movementDate: Date;

  @Field(() => String, { name: 'movement_type' })
  movementType: string;

  @Field(() => String, { name: 'source_type' })
  sourceType: string;

  @Field(() => Boolean, { name: 'affects_account_balance' })
  affectsAccountBalance: boolean;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
