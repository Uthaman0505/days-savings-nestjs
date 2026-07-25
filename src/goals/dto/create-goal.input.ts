import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export const GOAL_TYPES = [
  'EMERGENCY',
  'TRAVEL',
  'HOUSE',
  'CAR',
  'EDUCATION',
  'RETIREMENT',
  'BUSINESS',
  'GADGET',
  'CUSTOM',
] as const;

export const GOAL_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

@InputType()
export class CreateGoalInput {
  @Field(() => String)
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => String, { name: 'goal_type' })
  @IsString()
  @IsIn([...GOAL_TYPES])
  goal_type: string;

  @Field(() => Int, { name: 'target_amount_cents' })
  @IsInt()
  @Min(1)
  target_amount_cents: number;

  @Field(() => Int, {
    name: 'current_amount_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_amount_cents?: number;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MYR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, {
    nullable: true,
    defaultValue: 'MEDIUM',
  })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_PRIORITIES])
  priority?: string;

  @Field(() => String, { name: 'start_date' })
  @IsDateString()
  start_date: string;

  @Field(() => String, { name: 'target_date' })
  @IsDateString()
  target_date: string;
}
