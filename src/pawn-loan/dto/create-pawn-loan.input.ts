import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PAWN_COLLATERAL_ITEM_TYPES,
  PAWN_INTEREST_TYPES,
} from '../pawn-loan.enums';

@InputType()
export class CreatePawnCollateralInput {
  @Field(() => String, { name: 'item_type' })
  @IsString()
  @IsIn([...PAWN_COLLATERAL_ITEM_TYPES])
  item_type: string;

  @Field(() => String)
  @IsString()
  @Length(1, 2000)
  description: string;

  @Field(() => String, { name: 'owner_name' })
  @IsString()
  @Length(1, 120)
  owner_name: string;

  @Field(() => Int, { name: 'estimated_value_cents' })
  @IsInt()
  @Min(1)
  estimated_value_cents: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @Field(() => String, { name: 'serial_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serial_number?: string;

  @Field(() => [String], { name: 'image_urls', nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_urls?: string[];
}

@InputType()
export class CreatePawnLoanInput {
  @Field(() => String, { name: 'pawn_shop_name' })
  @IsString()
  @Length(1, 120)
  pawn_shop_name: string;

  @Field(() => String, { name: 'receipt_number' })
  @IsString()
  @Length(1, 64)
  receipt_number: string;

  @Field(() => Int, { name: 'principal_amount_cents' })
  @IsInt()
  @Min(1)
  principal_amount_cents: number;

  @Field(() => Float, {
    name: 'interest_rate',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate?: number;

  @Field(() => String, {
    name: 'interest_type',
    nullable: true,
    defaultValue: 'FLAT',
  })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_INTEREST_TYPES])
  interest_type?: string;

  @Field(() => Int, {
    name: 'loan_term_months',
    nullable: true,
    defaultValue: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  loan_term_months?: number;

  @Field(() => Int, {
    name: 'grace_period_days',
    nullable: true,
    defaultValue: 14,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @Field(() => String, { name: 'loan_start_date' })
  @IsDateString()
  loan_start_date: string;

  @Field(() => String, { name: 'maturity_date', nullable: true })
  @IsOptional()
  @IsDateString()
  maturity_date?: string;

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
  remarks?: string;

  @Field(() => [CreatePawnCollateralInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePawnCollateralInput)
  collaterals?: CreatePawnCollateralInput[];
}
