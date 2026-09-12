import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { GoldPriceDataQualityModel } from './gold-price-analytics.model';

@ObjectType('GoldPlanningSettings')
export class GoldPlanningSettingsModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int, { name: 'monthly_budget_cents' })
  monthlyBudgetCents: number;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('GoldBuyScenario')
export class GoldBuyScenarioModel {
  @Field(() => Int, { name: 'deployment_percent' })
  deploymentPercent: number;

  @Field(() => Int, { name: 'deployment_cents' })
  deploymentCents: number;

  @Field(() => Int, { name: 'acquisition_pg_sell_cents', nullable: true })
  acquisitionPgSellCents: number | null;

  @Field(() => String, { name: 'estimated_new_grams' })
  estimatedNewGrams: string;

  @Field(() => String, { name: 'post_buy_total_grams' })
  postBuyTotalGrams: string;

  @Field(() => Int, { name: 'post_buy_protected_capital_cents' })
  postBuyProtectedCapitalCents: number;

  @Field(() => Int, {
    name: 'post_buy_required_portfolio_value_cents',
    nullable: true,
  })
  postBuyRequiredPortfolioValueCents: number | null;

  @Field(() => Int, { name: 'post_buy_required_pg_buy_cents', nullable: true })
  postBuyRequiredPgBuyCents: number | null;

  @Field(() => Int, { name: 'required_pg_buy_change_cents', nullable: true })
  requiredPgBuyChangeCents: number | null;

  @Field(() => Float, {
    name: 'required_pg_buy_change_percent',
    nullable: true,
  })
  requiredPgBuyChangePercent: number | null;

  @Field(() => String, { name: 'target_impact' })
  targetImpact: string;

  @Field(() => Int, { name: 'immediate_spread_cost_cents', nullable: true })
  immediateSpreadCostCents: number | null;
}

@ObjectType('GoldGoalDecision')
export class GoldGoalDecisionModel {
  @Field(() => String)
  signal: string;

  @Field(() => String, { name: 'rule_code' })
  ruleCode: string;

  @Field(() => String)
  headline: string;

  @Field(() => String, { name: 'primary_reason' })
  primaryReason: string;

  @Field(() => [String], { name: 'supporting_reasons' })
  supportingReasons: string[];

  @Field(() => [String], { name: 'caution_reasons' })
  cautionReasons: string[];

  @Field(() => Int, { name: 'monthly_budget_cents', nullable: true })
  monthlyBudgetCents: number | null;

  @Field(() => Int, { name: 'recommended_deployment_cents', nullable: true })
  recommendedDeploymentCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_cents', nullable: true })
  currentPgBuyCents: number | null;

  @Field(() => Int, { name: 'current_pg_sell_cents', nullable: true })
  currentPgSellCents: number | null;

  @Field(() => Int, { name: 'spread_cents', nullable: true })
  spreadCents: number | null;

  @Field(() => Float, { name: 'spread_percent', nullable: true })
  spreadPercent: number | null;

  @Field(() => Int, { name: 'target_profit_cents', nullable: true })
  targetProfitCents: number | null;

  @Field(() => Int, { name: 'protected_capital_cents' })
  protectedCapitalCents: number;

  @Field(() => Int, { name: 'current_required_pg_buy_cents', nullable: true })
  currentRequiredPgBuyCents: number | null;

  @Field(() => Float, { name: 'progress_percent', nullable: true })
  progressPercent: number | null;

  @Field(() => String)
  trend: string;

  @Field(() => String, { name: 'spread_quality' })
  spreadQuality: string;

  @Field(() => Float, {
    name: 'recent_price_position_percent',
    nullable: true,
  })
  recentPricePositionPercent: number | null;

  @Field(() => GoldPriceDataQualityModel, { name: 'data_quality' })
  dataQuality: GoldPriceDataQualityModel;

  @Field(() => Boolean, { name: 'has_active_goal' })
  hasActiveGoal: boolean;

  @Field(() => Boolean, { name: 'has_holdings' })
  hasHoldings: boolean;

  @Field(() => Boolean, { name: 'has_current_price' })
  hasCurrentPrice: boolean;

  @Field(() => Boolean, { name: 'has_monthly_budget' })
  hasMonthlyBudget: boolean;

  @Field(() => [GoldBuyScenarioModel])
  scenarios: GoldBuyScenarioModel[];
}

@ObjectType('GoldBudgetAllocationScenario')
export class GoldBudgetAllocationScenarioModel {
  @Field(() => Int, { name: 'deployment_percent' })
  deploymentPercent: number;

  @Field(() => Int, { name: 'deployment_cents' })
  deploymentCents: number;

  @Field(() => Int, { name: 'reserve_cents' })
  reserveCents: number;

  @Field(() => Int, { name: 'acquisition_pg_sell_cents', nullable: true })
  acquisitionPgSellCents: number | null;

  @Field(() => String, { name: 'estimated_new_grams' })
  estimatedNewGrams: string;

  @Field(() => String, { name: 'post_buy_total_grams' })
  postBuyTotalGrams: string;

  @Field(() => Int, { name: 'post_buy_protected_capital_cents' })
  postBuyProtectedCapitalCents: number;

  @Field(() => Int, {
    name: 'post_buy_required_portfolio_value_cents',
    nullable: true,
  })
  postBuyRequiredPortfolioValueCents: number | null;

  @Field(() => Int, { name: 'post_buy_required_pg_buy_cents', nullable: true })
  postBuyRequiredPgBuyCents: number | null;

  @Field(() => Int, { name: 'required_pg_buy_change_cents', nullable: true })
  requiredPgBuyChangeCents: number | null;

  @Field(() => Float, {
    name: 'required_pg_buy_change_percent',
    nullable: true,
  })
  requiredPgBuyChangePercent: number | null;

  @Field(() => String, { name: 'target_impact' })
  targetImpact: string;

  @Field(() => Int, { name: 'immediate_spread_cost_cents', nullable: true })
  immediateSpreadCostCents: number | null;

  @Field(() => Int, {
    name: 'target_improvement_cents_per_gram',
    nullable: true,
  })
  targetImprovementCentsPerGram: number | null;

  @Field(() => Float, { name: 'target_improvement_percent', nullable: true })
  targetImprovementPercent: number | null;

  @Field(() => Int, { name: 'goal_efficiency_score', nullable: true })
  goalEfficiencyScore: number | null;

  @Field(() => Float, {
    name: 'spread_cost_percent_of_deployment',
    nullable: true,
  })
  spreadCostPercentOfDeployment: number | null;

  @Field(() => Int, { nullable: true })
  rank: number | null;

  @Field(() => String, { name: 'ranking_reason' })
  rankingReason: string;

  @Field(() => Int, {
    name: 'marginal_improvement_cents_per_gram',
    nullable: true,
  })
  marginalImprovementCentsPerGram: number | null;
}

@ObjectType('GoldBudgetAllocationAnalysis')
export class GoldBudgetAllocationAnalysisModel {
  @Field(() => Int, { name: 'monthly_budget_cents', nullable: true })
  monthlyBudgetCents: number | null;

  @Field(() => String, { name: 'phase6a_signal' })
  phase6aSignal: string;

  @Field(() => String, { name: 'phase6a_rule_code' })
  phase6aRuleCode: string;

  @Field(() => Int, { name: 'recommended_allocation_cents' })
  recommendedAllocationCents: number;

  @Field(() => Int, { name: 'recommended_deployment_cents' })
  recommendedDeploymentCents: number;

  @Field(() => Int, { name: 'recommended_reserve_cents' })
  recommendedReserveCents: number;

  @Field(() => String, { name: 'recommendation_reason' })
  recommendationReason: string;

  @Field(() => Int, { name: 'best_efficiency_percent', nullable: true })
  bestEfficiencyPercent: number | null;

  @Field(() => Int, { name: 'best_absolute_percent', nullable: true })
  bestAbsolutePercent: number | null;

  @Field(() => Boolean, { name: 'has_diminishing_returns' })
  hasDiminishingReturns: boolean;

  @Field(() => Boolean, { name: 'is_ranking_available' })
  isRankingAvailable: boolean;

  @Field(() => String, { name: 'unavailable_reason', nullable: true })
  unavailableReason: string | null;

  @Field(() => String, { name: 'goal_efficiency_score_units' })
  goalEfficiencyScoreUnits: string;

  @Field(() => [String], { name: 'caution_reasons' })
  cautionReasons: string[];

  @Field(() => [GoldBudgetAllocationScenarioModel])
  scenarios: GoldBudgetAllocationScenarioModel[];
}
