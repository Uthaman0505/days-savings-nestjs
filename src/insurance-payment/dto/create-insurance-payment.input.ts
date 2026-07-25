import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const INSURANCE_PAYMENT_TYPES = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'SPECIAL_PAYMENT',
] as const;

@InputType()
export class CreateInsurancePaymentInput {
  @Field(() => ID, { name: 'insurance_id' })
  @IsUUID()
  insurance_id: string;

  @Field(() => ID, { name: 'payment_account_id' })
  @IsUUID()
  payment_account_id: string;

  /** Category used on the INSURANCE_PAYMENT ledger row. */
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
  @IsIn([...INSURANCE_PAYMENT_TYPES])
  payment_type: string;

  @Field(() => String, { name: 'coverage_period_start' })
  @IsDateString()
  coverage_period_start: string;

  @Field(() => String, { name: 'coverage_period_end' })
  @IsDateString()
  coverage_period_end: string;

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
