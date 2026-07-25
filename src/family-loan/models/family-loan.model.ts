import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('FamilyLoan')
export class FamilyLoanModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'loan_type' })
  loanType: string;

  @Field(() => String, { name: 'person_name' })
  personName: string;

  @Field(() => String)
  relationship: string;

  @Field(() => String, { name: 'contact_number', nullable: true })
  contactNumber: string | null;

  @Field(() => ID, { name: 'account_id' })
  accountId: string;

  @Field(() => ID, { name: 'transaction_id' })
  transactionId: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  principalAmountCents: number;

  @Field(() => Int, { name: 'outstanding_balance_cents' })
  outstandingBalanceCents: number;

  @Field(() => Float, { name: 'interest_rate' })
  interestRate: number;

  @Field(() => String, { name: 'loan_start_date' })
  loanStartDate: string;

  @Field(() => String, { name: 'expected_end_date', nullable: true })
  expectedEndDate: string | null;

  @Field(() => String)
  currency: string;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String)
  status: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
