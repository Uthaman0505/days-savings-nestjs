import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldFutureProfitTaking')
export class GoldFutureProfitTakingModel {
  @Field(() => String, { name: 'executable_grams_to_sell', nullable: true })
  executableGramsToSell: string | null;

  @Field(() => Int, { name: 'estimated_sale_proceeds_cents', nullable: true })
  estimatedSaleProceedsCents: number | null;

  @Field(() => String, { name: 'remaining_grams', nullable: true })
  remainingGrams: string | null;

  @Field(() => Int, { name: 'remaining_value_cents', nullable: true })
  remainingValueCents: number | null;

  @Field(() => Int, { name: 'capital_buffer_cents', nullable: true })
  capitalBufferCents: number | null;

  @Field(() => Boolean, { name: 'capital_preserved', nullable: true })
  capitalPreserved: boolean | null;

  @Field(() => String, { name: 'theoretical_grams_to_sell', nullable: true })
  theoreticalGramsToSell: string | null;

  @Field(() => Boolean, { name: 'is_preview_allowed' })
  isPreviewAllowed: boolean;

  @Field(() => String, { name: 'blocking_reason', nullable: true })
  blockingReason: string | null;
}

@ObjectType('GoldFutureScenario')
export class GoldFutureScenarioModel {
  @Field(() => Int, { name: 'future_pg_buy_per_gram_cents' })
  futurePgBuyPerGramCents: number;

  @Field(() => String, { name: 'scenario_status' })
  scenarioStatus: string;

  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;

  @Field(() => Int, { name: 'protected_capital_cents' })
  protectedCapitalCents: number;

  @Field(() => Int, { name: 'future_portfolio_value_cents' })
  futurePortfolioValueCents: number;

  @Field(() => Int, { name: 'future_available_profit_cents' })
  futureAvailableProfitCents: number;

  @Field(() => Int, { name: 'future_remaining_profit_cents', nullable: true })
  futureRemainingProfitCents: number | null;

  @Field(() => Int, { name: 'future_excess_profit_cents', nullable: true })
  futureExcessProfitCents: number | null;

  @Field(() => Float, { name: 'progress_percent', nullable: true })
  progressPercent: number | null;

  @Field(() => Boolean, { name: 'is_target_reached' })
  isTargetReached: boolean;

  @Field(() => Boolean, { name: 'has_active_goal' })
  hasActiveGoal: boolean;

  @Field(() => Boolean, { name: 'has_holdings' })
  hasHoldings: boolean;

  @Field(() => Boolean, { name: 'has_monthly_budget' })
  hasMonthlyBudget: boolean;

  @Field(() => Int, { name: 'monthly_budget_cents', nullable: true })
  monthlyBudgetCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_cents', nullable: true })
  currentPgBuyCents: number | null;

  @Field(() => Int, { name: 'current_required_pg_buy_cents', nullable: true })
  currentRequiredPgBuyCents: number | null;

  @Field(() => Int, { name: 'target_profit_cents', nullable: true })
  targetProfitCents: number | null;

  @Field(() => String, { name: 'target_price_relationship', nullable: true })
  targetPriceRelationship: string | null;

  @Field(() => Int, {
    name: 'future_pg_buy_minus_required_cents',
    nullable: true,
  })
  futurePgBuyMinusRequiredCents: number | null;

  @Field(() => [Int], { name: 'suggested_comparison_prices_cents' })
  suggestedComparisonPricesCents: number[];

  @Field(() => Boolean, { name: 'planned_purchase_available' })
  plannedPurchaseAvailable: boolean;

  @Field(() => String, {
    name: 'planned_purchase_unavailable_reason',
    nullable: true,
  })
  plannedPurchaseUnavailableReason: string | null;

  @Field(() => Int, { name: 'deployment_percent', nullable: true })
  deploymentPercent: number | null;

  @Field(() => Int, { name: 'deployment_cents', nullable: true })
  deploymentCents: number | null;

  @Field(() => String, { name: 'estimated_new_grams', nullable: true })
  estimatedNewGrams: string | null;

  @Field(() => String, { name: 'post_buy_total_grams', nullable: true })
  postBuyTotalGrams: string | null;

  @Field(() => Int, {
    name: 'post_buy_protected_capital_cents',
    nullable: true,
  })
  postBuyProtectedCapitalCents: number | null;

  @Field(() => Int, { name: 'post_buy_required_pg_buy_cents', nullable: true })
  postBuyRequiredPgBuyCents: number | null;

  @Field(() => Int, { name: 'future_value_after_buy_cents', nullable: true })
  futureValueAfterBuyCents: number | null;

  @Field(() => Int, {
    name: 'future_available_profit_after_buy_cents',
    nullable: true,
  })
  futureAvailableProfitAfterBuyCents: number | null;

  @Field(() => Int, {
    name: 'future_remaining_profit_after_buy_cents',
    nullable: true,
  })
  futureRemainingProfitAfterBuyCents: number | null;

  @Field(() => Int, {
    name: 'future_excess_profit_after_buy_cents',
    nullable: true,
  })
  futureExcessProfitAfterBuyCents: number | null;

  @Field(() => Float, {
    name: 'future_progress_after_buy_percent',
    nullable: true,
  })
  futureProgressAfterBuyPercent: number | null;

  @Field(() => Boolean, {
    name: 'future_target_reached_after_buy',
    nullable: true,
  })
  futureTargetReachedAfterBuy: boolean | null;

  @Field(() => String, { name: 'future_status_after_buy', nullable: true })
  futureStatusAfterBuy: string | null;

  @Field(() => Int, { name: 'change_in_future_value_cents', nullable: true })
  changeInFutureValueCents: number | null;

  @Field(() => Int, { name: 'change_in_future_profit_cents', nullable: true })
  changeInFutureProfitCents: number | null;

  @Field(() => Float, { name: 'change_in_progress_percent', nullable: true })
  changeInProgressPercent: number | null;

  @Field(() => Boolean, {
    name: 'helps_reach_target_at_this_price',
    nullable: true,
  })
  helpsReachTargetAtThisPrice: boolean | null;

  @Field(() => String, { name: 'executable_grams_to_sell', nullable: true })
  executableGramsToSell: string | null;

  @Field(() => Int, { name: 'estimated_sale_proceeds_cents', nullable: true })
  estimatedSaleProceedsCents: number | null;

  @Field(() => String, { name: 'remaining_grams', nullable: true })
  remainingGrams: string | null;

  @Field(() => Int, { name: 'remaining_value_cents', nullable: true })
  remainingValueCents: number | null;

  @Field(() => Int, { name: 'capital_buffer_cents', nullable: true })
  capitalBufferCents: number | null;

  @Field(() => Boolean, { name: 'capital_preserved', nullable: true })
  capitalPreserved: boolean | null;

  @Field(() => GoldFutureProfitTakingModel, { name: 'profit_taking' })
  profitTaking: GoldFutureProfitTakingModel;

  @Field(() => GoldFutureProfitTakingModel, {
    name: 'profit_taking_after_buy',
    nullable: true,
  })
  profitTakingAfterBuy: GoldFutureProfitTakingModel | null;
}

@ObjectType('GoldFutureScenarioComparison')
export class GoldFutureScenarioComparisonModel {
  @Field(() => Int, { name: 'monthly_budget_cents', nullable: true })
  monthlyBudgetCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_cents', nullable: true })
  currentPgBuyCents: number | null;

  @Field(() => Int, { name: 'current_required_pg_buy_cents', nullable: true })
  currentRequiredPgBuyCents: number | null;

  @Field(() => Boolean, { name: 'has_active_goal' })
  hasActiveGoal: boolean;

  @Field(() => Boolean, { name: 'has_holdings' })
  hasHoldings: boolean;

  @Field(() => Boolean, { name: 'has_monthly_budget' })
  hasMonthlyBudget: boolean;

  @Field(() => Int, { name: 'planned_deployment_percent', nullable: true })
  plannedDeploymentPercent: number | null;

  @Field(() => [Int], { name: 'suggested_comparison_prices_cents' })
  suggestedComparisonPricesCents: number[];

  @Field(() => [GoldFutureScenarioModel])
  scenarios: GoldFutureScenarioModel[];
}
