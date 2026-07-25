import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('CreditCard')
export class CreditCardModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'account_id', nullable: true })
  accountId: string | null;

  @Field(() => String, { name: 'card_name' })
  cardName: string;

  @Field(() => String, { name: 'bank_name' })
  bankName: string;

  @Field(() => String, { name: 'card_network' })
  cardNetwork: string;

  @Field(() => String, { name: 'last_four_digits' })
  lastFourDigits: string;

  @Field(() => Int, { name: 'credit_limit_cents' })
  creditLimitCents: number;

  @Field(() => Int, { name: 'available_limit_cents' })
  availableLimitCents: number;

  @Field(() => Int, { name: 'outstanding_balance_cents' })
  outstandingBalanceCents: number;

  @Field(() => Int, { name: 'statement_day' })
  statementDay: number;

  @Field(() => Int, { name: 'payment_due_day' })
  paymentDueDay: number;

  @Field(() => String)
  currency: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
