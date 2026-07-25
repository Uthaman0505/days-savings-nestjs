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
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GOAL_CONTRIBUTION_SOURCES } from './contribute-goal.input';

@InputType()
export class WithdrawGoalInput {
  @Field(() => ID, { name: 'goal_id' })
  @IsUUID()
  goal_id: string;

  /** Destination for withdrawn funds: ACCOUNT or SAVINGS. */
  @Field(() => String, { name: 'destination_type' })
  @IsString()
  @IsIn([...GOAL_CONTRIBUTION_SOURCES])
  destination_type: string;

  @Field(() => ID, { name: 'account_id', nullable: true })
  @ValidateIf((o: WithdrawGoalInput) => o.destination_type === 'ACCOUNT')
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'savings_id', nullable: true })
  @ValidateIf((o: WithdrawGoalInput) => o.destination_type === 'SAVINGS')
  @IsUUID()
  savings_id?: string;

  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'withdrawal_date' })
  @Type(() => Date)
  @IsDate()
  withdrawal_date: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
