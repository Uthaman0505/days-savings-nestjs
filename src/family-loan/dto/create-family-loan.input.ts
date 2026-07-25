import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const FAMILY_LOAN_TYPES = ['BORROWED', 'LENT'] as const;

export const FAMILY_LOAN_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'DEFAULTED',
  'CANCELLED',
] as const;

@InputType()
export class CreateFamilyLoanInput {
  @Field(() => String, { name: 'loan_type' })
  @IsString()
  @IsIn([...FAMILY_LOAN_TYPES])
  loan_type: string;

  @Field(() => String, { name: 'person_name' })
  @IsString()
  @Length(1, 120)
  person_name: string;

  @Field(() => String)
  @IsString()
  @Length(1, 64)
  relationship: string;

  @Field(() => String, { name: 'contact_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contact_number?: string;

  @Field(() => ID, { name: 'account_id' })
  @IsUUID()
  account_id: string;

  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  @IsInt()
  @Min(1)
  principal_amount_cents: number;

  @Field(() => Int, { name: 'outstanding_balance_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  outstanding_balance_cents?: number;

  @Field(() => Float, { name: 'interest_rate', nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate?: number;

  @Field(() => String, { name: 'loan_start_date' })
  @IsDateString()
  loan_start_date: string;

  @Field(() => String, { name: 'expected_end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  expected_end_date?: string;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
