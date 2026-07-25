import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class RunRecurringTransactionNowInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
