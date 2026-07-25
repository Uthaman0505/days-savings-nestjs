import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import {
  FAMILY_LOAN_STATUSES,
  FAMILY_LOAN_TYPES,
} from './create-family-loan.input';

export const FAMILY_LOAN_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class FamilyLoanFilterInput {
  @Field(() => String, { name: 'loan_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...FAMILY_LOAN_TYPES])
  loan_type?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...FAMILY_LOAN_STATUSES])
  status?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  relationship?: string;

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
  @IsIn([...FAMILY_LOAN_SORT_ORDERS])
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
