import { Field, InputType, Int } from '@nestjs/graphql';
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
import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from './create-goal.input';

@InputType()
export class UpdateGoalInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @Field(() => String, { name: 'goal_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_TYPES])
  goal_type?: string;

  @Field(() => Int, { name: 'target_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  target_amount_cents?: number;

  @Field(() => Int, { name: 'current_amount_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  current_amount_cents?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_PRIORITIES])
  priority?: string;

  @Field(() => String, { name: 'start_date', nullable: true })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @Field(() => String, { name: 'target_date', nullable: true })
  @IsOptional()
  @IsDateString()
  target_date?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_STATUSES])
  status?: string;
}
