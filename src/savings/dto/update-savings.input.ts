import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { SAVING_TYPES, SAVINGS_STATUSES } from './create-savings.input';

@InputType()
export class UpdateSavingsInput {
  @Field(() => ID, { name: 'account_id', nullable: true })
  @IsOptional()
  @IsUUID()
  account_id?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @Field(() => String, { name: 'saving_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...SAVING_TYPES])
  saving_type?: string;

  @Field(() => Int, { name: 'target_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  target_amount_cents?: number | null;

  @Field(() => Int, { name: 'current_balance_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_balance_cents?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { name: 'start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @Field(() => String, { name: 'target_date', nullable: true })
  @IsOptional()
  @IsDateString()
  target_date?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...SAVINGS_STATUSES])
  status?: string;
}
