import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const INCOME_SOURCES = [
  'SALARY',
  'BONUS',
  'COMMISSION',
  'GRAB',
  'FREELANCE',
  'INTEREST',
  'DIVIDEND',
  'RENTAL',
  'REFUND',
  'OTHER',
] as const;

@InputType()
export class CreateIncomeInput {
  @Field(() => ID, { name: 'account_id' })
  @IsUUID()
  account_id: string;

  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => String, { name: 'income_source' })
  @IsString()
  @IsIn([...INCOME_SOURCES])
  income_source: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'received_date' })
  @Type(() => Date)
  @IsDate()
  received_date: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
