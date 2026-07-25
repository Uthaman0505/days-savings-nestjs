import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const CARD_NETWORKS = [
  'VISA',
  'MASTERCARD',
  'AMEX',
  'UNIONPAY',
  'JCB',
  'OTHER',
] as const;

@InputType()
export class CreateCreditCardInput {
  @Field(() => String, { name: 'card_name' })
  @IsString()
  @Length(1, 120)
  card_name: string;

  @Field(() => String, { name: 'bank_name' })
  @IsString()
  @Length(1, 120)
  bank_name: string;

  @Field(() => String, { name: 'card_network' })
  @IsString()
  @IsIn([...CARD_NETWORKS])
  card_network: string;

  @Field(() => String, { name: 'last_four_digits' })
  @IsString()
  @Matches(/^\d{4}$/)
  last_four_digits: string;

  @Field(() => Int, { name: 'credit_limit_cents' })
  @IsInt()
  @Min(1)
  credit_limit_cents: number;

  @Field(() => Int, {
    name: 'outstanding_balance_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  outstanding_balance_cents?: number;

  @Field(() => Int, { name: 'statement_day' })
  @IsInt()
  @Min(1)
  @Max(31)
  statement_day: number;

  @Field(() => Int, { name: 'payment_due_day' })
  @IsInt()
  @Min(1)
  @Max(31)
  payment_due_day: number;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;
}
