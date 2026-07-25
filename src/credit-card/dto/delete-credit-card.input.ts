import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteCreditCardInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
