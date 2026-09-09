import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { GoldProfitGoalModel } from './gold-profit-goal.model';

@ObjectType('GoldProfitGoalHistoryItem')
export class GoldProfitGoalHistoryItemModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int, { name: 'target_profit_cents' })
  targetProfitCents: number;

  @Field(() => String)
  status: string;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;

  @Field(() => Date, { name: 'achieved_at', nullable: true })
  achievedAt: Date | null;

  @Field(() => Int, { name: 'duration_days' })
  durationDays: number;
}

@ObjectType('GoldProfitGoalCompletion')
export class GoldProfitGoalCompletionModel {
  @Field(() => GoldProfitGoalModel)
  goal: GoldProfitGoalModel;

  @Field(() => Boolean, { name: 'already_completed' })
  alreadyCompleted: boolean;
}

@ObjectType('GoldNextProfitGoalPreview')
export class GoldNextProfitGoalPreviewModel {
  @Field(() => ID, { name: 'previous_goal_id' })
  previousGoalId: string;

  @Field(() => Int, { name: 'previous_target_cents' })
  previousTargetCents: number;

  @Field(() => Int, { name: 'proposed_target_cents' })
  proposedTargetCents: number;

  @Field(() => String)
  rule: string;

  @Field(() => Int, { name: 'fixed_increase_cents', nullable: true })
  fixedIncreaseCents: number | null;

  @Field(() => Float, { nullable: true })
  percentage: number | null;

  @Field(() => Int, { name: 'required_portfolio_value_cents' })
  requiredPortfolioValueCents: number;

  @Field(() => Int, { name: 'required_pg_buy_per_gram_cents', nullable: true })
  requiredPgBuyPerGramCents: number | null;

  @Field(() => Int, { name: 'current_pg_buy_per_gram_cents', nullable: true })
  currentPgBuyPerGramCents: number | null;

  @Field(() => Int, {
    name: 'distance_to_required_pg_buy_cents',
    nullable: true,
  })
  distanceToRequiredPgBuyCents: number | null;

  @Field(() => String, { name: 'total_grams' })
  totalGrams: string;

  @Field(() => Int, { name: 'protected_capital_cents' })
  protectedCapitalCents: number;
}
