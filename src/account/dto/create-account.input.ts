import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
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

export const ACCOUNT_TYPES = [
  'CASH',
  'BANK',
  'SAVINGS',
  'CURRENT',
  'CREDIT_CARD',
  'WISE',
  'TOUCH_N_GO',
  'WALLET',
  'OTHER',
] as const;

@InputType()
export class CreateAccountInput {
  @Field(() => String, { name: 'account_name' })
  @IsString()
  @Length(1, 120)
  account_name: string;

  @Field(() => String, { name: 'account_type' })
  @IsString()
  @IsIn([...ACCOUNT_TYPES])
  account_type: string;

  @Field(() => String, { name: 'bank_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank_name?: string;

  @Field(() => String, { name: 'account_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  account_number?: string;

  @Field(() => String, {
    name: 'currency_code',
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency_code?: string;

  @Field(() => Float, {
    name: 'opening_balance',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsNumber()
  opening_balance?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @Field(() => Int, { name: 'display_order', nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @Field(() => Boolean, {
    name: 'is_default',
    nullable: true,
    defaultValue: false,
  })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
