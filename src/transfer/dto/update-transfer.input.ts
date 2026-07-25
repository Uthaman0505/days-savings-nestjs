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
export class UpdateTransferInput {
  @Field(() => ID, { name: 'from_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  from_account_id?: string;

  @Field(() => ID, { name: 'to_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  to_account_id?: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;

  @Field(() => Date, { name: 'transfer_date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transfer_date?: Date;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
