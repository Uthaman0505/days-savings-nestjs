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

export const TRANSFER_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class TransferFilterInput {
  @Field(() => ID, { name: 'from_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  from_account_id?: string;

  @Field(() => ID, { name: 'to_account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  to_account_id?: string;

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
  @IsIn([...TRANSFER_SORT_ORDERS])
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
