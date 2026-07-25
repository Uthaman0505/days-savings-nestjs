import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SAVING_TYPES, SAVINGS_STATUSES } from './create-savings.input';

export const SAVINGS_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class SavingsFilterInput {
  @Field(() => String, { name: 'saving_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...SAVING_TYPES])
  saving_type?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...SAVINGS_STATUSES])
  status?: string;

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
  @IsIn([...SAVINGS_SORT_ORDERS])
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
