import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const RECURRING_TARGET_MODULES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'SAVINGS',
  'GOAL',
  'CREDIT_CARD_PAYMENT',
  'HOUSE_LOAN_PAYMENT',
  'INSURANCE_PAYMENT',
  'FAMILY_LOAN_PAYMENT',
] as const;

export const RECURRING_TRANSACTION_TYPES = [
  'INCOME',
  'EXPENSE',
  'PAYMENT',
  'TRANSFER',
  'SAVINGS_DEPOSIT',
  'GOAL_CONTRIBUTION',
] as const;

export const RECURRING_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
] as const;

@InputType()
export class CreateRecurringTransactionInput {
  @Field(() => ID, { name: 'account_id' })
  @IsUUID()
  account_id: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => String, { name: 'target_module' })
  @IsString()
  @IsIn([...RECURRING_TARGET_MODULES])
  target_module: string;

  @Field(() => ID, { name: 'target_reference_id', nullable: true })
  @IsOptional()
  @IsUUID()
  target_reference_id?: string;

  @Field(() => String)
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => String, { name: 'transaction_type' })
  @IsString()
  @IsIn([...RECURRING_TRANSACTION_TYPES])
  transaction_type: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => String, { nullable: true, defaultValue: 'MYR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String)
  @IsString()
  @IsIn([...RECURRING_FREQUENCIES])
  frequency: string;

  @Field(() => Int, { name: 'interval_value', nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  interval_value?: number;

  @Field(() => String, { name: 'start_date' })
  @IsDateString()
  start_date: string;

  @Field(() => String, { name: 'end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @Field(() => GraphQLISODateTime, {
    name: 'next_execution_date',
    nullable: true,
  })
  @IsOptional()
  next_execution_date?: Date;

  @Field(() => String, { nullable: true, defaultValue: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @Field(() => Boolean, { name: 'auto_execute', nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  auto_execute?: boolean;

  @Field(() => Int, { name: 'max_retry_count', nullable: true, defaultValue: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_retry_count?: number;

  /** TRANSFER destination account. */
  @Field(() => ID, { name: 'to_account_id', nullable: true })
  @ValidateIf((o: CreateRecurringTransactionInput) => o.target_module === 'TRANSFER')
  @IsUUID()
  to_account_id?: string;

  /** INCOME source enum value (e.g. SALARY). */
  @Field(() => String, { name: 'income_source', nullable: true })
  @ValidateIf((o: CreateRecurringTransactionInput) => o.target_module === 'INCOME')
  @IsString()
  income_source?: string;

  /** CREDIT_CARD_PAYMENT method. */
  @Field(() => String, { name: 'payment_method', nullable: true })
  @IsOptional()
  @IsString()
  payment_method?: string;

  /** HOUSE_LOAN / INSURANCE payment type. */
  @Field(() => String, { name: 'payment_type', nullable: true })
  @IsOptional()
  @IsString()
  payment_type?: string;

  @Field(() => String, { name: 'merchant_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant_name?: string;

  /** INSURANCE coverage window length in days (defaults to 30). */
  @Field(() => Int, { name: 'coverage_period_days', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  coverage_period_days?: number;

  /** GOAL contribution source: ACCOUNT (default) or SAVINGS. */
  @Field(() => String, { name: 'goal_source_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['ACCOUNT', 'SAVINGS'])
  goal_source_type?: string;

  /** When goal_source_type is SAVINGS. */
  @Field(() => ID, { name: 'savings_id', nullable: true })
  @IsOptional()
  @IsUUID()
  savings_id?: string;
}
