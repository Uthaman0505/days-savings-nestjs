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

export const CREDIT_CARD_PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'ONLINE_BANKING',
  'CASH',
  'AUTO_DEBIT',
  'OTHER',
] as const;

@InputType()
export class CreateCreditCardPaymentInput {
  @Field(() => ID, { name: 'credit_card_id' })
  @IsUUID()
  credit_card_id: string;

  @Field(() => ID, { name: 'payment_account_id' })
  @IsUUID()
  payment_account_id: string;

  /** Category used on the CREDIT_CARD_PAYMENT ledger row. */
  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'payment_date' })
  @Type(() => Date)
  @IsDate()
  payment_date: Date;

  @Field(() => String, { name: 'payment_method' })
  @IsString()
  @IsIn([...CREDIT_CARD_PAYMENT_METHODS])
  payment_method: string;

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
