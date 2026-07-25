import { Field, GraphQLISODateTime, ID, InputType } from '@nestjs/graphql';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAWN_PAYMENT_METHODS } from '../pawn-loan.enums';

@InputType()
export class RedeemPawnLoanInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => GraphQLISODateTime, { name: 'payment_date' })
  @Type(() => Date)
  @IsDate()
  payment_date: Date;

  @Field(() => String, {
    name: 'payment_method',
    nullable: true,
    defaultValue: 'CASH',
  })
  @IsOptional()
  @IsString()
  @IsIn([...PAWN_PAYMENT_METHODS])
  payment_method?: string;

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

@InputType()
export class ForfeitPawnLoanInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  remarks?: string;
}

@InputType()
export class UpdatePawnLoanStatusInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => String)
  @IsString()
  status: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  remarks?: string;
}

@InputType()
export class DeletePawnLoanInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
