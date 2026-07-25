import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('PawnLoan')
export class PawnLoanModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'pawn_shop_name' })
  pawnShopName: string;

  @Field(() => String, { name: 'receipt_number' })
  receiptNumber: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  principalAmountCents: number;

  @Field(() => Int, { name: 'outstanding_principal_cents' })
  outstandingPrincipalCents: number;

  @Field(() => Float, { name: 'interest_rate' })
  interestRate: number;

  @Field(() => String, { name: 'interest_type' })
  interestType: string;

  @Field(() => Int, { name: 'loan_term_months' })
  loanTermMonths: number;

  @Field(() => Int, { name: 'grace_period_days' })
  gracePeriodDays: number;

  @Field(() => String, { name: 'loan_start_date' })
  loanStartDate: string;

  @Field(() => String, { name: 'maturity_date' })
  maturityDate: string;

  @Field(() => String, { name: 'grace_period_end_date' })
  gracePeriodEndDate: string;

  @Field(() => String)
  status: string;

  @Field(() => String)
  currency: string;

  @Field(() => String, { nullable: true })
  remarks: string | null;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('PawnCollateral')
export class PawnCollateralModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'pawn_loan_id' })
  pawnLoanId: string;

  @Field(() => String, { name: 'item_type' })
  itemType: string;

  @Field(() => String)
  description: string;

  @Field(() => String, { name: 'owner_name' })
  ownerName: string;

  @Field(() => Int, { name: 'estimated_value_cents' })
  estimatedValueCents: number;

  @Field(() => Float, { nullable: true })
  weight: number | null;

  @Field(() => Int)
  quantity: number;

  @Field(() => String, { name: 'serial_number', nullable: true })
  serialNumber: string | null;

  @Field(() => [String], { name: 'image_urls', nullable: true })
  imageUrls: string[] | null;

  @Field(() => String, { name: 'current_status' })
  currentStatus: string;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('PawnPayment')
export class PawnPaymentModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'pawn_loan_id' })
  pawnLoanId: string;

  @Field(() => String, { name: 'payment_type' })
  paymentType: string;

  @Field(() => GraphQLISODateTime, { name: 'payment_date' })
  paymentDate: Date;

  @Field(() => Int, { name: 'principal_paid_cents' })
  principalPaidCents: number;

  @Field(() => Int, { name: 'interest_paid_cents' })
  interestPaidCents: number;

  @Field(() => Int, { name: 'total_paid_cents' })
  totalPaidCents: number;

  @Field(() => String, { name: 'payment_method' })
  paymentMethod: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => String, { nullable: true })
  remarks: string | null;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;
}

@ObjectType('PawnRenewal')
export class PawnRenewalModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'pawn_loan_id' })
  pawnLoanId: string;

  @Field(() => GraphQLISODateTime, { name: 'renewal_date' })
  renewalDate: Date;

  @Field(() => String, { name: 'previous_maturity_date' })
  previousMaturityDate: string;

  @Field(() => String, { name: 'new_maturity_date' })
  newMaturityDate: string;

  @Field(() => Int, { name: 'interest_paid_cents' })
  interestPaidCents: number;

  @Field(() => Int, { name: 'principal_reduction_cents' })
  principalReductionCents: number;

  @Field(() => String, { nullable: true })
  remarks: string | null;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;
}

@ObjectType('PawnTransaction')
export class PawnTransactionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'pawn_loan_id' })
  pawnLoanId: string;

  @Field(() => String, { name: 'transaction_type' })
  transactionType: string;

  @Field(() => GraphQLISODateTime, { name: 'transaction_date' })
  transactionDate: Date;

  @Field(() => String)
  description: string;

  @Field(() => String, { nullable: true })
  payload: string | null;

  @Field(() => ID, { name: 'created_by' })
  createdBy: string;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;
}
