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

export const TRANSACTION_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENT',
  'LOAN_RECEIVED',
  'LOAN_GIVEN',
  'FAMILY_LOAN_PAYMENT',
  'FAMILY_LOAN_COLLECTION',
  'INSURANCE_PAYMENT',
  'SAVING_DEPOSIT',
  'SAVING_WITHDRAW',
  'GOAL_CONTRIBUTION',
  'GOAL_WITHDRAW',
  'CREDIT_CARD_PAYMENT',
  'ADJUSTMENT',
] as const;

export const TRANSACTION_STATUSES = [
  'PENDING',
  'COMPLETED',
  'CANCELLED',
] as const;

@InputType()
export class CreateTransactionInput {
  @Field(() => ID, { name: 'account_id' })
  @IsUUID()
  account_id: string;

  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => String, { name: 'transaction_type' })
  @IsString()
  @IsIn([...TRANSACTION_TYPES])
  transaction_type: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'transaction_date' })
  @Type(() => Date)
  @IsDate()
  transaction_date: Date;

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

  @Field(() => String, {
    nullable: true,
    defaultValue: 'COMPLETED',
  })
  @IsOptional()
  @IsString()
  @IsIn([...TRANSACTION_STATUSES])
  status?: string;
}
