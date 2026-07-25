import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FAMILY_LOAN_PAYMENT_DIRECTIONS } from './create-family-loan-payment.input';

export const FAMILY_LOAN_PAYMENT_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class FamilyLoanPaymentFilterInput {
  @Field(() => ID, { name: 'family_loan_id', nullable: true })
  @IsOptional()
  @IsUUID()
  family_loan_id?: string;

  @Field(() => ID, { name: 'payment_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @Field(() => String, { name: 'payment_direction', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...FAMILY_LOAN_PAYMENT_DIRECTIONS])
  payment_direction?: string;

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
  @IsIn([...FAMILY_LOAN_PAYMENT_SORT_ORDERS])
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
