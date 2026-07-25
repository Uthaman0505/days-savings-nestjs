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
import { CREDIT_CARD_PAYMENT_METHODS } from './create-credit-card-payment.input';

@InputType()
export class UpdateCreditCardPaymentInput {
  @Field(() => ID, { name: 'credit_card_id', nullable: true })
  @IsOptional()
  @IsUUID()
  credit_card_id?: string;

  @Field(() => ID, { name: 'payment_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => Date, { name: 'payment_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  payment_date?: Date;

  @Field(() => String, { name: 'payment_method', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...CREDIT_CARD_PAYMENT_METHODS])
  payment_method?: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
