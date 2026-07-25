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
  Min,
} from 'class-validator';
import { PAWN_INTEREST_TYPES, PAWN_LOAN_STATUSES } from '../pawn-loan.enums';

@InputType()
export class UpdatePawnLoanInput {
  @Field(() => String, { name: 'pawn_shop_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  pawn_shop_name?: string;

  @Field(() => String, { name: 'receipt_number', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  receipt_number?: string;

  @Field(() => Float, { name: 'interest_rate', nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate?: number;

  @Field(() => String, { name: 'interest_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_INTEREST_TYPES])
  interest_type?: string;

  @Field(() => Int, { name: 'loan_term_months', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  loan_term_months?: number;

  @Field(() => Int, { name: 'grace_period_days', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @Field(() => String, { name: 'loan_start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  loan_start_date?: string;

  @Field(() => String, { name: 'maturity_date', nullable: true })
  @IsOptional()
  @IsDateString()
  maturity_date?: string;

  @Field(() => String, { name: 'grace_period_end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  grace_period_end_date?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  remarks?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_LOAN_STATUSES])
  status?: string;
}
