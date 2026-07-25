import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Insurance')
export class InsuranceModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'policy_name' })
  policyName: string;

  @Field(() => String, { name: 'insurance_company' })
  insuranceCompany: string;

  @Field(() => String, { name: 'policy_number' })
  policyNumber: string;

  @Field(() => String, { name: 'insurance_type' })
  insuranceType: string;

  @Field(() => Int, { name: 'coverage_amount_cents' })
  coverageAmountCents: number;

  @Field(() => Int, { name: 'annual_premium_cents' })
  annualPremiumCents: number;

  @Field(() => Int, { name: 'monthly_premium_cents', nullable: true })
  monthlyPremiumCents: number | null;

  @Field(() => String, { name: 'payment_frequency' })
  paymentFrequency: string;

  @Field(() => String, { name: 'policy_start_date' })
  policyStartDate: string;

  @Field(() => String, { name: 'policy_end_date' })
  policyEndDate: string;

  @Field(() => String, { name: 'renewal_date' })
  renewalDate: string;

  @Field(() => String, { name: 'last_payment_date', nullable: true })
  lastPaymentDate: string | null;

  @Field(() => String)
  currency: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
