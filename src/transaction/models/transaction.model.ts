import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Transaction')
export class TransactionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'account_id' })
  accountId: string;

  @Field(() => ID, { name: 'category_id' })
  categoryId: string;

  @Field(() => String, { name: 'transaction_type' })
  transactionType: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => Date, { name: 'transaction_date' })
  transactionDate: Date;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String)
  status: string;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
