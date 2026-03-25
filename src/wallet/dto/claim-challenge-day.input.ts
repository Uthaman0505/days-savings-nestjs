import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

@InputType()
export class ClaimChallengeDayInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  day_number: number;
}
