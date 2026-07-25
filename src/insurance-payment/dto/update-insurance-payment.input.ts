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
import { INSURANCE_PAYMENT_TYPES } from './create-insurance-payment.input';

@InputType()
export class UpdateInsurancePaymentInput {
  @Field(() => ID, { name: 'insurance_id', nullable: true })
  @IsOptional()
  @IsUUID()
  insurance_id?: string;

  @Field(() => ID, { name: 'payment_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => Date, { name: 'payment_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  payment_date?: Date;

  @Field(() => String, { name: 'payment_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...INSURANCE_PAYMENT_TYPES])
  payment_type?: string;

  @Field(() => String, { name: 'coverage_period_start', nullable: true })
  @IsOptional()
  @IsDateString()
  coverage_period_start?: string;

  @Field(() => String, { name: 'coverage_period_end', nullable: true })
  @IsOptional()
  @IsDateString()
  coverage_period_end?: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
