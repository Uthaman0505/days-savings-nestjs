import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteGoalInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
