import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldPriceHistoryPoint')
export class GoldPriceHistoryPointModel {
  @Field(() => ID)
  id: string;

  @Field(() => String, { name: 'price_date' })
  priceDate: string;

  @Field(() => Date, { name: 'captured_price_at', nullable: true })
  capturedPriceAt: Date | null;

  @Field(() => Date, { name: 'observed_at' })
  observedAt: Date;

  @Field(() => String, { name: 'malaysia_date' })
  malaysiaDate: string;

  @Field(() => Int, { name: 'pg_buy_price_per_gram_cents' })
  pgBuyPricePerGramCents: number;

  @Field(() => Int, { name: 'pg_sell_price_per_gram_cents' })
  pgSellPricePerGramCents: number;

  @Field(() => Int, { name: 'spread_cents' })
  spreadCents: number;

  @Field(() => Float, { name: 'spread_percent', nullable: true })
  spreadPercent: number | null;

  @Field(() => String)
  source: string;
}

@ObjectType('GoldPriceChange')
export class GoldPriceChangeModel {
  @Field(() => Int, { name: 'from_cents' })
  fromCents: number;

  @Field(() => Int, { name: 'to_cents' })
  toCents: number;

  @Field(() => Int, { name: 'change_cents' })
  changeCents: number;

  @Field(() => Float, { name: 'change_percent', nullable: true })
  changePercent: number | null;
}

@ObjectType('GoldPriceExtremum')
export class GoldPriceExtremumModel {
  @Field(() => Int, { name: 'price_cents' })
  priceCents: number;

  @Field(() => Date, { name: 'observed_at' })
  observedAt: Date;

  @Field(() => ID, { name: 'price_id' })
  priceId: string;
}

@ObjectType('GoldPriceSideStats')
export class GoldPriceSideStatsModel {
  @Field(() => Int, { name: 'start_cents' })
  startCents: number;

  @Field(() => Int, { name: 'latest_cents' })
  latestCents: number;

  @Field(() => GoldPriceChangeModel, { nullable: true })
  change: GoldPriceChangeModel | null;

  @Field(() => GoldPriceExtremumModel)
  high: GoldPriceExtremumModel;

  @Field(() => GoldPriceExtremumModel)
  low: GoldPriceExtremumModel;

  @Field(() => Int, { name: 'average_cents' })
  averageCents: number;
}

@ObjectType('GoldPriceDailyBar')
export class GoldPriceDailyBarModel {
  @Field(() => String, { name: 'malaysia_date' })
  malaysiaDate: string;

  @Field(() => Int, { name: 'opening_pg_buy_cents' })
  openingPgBuyCents: number;

  @Field(() => Int, { name: 'closing_pg_buy_cents' })
  closingPgBuyCents: number;

  @Field(() => Int, { name: 'high_pg_buy_cents' })
  highPgBuyCents: number;

  @Field(() => Int, { name: 'low_pg_buy_cents' })
  lowPgBuyCents: number;

  @Field(() => Int, { name: 'opening_pg_sell_cents' })
  openingPgSellCents: number;

  @Field(() => Int, { name: 'closing_pg_sell_cents' })
  closingPgSellCents: number;

  @Field(() => Int, { name: 'high_pg_sell_cents' })
  highPgSellCents: number;

  @Field(() => Int, { name: 'low_pg_sell_cents' })
  lowPgSellCents: number;

  @Field(() => Int, { name: 'sample_count' })
  sampleCount: number;
}

@ObjectType('GoldPriceDataQuality')
export class GoldPriceDataQualityModel {
  @Field(() => Int, { name: 'sample_count' })
  sampleCount: number;

  @Field(() => Date, { name: 'first_sample_at', nullable: true })
  firstSampleAt: Date | null;

  @Field(() => Date, { name: 'latest_sample_at', nullable: true })
  latestSampleAt: Date | null;

  @Field(() => Int, { name: 'days_with_data' })
  daysWithData: number;

  @Field(() => String, { name: 'requested_range' })
  requestedRange: string;

  @Field(() => String, { name: 'from_date', nullable: true })
  fromDate: string | null;

  @Field(() => String, { name: 'to_date', nullable: true })
  toDate: string | null;

  @Field(() => Boolean, { name: 'has_sufficient_history' })
  hasSufficientHistory: boolean;
}

@ObjectType('GoldPriceAnalytics')
export class GoldPriceAnalyticsModel {
  @Field(() => GoldPriceHistoryPointModel, { nullable: true })
  latest: GoldPriceHistoryPointModel | null;

  @Field(() => GoldPriceHistoryPointModel, { nullable: true })
  previous: GoldPriceHistoryPointModel | null;

  @Field(() => Int, { name: 'spread_cents', nullable: true })
  spreadCents: number | null;

  @Field(() => Float, { name: 'spread_percent', nullable: true })
  spreadPercent: number | null;

  @Field(() => GoldPriceChangeModel, {
    name: 'vs_previous_buy',
    nullable: true,
  })
  vsPreviousBuy: GoldPriceChangeModel | null;

  @Field(() => GoldPriceChangeModel, {
    name: 'vs_previous_sell',
    nullable: true,
  })
  vsPreviousSell: GoldPriceChangeModel | null;

  @Field(() => GoldPriceSideStatsModel, { name: 'pg_buy', nullable: true })
  pgBuy: GoldPriceSideStatsModel | null;

  @Field(() => GoldPriceSideStatsModel, { name: 'pg_sell', nullable: true })
  pgSell: GoldPriceSideStatsModel | null;

  @Field(() => Int, { name: 'average_spread_cents', nullable: true })
  averageSpreadCents: number | null;

  @Field(() => GoldPriceDataQualityModel, { name: 'data_quality' })
  dataQuality: GoldPriceDataQualityModel;

  @Field(() => [GoldPriceHistoryPointModel])
  history: GoldPriceHistoryPointModel[];

  @Field(() => [GoldPriceDailyBarModel])
  daily: GoldPriceDailyBarModel[];
}
