import { Field, ObjectType } from '@nestjs/graphql';
import { GoldExtractionItemModel } from './gold-extraction-item.model';
import { GoldPurchaseModel } from './gold.model';

@ObjectType('ConfirmGoldExtractionItemResult')
export class ConfirmGoldExtractionItemResultModel {
  @Field(() => GoldPurchaseModel)
  purchase: GoldPurchaseModel;

  @Field(() => GoldExtractionItemModel, { name: 'extraction_item' })
  extractionItem: GoldExtractionItemModel;

  @Field(() => [String], {
    description: 'Advisory warnings (e.g. logical duplicate reference).',
  })
  warnings: string[];
}
