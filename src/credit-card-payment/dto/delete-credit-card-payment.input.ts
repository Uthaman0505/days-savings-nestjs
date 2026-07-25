import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteCreditCardPaymentInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
