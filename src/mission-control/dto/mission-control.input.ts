import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DEBT_PRIORITY_METHODS,
  DEBT_SOURCE_TYPES,
  SALARY_ALLOCATION_CATEGORIES,
} from '../mission-control.enums';

@InputType()
export class CreateSalaryPlanInput {
  @Field(() => Int, { name: 'salary_amount_cents' })
  @IsInt()
  @Min(1)
  salary_amount_cents: number;

  @Field(() => String, { name: 'month_key', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month_key?: string;

  @Field(() => String, { nullable: true, defaultValue: 'MYR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType()
export class SalaryAllocationLineInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;

  @Field(() => String)
  @IsString()
  @IsIn([...SALARY_ALLOCATION_CATEGORIES])
  category: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(0)
  amount_cents: number;

  @Field(() => Float, { name: 'percent_share', nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  percent_share?: number;

  @Field(() => Boolean, { name: 'is_locked', nullable: true })
  @IsOptional()
  @IsBoolean()
  is_locked?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType()
export class UpdateSalaryAllocationsInput {
  @Field(() => ID, { name: 'salary_plan_id' })
  @IsUUID()
  salary_plan_id: string;

  @Field(() => [SalaryAllocationLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalaryAllocationLineInput)
  allocations: SalaryAllocationLineInput[];
}

@InputType()
export class SyncDebtPrioritiesInput {
  @Field(() => String, { name: 'priority_method' })
  @IsString()
  @IsIn([...DEBT_PRIORITY_METHODS])
  priority_method: string;
}

@InputType()
export class ReorderDebtPrioritiesInput {
  @Field(() => [ID], { name: 'ordered_ids' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ordered_ids: string[];
}

@InputType()
export class AllocateExtraDebtPaymentInput {
  @Field(() => ID, { name: 'debt_priority_id' })
  @IsUUID()
  debt_priority_id: string;

  @Field(() => Int, { name: 'extra_amount_cents' })
  @IsInt()
  @Min(1)
  extra_amount_cents: number;
}

@InputType()
export class UpsertProjectionSettingsInput {
  @Field(() => Int, { name: 'monthly_extra_payment_cents' })
  @IsInt()
  @Min(0)
  monthly_extra_payment_cents: number;

  @Field(() => String, { name: 'priority_method', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...DEBT_PRIORITY_METHODS])
  priority_method?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

@InputType()
export class ComputeProjectionInput {
  @Field(() => Int, { name: 'monthly_extra_payment_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthly_extra_payment_cents?: number;

  @Field(() => String, { name: 'priority_method', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...DEBT_PRIORITY_METHODS])
  priority_method?: string;
}

@InputType()
export class CreateManualDebtPriorityInput {
  @Field(() => String, { name: 'debt_name' })
  @IsString()
  @Length(1, 120)
  debt_name: string;

  @Field(() => String, { name: 'source_type' })
  @IsString()
  @IsIn([...DEBT_SOURCE_TYPES])
  source_type: string;

  @Field(() => ID, { name: 'source_id' })
  @IsUUID()
  source_id: string;

  @Field(() => Int, { name: 'outstanding_cents' })
  @IsInt()
  @Min(0)
  outstanding_cents: number;

  @Field(() => Int, { name: 'original_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  original_amount_cents?: number;

  @Field(() => Float, { name: 'interest_rate', nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interest_rate?: number;

  @Field(() => Int, { name: 'minimum_payment_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimum_payment_cents?: number;

  @Field(() => Int, { name: 'current_payment_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_payment_cents?: number;
}
