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
import { INSURANCE_TYPES, PAYMENT_FREQUENCIES } from './create-insurance.input';

@InputType()
export class UpdateInsuranceInput {
  @Field(() => String, { name: 'policy_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  policy_name?: string;

  @Field(() => String, { name: 'insurance_company', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  insurance_company?: string;

  @Field(() => String, { name: 'policy_number', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  policy_number?: string;

  @Field(() => String, { name: 'insurance_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...INSURANCE_TYPES])
  insurance_type?: string;

  @Field(() => Int, { name: 'coverage_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  coverage_amount_cents?: number;

  @Field(() => Int, { name: 'annual_premium_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  annual_premium_cents?: number;

  @Field(() => Int, { name: 'monthly_premium_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  monthly_premium_cents?: number | null;

  @Field(() => String, { name: 'payment_frequency', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAYMENT_FREQUENCIES])
  payment_frequency?: string;

  @Field(() => String, { name: 'policy_start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  policy_start_date?: string;

  @Field(() => String, { name: 'policy_end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  policy_end_date?: string;

  @Field(() => String, { name: 'renewal_date', nullable: true })
  @IsOptional()
  @IsDateString()
  renewal_date?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
