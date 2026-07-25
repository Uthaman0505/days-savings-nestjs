import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export const CATEGORY_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'LOAN',
  'INSURANCE',
  'SAVING',
  'INVESTMENT',
  'GOAL',
  'OTHER',
] as const;

@InputType()
export class CreateCategoryInput {
  @Field(() => String)
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Field(() => String)
  @IsString()
  @IsIn([...CATEGORY_TYPES])
  type: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @Field(() => Int, { name: 'display_order', nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @Field(() => Boolean, { name: 'is_default', nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
