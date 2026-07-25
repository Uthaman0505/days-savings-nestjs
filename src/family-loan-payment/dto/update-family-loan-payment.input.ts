import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class UpdateFamilyLoanPaymentInput {
  @Field(() => ID, { name: 'family_loan_id', nullable: true })
  @IsOptional()
  @IsUUID()
  family_loan_id?: string;

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
