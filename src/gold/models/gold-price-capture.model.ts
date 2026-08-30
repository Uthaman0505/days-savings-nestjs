import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldPriceScreenshot')
export class GoldPriceScreenshotModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'capture_id' })
  captureId: string;

  @Field(() => String)
  side: string;

  @Field(() => String, { nullable: true, name: 'screen_type' })
  screenType: string | null;

  @Field(() => String, { name: 'original_file_name' })
  originalFileName: string;

  @Field(() => String, { name: 'mime_type' })
  mimeType: string;

  @Field(() => Int, { name: 'file_size_bytes' })
  fileSizeBytes: number;

  @Field(() => Int, {
    nullable: true,
    name: 'extracted_pg_price_per_gram_cents',
  })
  extractedPgPricePerGramCents: number | null;

  @Field(() => Date, { nullable: true, name: 'extracted_updated_at' })
  extractedUpdatedAt: Date | null;

  @Field(() => String, { name: 'extraction_status' })
  extractionStatus: string;

  @Field(() => String, { nullable: true, name: 'extraction_error' })
  extractionError: string | null;

  @Field(() => [String])
  warnings: string[];

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('GoldPriceCapture')
export class GoldPriceCaptureModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String)
  status: string;

  @Field(() => Int, { nullable: true, name: 'pg_buy_price_per_gram_cents' })
  pgBuyPricePerGramCents: number | null;

  @Field(() => Int, { nullable: true, name: 'pg_sell_price_per_gram_cents' })
  pgSellPricePerGramCents: number | null;

  @Field(() => Int, { nullable: true, name: 'spread_per_gram_cents' })
  spreadPerGramCents: number | null;

  @Field(() => Date, { nullable: true, name: 'captured_price_at' })
  capturedPriceAt: Date | null;

  @Field(() => String, { nullable: true, name: 'price_date' })
  priceDate: string | null;

  @Field(() => [String])
  warnings: string[];

  @Field(() => String, { nullable: true, name: 'extraction_error' })
  extractionError: string | null;

  @Field(() => ID, { nullable: true, name: 'confirmed_gold_price_id' })
  confirmedGoldPriceId: string | null;

  @Field(() => GoldPriceScreenshotModel, {
    nullable: true,
    name: 'buy_screenshot',
  })
  buyScreenshot: GoldPriceScreenshotModel | null;

  @Field(() => GoldPriceScreenshotModel, {
    nullable: true,
    name: 'sell_screenshot',
  })
  sellScreenshot: GoldPriceScreenshotModel | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('GoldPriceScreenshotUploadResult')
export class GoldPriceScreenshotUploadResultModel {
  @Field(() => GoldPriceCaptureModel)
  capture: GoldPriceCaptureModel;

  @Field(() => ID, { name: 'screenshot_id' })
  screenshotId: string;

  @Field(() => Boolean)
  duplicate: boolean;
}
