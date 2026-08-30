import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class RejectGoldExtractionItemInput {
  @Field(() => ID, { name: 'extraction_item_id' })
  @IsUUID()
  extraction_item_id: string;
}
