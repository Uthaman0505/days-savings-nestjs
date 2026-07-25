import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('FamilyLoanPayment')
export class FamilyLoanPaymentModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'family_loan_id' })
  familyLoanId: string;

  @Field(() => ID, { name: 'payment_account_id' })
  paymentAccountId: string;

  @Field(() => ID, { name: 'transaction_id' })
  transactionId: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => Date, { name: 'payment_date' })
  paymentDate: Date;

  @Field(() => String, { name: 'payment_direction' })
  paymentDirection: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
