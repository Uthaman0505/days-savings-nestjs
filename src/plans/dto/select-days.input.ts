import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

@InputType()
export class SelectDaysInput {
  // Validate the raw GraphQL input key directly (`total_days`).
  // This avoids relying on class-transformer name mapping.
  @Field(() => Int)
  @IsInt()
  @Min(1)
  total_days: number;
}
