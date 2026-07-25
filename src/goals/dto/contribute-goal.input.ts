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

export const GOAL_CONTRIBUTION_SOURCES = ['ACCOUNT', 'SAVINGS'] as const;

@InputType()
export class ContributeGoalInput {
  @Field(() => ID, { name: 'goal_id' })
  @IsUUID()
  goal_id: string;

  @Field(() => String, { name: 'source_type' })
  @IsString()
  @IsIn([...GOAL_CONTRIBUTION_SOURCES])
  source_type: string;

  @Field(() => ID, { name: 'account_id', nullable: true })
  @ValidateIf((o: ContributeGoalInput) => o.source_type === 'ACCOUNT')
  @IsUUID()
  account_id?: string;

  @Field(() => ID, { name: 'savings_id', nullable: true })
  @ValidateIf((o: ContributeGoalInput) => o.source_type === 'SAVINGS')
  @IsUUID()
  savings_id?: string;

  @Field(() => ID, { name: 'category_id' })
  @IsUUID()
  category_id: string;

  @Field(() => Int, { name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @Field(() => Date, { name: 'contribution_date' })
  @Type(() => Date)
  @IsDate()
  contribution_date: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
