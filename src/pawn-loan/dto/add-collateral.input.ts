import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAWN_COLLATERAL_ITEM_TYPES,
  PAWN_COLLATERAL_STATUSES,
} from '../pawn-loan.enums';
import { CreatePawnCollateralInput } from './create-pawn-loan.input';

@InputType()
export class AddCollateralInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => CreatePawnCollateralInput)
  collateral: CreatePawnCollateralInput;
}

@InputType()
export class UpdateCollateralInput {
  @Field(() => String, { name: 'item_type', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_COLLATERAL_ITEM_TYPES])
  item_type?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @Field(() => String, { name: 'owner_name', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  owner_name?: string;

  @Field(() => Int, { name: 'estimated_value_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimated_value_cents?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @Field(() => String, { name: 'serial_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serial_number?: string | null;

  @Field(() => [String], { name: 'image_urls', nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  image_urls?: string[] | null;

  @Field(() => String, { name: 'current_status', nullable: true })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_COLLATERAL_STATUSES])
  current_status?: string;
}
