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
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from './create-transaction.input';

@InputType()
export class UpdateTransactionInput {
  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => String, { name: 'transaction_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...TRANSACTION_TYPES])
  transaction_type?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => Date, { name: 'transaction_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transaction_date?: Date;

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

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...TRANSACTION_STATUSES])
  status?: string;
}
