import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PAWN_LOAN_STATUSES } from '../pawn-loan.enums';

export const PAWN_LOAN_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class PawnLoanFilterInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_LOAN_STATUSES])
  status?: string;

  @Field(() => String, { name: 'pawn_shop_name', nullable: true })
  @IsOptional()
  @IsString()
  pawn_shop_name?: string;

  @Field(() => String, { name: 'start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @Field(() => String, { name: 'end_date', nullable: true })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @Field(() => String, {
    name: 'sort_order',
    nullable: true,
    defaultValue: 'NEWEST',
  })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_LOAN_SORT_ORDERS])
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
