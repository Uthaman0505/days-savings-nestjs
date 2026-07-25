import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

@InputType()
export class CreateHouseLoanInput {
  @Field(() => String, { name: 'loan_name' })
  @IsString()
  @Length(1, 120)
  loan_name: string;

  @Field(() => String, { name: 'bank_name' })
  @IsString()
  @Length(1, 120)
  bank_name: string;

  @Field(() => String, { name: 'loan_account_number' })
  @IsString()
  @Length(1, 64)
  loan_account_number: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  @IsInt()
  @Min(1)
  principal_amount_cents: number;

  @Field(() => Int, { name: 'current_balance_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_balance_cents?: number;

  @Field(() => Float, { name: 'interest_rate' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate: number;

  @Field(() => Int, { name: 'loan_term_months' })
  @IsInt()
  @Min(1)
  loan_term_months: number;

  @Field(() => Int, { name: 'monthly_installment_cents' })
  @IsInt()
  @Min(1)
  monthly_installment_cents: number;

  @Field(() => String, { name: 'start_date' })
  @IsDateString()
  start_date: string;

  @Field(() => String, { name: 'maturity_date' })
  @IsDateString()
  maturity_date: string;

  @Field(() => Int, { name: 'payment_due_day' })
  @IsInt()
  @Min(1)
  @Max(31)
  payment_due_day: number;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
