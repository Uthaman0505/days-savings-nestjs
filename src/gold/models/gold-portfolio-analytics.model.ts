import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldPortfolioSummary')
export class GoldPortfolioSummaryModel {
  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;

  @Field(() => Int, { name: 'total_invested_cents' })
  totalInvestedCents: number;

  @Field(() => Int, { name: 'average_cost_per_gram_cents' })
  averageCostPerGramCents: number;

  @Field(() => Int, { name: 'purchase_count' })
  purchaseCount: number;

  @Field(() => Boolean, { name: 'has_grams' })
  hasGrams: boolean;

  @Field(() => Boolean, { name: 'has_price' })
  hasPrice: boolean;

  @Field(() => Int, {
    name: 'current_pg_buy_cents',
    nullable: true,
  })
  currentPgBuyCents: number | null;

  @Field(() => Int, {
    name: 'current_pg_sell_cents',
    nullable: true,
  })
  currentPgSellCents: number | null;

  @Field(() => Int, { name: 'current_value_cents', nullable: true })
  currentValueCents: number | null;

  @Field(() => Int, { name: 'unrealized_pl_cents', nullable: true })
  unrealizedPlCents: number | null;

  @Field(() => Float, { name: 'unrealized_pl_percent', nullable: true })
  unrealizedPlPercent: number | null;

  /** max(0, unrealized P/L). Descriptive excess only — not a profit-goal field. */
  @Field(() => Int, { name: 'unrealized_excess_cents', nullable: true })
  unrealizedExcessCents: number | null;

  @Field(() => String, { name: 'price_as_of', nullable: true })
  priceAsOf: string | null;
}

@ObjectType('GoldPortfolioBreakEven')
export class GoldPortfolioBreakEvenModel {
  @Field(() => Int, { name: 'break_even_pg_buy_cents' })
  breakEvenPgBuyCents: number;

  @Field(() => Int, { name: 'current_pg_buy_cents', nullable: true })
  currentPgBuyCents: number | null;

  @Field(() => Int, { name: 'distance_to_break_even_cents', nullable: true })
  distanceToBreakEvenCents: number | null;

  @Field(() => Float, {
    name: 'distance_to_break_even_percent',
    nullable: true,
  })
  distanceToBreakEvenPercent: number | null;

  @Field(() => Boolean, { name: 'is_above_break_even', nullable: true })
  isAboveBreakEven: boolean | null;
}

@ObjectType('GoldPurchasePerformance')
export class GoldPurchasePerformanceModel {
  @Field(() => ID)
  id: string;

  @Field(() => String, { name: 'purchase_date' })
  purchaseDate: string;

  @Field(() => String, { name: 'weight_grams' })
  weightGrams: string;

  @Field(() => Int, { name: 'invested_cents' })
  investedCents: number;

  @Field(() => Int, { name: 'acquisition_price_per_gram_cents' })
  acquisitionPricePerGramCents: number;

  @Field(() => Int, { name: 'current_value_cents', nullable: true })
  currentValueCents: number | null;

  @Field(() => Int, { name: 'unrealized_pl_cents', nullable: true })
  unrealizedPlCents: number | null;

  @Field(() => Float, { name: 'unrealized_pl_percent', nullable: true })
  unrealizedPlPercent: number | null;

  @Field(() => Int, { name: 'pg_buy_vs_acquisition_cents', nullable: true })
  pgBuyVsAcquisitionCents: number | null;

  @Field(() => String)
  source: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;
}

@ObjectType('GoldPortfolioHistoryPoint')
export class GoldPortfolioHistoryPointModel {
  @Field(() => Date, { name: 'observed_at' })
  observedAt: Date;

  @Field(() => String, { name: 'malaysia_date' })
  malaysiaDate: string;

  @Field(() => ID, { name: 'price_id' })
  priceId: string;

  @Field(() => String, { name: 'holdings_grams' })
  holdingsGrams: string;

  @Field(() => Int, { name: 'invested_cents' })
  investedCents: number;

  @Field(() => Int, { name: 'pg_buy_cents' })
  pgBuyCents: number;

  @Field(() => Int, { name: 'portfolio_value_cents' })
  portfolioValueCents: number;

  @Field(() => Int, { name: 'unrealized_pl_cents' })
  unrealizedPlCents: number;
}

@ObjectType('GoldPortfolioDailyPoint')
export class GoldPortfolioDailyPointModel {
  @Field(() => String, { name: 'malaysia_date' })
  malaysiaDate: string;

  @Field(() => String, { name: 'holdings_grams' })
  holdingsGrams: string;

  @Field(() => Int, { name: 'invested_cents' })
  investedCents: number;

  @Field(() => Int, { name: 'pg_buy_cents' })
  pgBuyCents: number;

  @Field(() => Int, { name: 'portfolio_value_cents' })
  portfolioValueCents: number;

  @Field(() => Int, { name: 'unrealized_pl_cents' })
  unrealizedPlCents: number;

  @Field(() => Int, { name: 'sample_count' })
  sampleCount: number;
}

@ObjectType('GoldPortfolioGrowthPoint')
export class GoldPortfolioGrowthPointModel {
  @Field(() => String)
  date: string;

  @Field(() => String, { name: 'holdings_grams' })
  holdingsGrams: string;

  @Field(() => Int, { name: 'invested_cents' })
  investedCents: number;
}

@ObjectType('GoldPortfolioDataQuality')
export class GoldPortfolioDataQualityModel {
  @Field(() => Int, { name: 'price_sample_count' })
  priceSampleCount: number;

  @Field(() => Int, { name: 'purchase_count' })
  purchaseCount: number;

  @Field(() => String, { name: 'first_portfolio_date', nullable: true })
  firstPortfolioDate: string | null;

  @Field(() => Date, { name: 'latest_price_at', nullable: true })
  latestPriceAt: Date | null;

  @Field(() => Int, { name: 'days_with_price_data' })
  daysWithPriceData: number;

  @Field(() => Boolean, { name: 'has_current_price' })
  hasCurrentPrice: boolean;

  @Field(() => Boolean, { name: 'has_sufficient_history' })
  hasSufficientHistory: boolean;

  @Field(() => String, { name: 'requested_range' })
  requestedRange: string;

  @Field(() => String, { name: 'from_date', nullable: true })
  fromDate: string | null;

  @Field(() => String, { name: 'to_date', nullable: true })
  toDate: string | null;

  @Field(() => String, { name: 'history_note' })
  historyNote: string;
}

@ObjectType('GoldPortfolioAnalytics')
export class GoldPortfolioAnalyticsModel {
  @Field(() => GoldPortfolioSummaryModel)
  summary: GoldPortfolioSummaryModel;

  @Field(() => GoldPortfolioBreakEvenModel, {
    name: 'break_even',
    nullable: true,
  })
  breakEven: GoldPortfolioBreakEvenModel | null;

  @Field(() => [GoldPurchasePerformanceModel], {
    name: 'purchase_performance',
  })
  purchasePerformance: GoldPurchasePerformanceModel[];

  @Field(() => GoldPurchasePerformanceModel, {
    name: 'highest_return_purchase',
    nullable: true,
  })
  highestReturnPurchase: GoldPurchasePerformanceModel | null;

  @Field(() => GoldPurchasePerformanceModel, {
    name: 'lowest_return_purchase',
    nullable: true,
  })
  lowestReturnPurchase: GoldPurchasePerformanceModel | null;

  @Field(() => [GoldPortfolioHistoryPointModel])
  history: GoldPortfolioHistoryPointModel[];

  @Field(() => [GoldPortfolioDailyPointModel])
  daily: GoldPortfolioDailyPointModel[];

  @Field(() => [GoldPortfolioGrowthPointModel], { name: 'holdings_growth' })
  holdingsGrowth: GoldPortfolioGrowthPointModel[];

  @Field(() => [GoldPortfolioGrowthPointModel], { name: 'invested_growth' })
  investedGrowth: GoldPortfolioGrowthPointModel[];

  @Field(() => GoldPortfolioDataQualityModel, { name: 'data_quality' })
  dataQuality: GoldPortfolioDataQualityModel;
}
