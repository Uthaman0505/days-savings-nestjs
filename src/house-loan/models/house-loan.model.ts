import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('HouseLoan')
export class HouseLoanModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'loan_name' })
  loanName: string;

  @Field(() => String, { name: 'bank_name' })
  bankName: string;

  @Field(() => String, { name: 'loan_account_number' })
  loanAccountNumber: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  principalAmountCents: number;

  @Field(() => Int, { name: 'current_balance_cents' })
  currentBalanceCents: number;

  @Field(() => Float, { name: 'interest_rate' })
  interestRate: number;

  @Field(() => Int, { name: 'loan_term_months' })
  loanTermMonths: number;

  @Field(() => Int, { name: 'monthly_installment_cents' })
  monthlyInstallmentCents: number;

  @Field(() => String, { name: 'start_date' })
  startDate: string;

  @Field(() => String, { name: 'maturity_date' })
  maturityDate: string;

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
