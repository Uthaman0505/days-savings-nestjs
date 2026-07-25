import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ACCOUNT_TYPES } from './create-account.input';

@InputType()
export class UpdateAccountInput {
  @Field(() => String, { name: 'account_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  account_name?: string;

  @Field(() => String, { name: 'account_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_TYPES])
  account_type?: string;

  @Field(() => String, { name: 'bank_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank_name?: string | null;

  @Field(() => String, { name: 'account_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  account_number?: string | null;

  @Field(() => String, { name: 'currency_code', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency_code?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string | null;

  @Field(() => Int, { name: 'display_order', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @Field(() => Boolean, { name: 'is_default', nullable: true })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
