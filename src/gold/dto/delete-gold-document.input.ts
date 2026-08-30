import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteGoldDocumentInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
