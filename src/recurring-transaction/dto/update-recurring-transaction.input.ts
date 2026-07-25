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
} from 'class-validator';
import {
  RECURRING_FREQUENCIES,
  RECURRING_TARGET_MODULES,
  RECURRING_TRANSACTION_TYPES,
} from './create-recurring-transaction.input';

@InputType()
export class UpdateRecurringTransactionInput {
  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string | null;

  @Field(() => String, { name: 'target_module', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_TARGET_MODULES])
  target_module?: string;

  @Field(() => ID, { name: 'target_reference_id', nullable: true })
  @IsOptional()
  @IsUUID()
  target_reference_id?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @Field(() => String, { name: 'transaction_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_TRANSACTION_TYPES])
  transaction_type?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_FREQUENCIES])
  frequency?: string;

  @Field(() => Int, { name: 'interval_value', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  interval_value?: number;

  @Field(() => String, { name: 'start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @Field(() => String, { name: 'end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @Field(() => GraphQLISODateTime, {
    name: 'next_execution_date',
    nullable: true,
  })
  @IsOptional()
  next_execution_date?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @Field(() => Boolean, { name: 'auto_execute', nullable: true })
  @IsOptional()
  @IsBoolean()
  auto_execute?: boolean;

  @Field(() => Int, { name: 'max_retry_count', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_retry_count?: number;

  @Field(() => ID, { name: 'to_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  to_account_id?: string | null;

  @Field(() => String, { name: 'income_source', nullable: true })
  @IsOptional()
  @IsString()
  income_source?: string | null;

  @Field(() => String, { name: 'payment_method', nullable: true })
  @IsOptional()
  @IsString()
  payment_method?: string | null;

  @Field(() => String, { name: 'payment_type', nullable: true })
  @IsOptional()
  @IsString()
  payment_type?: string | null;

  @Field(() => String, { name: 'merchant_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant_name?: string | null;

  @Field(() => Int, { name: 'coverage_period_days', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  coverage_period_days?: number | null;

  @Field(() => String, { name: 'goal_source_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['ACCOUNT', 'SAVINGS'])
  goal_source_type?: string | null;

  @Field(() => ID, { name: 'savings_id', nullable: true })
  @IsOptional()
  @IsUUID()
  savings_id?: string | null;
}
