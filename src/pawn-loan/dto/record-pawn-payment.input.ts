import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAWN_PAYMENT_METHODS, PAWN_PAYMENT_TYPES } from '../pawn-loan.enums';

@InputType()
export class RecordPawnPaymentInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => String, { name: 'payment_type' })
  @IsString()
  @IsIn([...PAWN_PAYMENT_TYPES])
  payment_type: string;

  @Field(() => GraphQLISODateTime, { name: 'payment_date' })
  @Type(() => Date)
  @IsDate()
  payment_date: Date;

  @Field(() => Int, {
    name: 'principal_paid_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  principal_paid_cents?: number;

  @Field(() => Int, {
    name: 'interest_paid_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  interest_paid_cents?: number;

  @Field(() => String, { name: 'payment_method' })
  @IsString()
  @IsIn([...PAWN_PAYMENT_METHODS])
  payment_method: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference_number?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  remarks?: string;
}
