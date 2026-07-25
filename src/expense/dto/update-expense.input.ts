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
export class UpdateExpenseInput {
  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => Date, { name: 'expense_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expense_date?: Date;

  @Field(() => String, { name: 'merchant_name', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchant_name?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

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
