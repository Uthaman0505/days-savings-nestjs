import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const FAMILY_LOAN_PAYMENT_DIRECTIONS = [
  'PAY_TO_LENDER',
  'RECEIVE_FROM_BORROWER',
] as const;

@InputType()
export class CreateFamilyLoanPaymentInput {
  @Field(() => ID, { name: 'family_loan_id' })
  @IsUUID()
  family_loan_id: string;

  @Field(() => ID, { name: 'payment_account_id' })
  @IsUUID()
  payment_account_id: string;

  /** Category used on the family loan ledger row. */
  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'payment_date' })
  @Type(() => Date)
  @IsDate()
  payment_date: Date;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
