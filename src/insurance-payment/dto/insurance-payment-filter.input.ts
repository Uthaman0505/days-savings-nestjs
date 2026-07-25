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
import { INSURANCE_PAYMENT_TYPES } from './create-insurance-payment.input';

export const INSURANCE_PAYMENT_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class InsurancePaymentFilterInput {
  @Field(() => ID, { name: 'insurance_id', nullable: true })
  @IsOptional()
  @IsUUID()
  insurance_id?: string;

  @Field(() => ID, { name: 'payment_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @Field(() => String, { name: 'payment_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...INSURANCE_PAYMENT_TYPES])
  payment_type?: string;

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
  @IsIn([...INSURANCE_PAYMENT_SORT_ORDERS])
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
