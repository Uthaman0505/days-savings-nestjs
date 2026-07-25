import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Transfer')
export class TransferModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'from_account_id' })
  fromAccountId: string;

  @Field(() => ID, { name: 'to_account_id' })
  toAccountId: string;

  @Field(() => ID, { name: 'out_transaction_id' })
  outTransactionId: string;

  @Field(() => ID, { name: 'in_transaction_id' })
  inTransactionId: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => Date, { name: 'transfer_date' })
  transferDate: Date;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
