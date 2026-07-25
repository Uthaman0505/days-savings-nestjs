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

export const EXPENSE_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class ExpenseFilterInput {
  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => String, { name: 'merchant_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant_name?: string;

  @Field(() => Date, { name: 'start_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date?: Date;

  @Field(() => Date, { name: 'end_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  end_date?: Date;

  @Field(() => String, {
    name: 'sort_order',
    nullable: true,
    defaultValue: 'NEWEST',
  })
  @IsOptional()
  @IsString()
  @IsIn([...EXPENSE_SORT_ORDERS])
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
