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
import { CATEGORY_TYPES } from './create-category.input';

@InputType()
export class UpdateCategoryInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...CATEGORY_TYPES])
  type?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @Field(() => Int, { name: 'display_order', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @Field(() => Boolean, { name: 'is_default', nullable: true })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
