import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FAMILY_LOAN_STATUSES } from './create-family-loan.input';

@InputType()
export class UpdateFamilyLoanInput {
  @Field(() => String, { name: 'person_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  person_name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  relationship?: string;

  @Field(() => String, { name: 'contact_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contact_number?: string | null;

  @Field(() => Int, { name: 'principal_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  principal_amount_cents?: number;

  @Field(() => Int, { name: 'outstanding_balance_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  outstanding_balance_cents?: number;

  @Field(() => Float, { name: 'interest_rate', nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate?: number;

  @Field(() => String, { name: 'loan_start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  loan_start_date?: string;

  @Field(() => String, { name: 'expected_end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  expected_end_date?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...FAMILY_LOAN_STATUSES])
  status?: string;
}
