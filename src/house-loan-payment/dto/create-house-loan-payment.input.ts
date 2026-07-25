import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const HOUSE_LOAN_PAYMENT_TYPES = [
  'MONTHLY_INSTALLMENT',
  'PARTIAL_PAYMENT',
  'EXTRA_PAYMENT',
  'FULL_SETTLEMENT',
] as const;

@InputType()
export class CreateHouseLoanPaymentInput {
  @Field(() => ID, { name: 'house_loan_id' })
  @IsUUID()
  house_loan_id: string;

  @Field(() => ID, { name: 'payment_account_id' })
  @IsUUID()
  payment_account_id: string;

  /** Category used on the LOAN_PAYMENT ledger row. */
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

  @Field(() => String, { name: 'payment_type' })
  @IsString()
  @IsIn([...HOUSE_LOAN_PAYMENT_TYPES])
  payment_type: string;

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
