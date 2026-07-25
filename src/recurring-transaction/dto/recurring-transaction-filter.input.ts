import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  RECURRING_FREQUENCIES,
  RECURRING_TARGET_MODULES,
} from './create-recurring-transaction.input';

export const RECURRING_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class RecurringTransactionFilterInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_FREQUENCIES])
  frequency?: string;

  @Field(() => String, { name: 'target_module', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_TARGET_MODULES])
  target_module?: string;

  @Field(() => Boolean, { name: 'is_active', nullable: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @Field(() => String, { name: 'start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @Field(() => String, { name: 'end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @Field(() => String, {
    name: 'sort_order',
    nullable: true,
    defaultValue: 'NEWEST',
  })
  @IsOptional()
  @IsString()
  @IsIn([...RECURRING_SORT_ORDERS])
  sort_order?: string;

  @Field(() => Int, { nullable: true, defaultValue: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
