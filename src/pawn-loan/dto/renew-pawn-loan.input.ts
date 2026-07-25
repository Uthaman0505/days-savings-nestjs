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
import { PAWN_PAYMENT_METHODS } from '../pawn-loan.enums';

@InputType()
export class RenewPawnLoanInput {
  @Field(() => ID, { name: 'pawn_loan_id' })
  @IsUUID()
  pawn_loan_id: string;

  @Field(() => GraphQLISODateTime, { name: 'renewal_date' })
  @Type(() => Date)
  @IsDate()
  renewal_date: Date;

  @Field(() => Int, { name: 'interest_paid_cents' })
  @IsInt()
  @Min(0)
  interest_paid_cents: number;

  @Field(() => Int, {
    name: 'principal_reduction_cents',
    nullable: true,
    defaultValue: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  principal_reduction_cents?: number;

  @Field(() => Int, {
    name: 'loan_term_months',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  loan_term_months?: number;

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
