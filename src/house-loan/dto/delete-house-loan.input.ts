import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class DeleteHouseLoanInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
