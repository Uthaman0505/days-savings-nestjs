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
import { CARD_NETWORKS } from './create-credit-card.input';

@InputType()
export class UpdateCreditCardInput {
  @Field(() => String, { name: 'card_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  card_name?: string;

  @Field(() => String, { name: 'bank_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  bank_name?: string;

  @Field(() => String, { name: 'card_network', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...CARD_NETWORKS])
  card_network?: string;

  @Field(() => String, { name: 'last_four_digits', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  last_four_digits?: string;

  @Field(() => Int, { name: 'credit_limit_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  credit_limit_cents?: number;

  @Field(() => Int, { name: 'outstanding_balance_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  outstanding_balance_cents?: number;

  @Field(() => Int, { name: 'statement_day', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  statement_day?: number;

  @Field(() => Int, { name: 'payment_due_day', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payment_due_day?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string | null;
}
