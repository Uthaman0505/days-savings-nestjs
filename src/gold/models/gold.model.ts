import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldPurchase')
export class GoldPurchaseModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'purchase_date' })
  purchaseDate: string;

  @Field(() => String, { name: 'weight_grams' })
  weightGrams: string;

  @Field(() => Int, { name: 'amount_paid_cents' })
  amountPaidCents: number;

  @Field(() => Int, { name: 'price_per_gram_cents' })
  pricePerGramCents: number;

  @Field(() => String)
  source: string;

  @Field(() => String, { name: 'reference_number', nullable: true })
  referenceNumber: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Int, { name: 'current_value_cents', nullable: true })
  currentValueCents: number | null;

  @Field(() => Int, { name: 'unrealized_pl_cents', nullable: true })
  unrealizedPlCents: number | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('GoldPrice')
export class GoldPriceModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'price_date' })
  priceDate: string;

  @Field(() => Int, { name: 'pg_buy_price_per_gram_cents' })
  pgBuyPricePerGramCents: number;

  @Field(() => Int, { name: 'pg_sell_price_per_gram_cents' })
  pgSellPricePerGramCents: number;

  @Field(() => String)
  source: string;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'captured_price_at', nullable: true })
  capturedPriceAt: Date | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('GoldDashboard')
export class GoldDashboardModel {
  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;

  @Field(() => Int, { name: 'total_invested_cents' })
  totalInvestedCents: number;

  @Field(() => Int, { name: 'average_cost_per_gram_cents' })
  averageCostPerGramCents: number;

  @Field(() => Int, {
    name: 'current_pg_buy_price_per_gram_cents',
    nullable: true,
  })
  currentPgBuyPricePerGramCents: number | null;

  @Field(() => Int, {
    name: 'current_pg_sell_price_per_gram_cents',
    nullable: true,
  })
  currentPgSellPricePerGramCents: number | null;

  /** Mark-to-market using PG BUY (liquidation). */
  @Field(() => Int, { name: 'current_value_cents' })
  currentValueCents: number;

  @Field(() => Int, { name: 'unrealized_pl_cents' })
  unrealizedPlCents: number;

  @Field(() => Float, { name: 'unrealized_pl_percent' })
  unrealizedPlPercent: number;

  @Field(() => Int, { name: 'purchase_count' })
  purchaseCount: number;

  @Field(() => String, { name: 'price_as_of', nullable: true })
  priceAsOf: string | null;

  @Field(() => Boolean, { name: 'has_price' })
  hasPrice: boolean;
}
