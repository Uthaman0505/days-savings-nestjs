import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export const SAVING_TYPES = [
  'GENERAL',
  'EMERGENCY',
  'VACATION',
  'CAR',
  'HOUSE',
  'EDUCATION',
  'RETIREMENT',
  'INVESTMENT',
  'FIXED_DEPOSIT',
  'CUSTOM',
] as const;

export const SAVINGS_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

@InputType()
export class CreateSavingsInput {
  @Field(() => ID, { name: 'account_id' })
  @IsUUID()
  account_id: string;

  @Field(() => String)
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => String, { name: 'saving_type' })
  @IsString()
  @IsIn([...SAVING_TYPES])
  saving_type: string;

  @Field(() => Int, { name: 'target_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  target_amount_cents?: number;

  @Field(() => Int, {
    name: 'current_balance_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_balance_cents?: number;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { name: 'start_date' })
  @IsDateString()
  start_date: string;

  @Field(() => String, { name: 'target_date', nullable: true })
  @IsOptional()
  @IsDateString()
  target_date?: string;
}
