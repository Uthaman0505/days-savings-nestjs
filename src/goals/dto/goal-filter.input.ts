import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from './create-goal.input';

export const GOAL_SORT_ORDERS = ['NEWEST', 'OLDEST'] as const;

@InputType()
export class GoalFilterInput {
  @Field(() => String, { name: 'goal_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_TYPES])
  goal_type?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_PRIORITIES])
  priority?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_STATUSES])
  status?: string;

  @Field(() => String, { name: 'target_date_from', nullable: true })
  @IsOptional()
  @IsDateString()
  target_date_from?: string;

  @Field(() => String, { name: 'target_date_to', nullable: true })
  @IsOptional()
  @IsDateString()
  target_date_to?: string;

  @Field(() => String, {
    name: 'sort_order',
    nullable: true,
    defaultValue: 'NEWEST',
  })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_SORT_ORDERS])
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

@InputType()
export class GoalContributionFilterInput {
  @Field(() => ID, { name: 'goal_id', nullable: true })
  @IsOptional()
  @IsUUID()
  goal_id?: string;

  @Field(() => String, {
    name: 'sort_order',
    nullable: true,
    defaultValue: 'NEWEST',
  })
  @IsOptional()
  @IsString()
  @IsIn([...GOAL_SORT_ORDERS])
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
