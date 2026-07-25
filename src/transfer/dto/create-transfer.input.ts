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
export class CreateTransferInput {
  @Field(() => ID, { name: 'from_account_id' })
  @IsUUID()
  from_account_id: string;

  @Field(() => ID, { name: 'to_account_id' })
  @IsUUID()
  to_account_id: string;

  /** Category used on both TRANSFER_OUT and TRANSFER_IN ledger rows. */
  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'transfer_date' })
  @Type(() => Date)
  @IsDate()
  transfer_date: Date;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
