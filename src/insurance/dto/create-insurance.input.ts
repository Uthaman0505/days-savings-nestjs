import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export const INSURANCE_TYPES = [
  'MEDICAL',
  'LIFE',
  'CAR',
  'MOTORCYCLE',
  'HOUSE',
  'TRAVEL',
  'PERSONAL_ACCIDENT',
  'EDUCATION',
  'OTHER',
] as const;

export const PAYMENT_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
] as const;

@InputType()
export class CreateInsuranceInput {
  @Field(() => String, { name: 'policy_name' })
  @IsString()
  @Length(1, 120)
  policy_name: string;

  @Field(() => String, { name: 'insurance_company' })
  @IsString()
  @Length(1, 120)
  insurance_company: string;

  @Field(() => String, { name: 'policy_number' })
  @IsString()
  @Length(1, 64)
  policy_number: string;

  @Field(() => String, { name: 'insurance_type' })
  @IsString()
  @IsIn([...INSURANCE_TYPES])
  insurance_type: string;

  @Field(() => Int, { name: 'coverage_amount_cents' })
  @IsInt()
  @Min(1)
  coverage_amount_cents: number;

  @Field(() => Int, { name: 'annual_premium_cents' })
  @IsInt()
  @Min(1)
  annual_premium_cents: number;

  @Field(() => Int, { name: 'monthly_premium_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  monthly_premium_cents?: number;

  @Field(() => String, { name: 'payment_frequency' })
  @IsString()
  @IsIn([...PAYMENT_FREQUENCIES])
  payment_frequency: string;

  @Field(() => String, { name: 'policy_start_date' })
  @IsDateString()
  policy_start_date: string;

  @Field(() => String, { name: 'policy_end_date' })
  @IsDateString()
  policy_end_date: string;

  @Field(() => String, { name: 'renewal_date' })
  @IsDateString()
  renewal_date: string;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
