import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class ArchiveCreditCardInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
