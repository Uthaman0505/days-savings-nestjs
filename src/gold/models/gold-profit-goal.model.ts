import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldProfitGoal')
export class GoldProfitGoalModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int, { name: 'target_profit_cents' })
  targetProfitCents: number;

  @Field(() => String)
  status: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;

  @Field(() => Date, { name: 'achieved_at', nullable: true })
  achievedAt: Date | null;
}

@ObjectType('GoldProfitGoalStatus')
export class GoldProfitGoalStatusModel {
  @Field(() => GoldProfitGoalModel)
  goal: GoldProfitGoalModel;

  @Field(() => Int, { name: 'protected_capital_cents' })
  protectedCapitalCents: number;

  @Field(() => Int, { name: 'current_value_cents', nullable: true })
  currentValueCents: number | null;

  @Field(() => Int, { name: 'available_profit_cents', nullable: true })
  availableProfitCents: number | null;

  @Field(() => Int, { name: 'remaining_profit_cents', nullable: true })
  remainingProfitCents: number | null;

  @Field(() => Int, { name: 'required_portfolio_value_cents' })
  requiredPortfolioValueCents: number;

  @Field(() => Int, { name: 'required_pg_buy_per_gram_cents', nullable: true })
  requiredPgBuyPerGramCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_per_gram_cents', nullable: true })
  currentPgBuyPerGramCents: number | null;

  @Field(() => Int, { name: 'average_cost_per_gram_cents' })
  averageCostPerGramCents: number;

  @Field(() => Int, {
    name: 'distance_to_required_pg_buy_cents',
    nullable: true,
  })
  distanceToRequiredPgBuyCents: number | null;

  @Field(() => Float, {
    name: 'distance_to_required_pg_buy_percent',
    nullable: true,
  })
  distanceToRequiredPgBuyPercent: number | null;

  @Field(() => Float, { name: 'progress_percent', nullable: true })
  progressPercent: number | null;

  @Field(() => Int, { name: 'excess_profit_cents', nullable: true })
  excessProfitCents: number | null;

  @Field(() => Boolean, { name: 'is_target_reached' })
  isTargetReached: boolean;

  @Field(() => Boolean, { name: 'has_current_price' })
  hasCurrentPrice: boolean;

  @Field(() => Boolean, { name: 'has_holdings' })
  hasHoldings: boolean;

  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;
}
