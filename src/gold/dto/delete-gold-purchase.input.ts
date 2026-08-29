import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteGoldPurchaseInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
