import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Savings')
export class SavingsModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'account_id' })
  accountId: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { name: 'saving_type' })
  savingType: string;

  @Field(() => Int, { name: 'target_amount_cents', nullable: true })
  targetAmountCents: number | null;

  @Field(() => Int, { name: 'current_balance_cents' })
  currentBalanceCents: number;

  @Field(() => String)
  currency: string;

  @Field(() => String, { name: 'start_date' })
  startDate: string;

  @Field(() => String, { name: 'target_date', nullable: true })
  targetDate: string | null;

  @Field(() => String)
  status: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
