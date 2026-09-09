import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('GoldProfitTakingPreview')
export class GoldProfitTakingPreviewModel {
  @Field(() => ID, { name: 'goal_id', nullable: true })
  goalId: string | null;

  @Field(() => String)
  mode: string;

  @Field(() => Int, { name: 'target_profit_cents', nullable: true })
  targetProfitCents: number | null;

  @Field(() => Int, { name: 'requested_profit_cents', nullable: true })
  requestedProfitCents: number | null;

  @Field(() => Int, { name: 'protected_capital_cents' })
  protectedCapitalCents: number;

  @Field(() => Int, { name: 'current_portfolio_value_cents', nullable: true })
  currentPortfolioValueCents: number | null;

  @Field(() => Int, { name: 'available_profit_cents', nullable: true })
  availableProfitCents: number | null;

  @Field(() => Int, { name: 'max_withdrawable_profit_cents', nullable: true })
  maxWithdrawableProfitCents: number | null;

  @Field(() => String, { name: 'max_executable_grams_to_sell', nullable: true })
  maxExecutableGramsToSell: string | null;

  @Field(() => Int, { name: 'max_executable_proceeds_cents', nullable: true })
  maxExecutableProceedsCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_per_gram_cents', nullable: true })
  currentPgBuyPerGramCents: number | null;

  @Field(() => Int, { name: 'required_pg_buy_per_gram_cents', nullable: true })
  requiredPgBuyPerGramCents: number | null;

  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;

  @Field(() => String, { name: 'theoretical_grams_to_sell', nullable: true })
  theoreticalGramsToSell: string | null;

  @Field(() => String, { name: 'executable_grams_to_sell', nullable: true })
  executableGramsToSell: string | null;

  @Field(() => Int, { name: 'estimated_sale_proceeds_cents', nullable: true })
  estimatedSaleProceedsCents: number | null;

  @Field(() => Int, {
    name: 'profit_rounding_difference_cents',
    nullable: true,
  })
  profitRoundingDifferenceCents: number | null;

  @Field(() => String, { name: 'remaining_grams', nullable: true })
  remainingGrams: string | null;

  @Field(() => Int, {
    name: 'remaining_portfolio_value_cents',
    nullable: true,
  })
  remainingPortfolioValueCents: number | null;

  @Field(() => Int, { name: 'capital_buffer_cents', nullable: true })
  capitalBufferCents: number | null;

  @Field(() => Boolean, { name: 'is_full_target_achievable' })
  isFullTargetAchievable: boolean;

  @Field(() => Boolean, { name: 'is_preview_allowed' })
  isPreviewAllowed: boolean;

  @Field(() => Boolean, { name: 'is_capital_preserved', nullable: true })
  isCapitalPreserved: boolean | null;

  @Field(() => String, { name: 'blocking_reason', nullable: true })
  blockingReason: string | null;
}
