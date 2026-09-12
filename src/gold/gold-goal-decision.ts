/**
 * Phase 6A — goal-based buy / wait / hold decision engine.
 *
 * Rule-based, deterministic, explainable. No prediction, no auto-trade, no sale
 * accounting. Acquisition simulation uses PG SELL. Goal valuation uses PG BUY.
 *
 * Rule priority (first match wins):
 *  1. MISSING_CURRENT_PRICE
 *  2. NO_ACTIVE_GOAL
 *  3. GOAL_REACHED
 *  4. MISSING_BUDGET
 *  5. INSUFFICIENT_PRICE_HISTORY
 *  6. WAIT_WIDE_SPREAD_HIGH_PRICE
 *  7. WAIT_SHARP_SHORT_TERM_RISE
 *  8. BUY_PARTIAL_INITIAL_POSITION (no holdings, otherwise acceptable)
 *  9. WAIT_NO_HOLDINGS
 * 10. BUY_TARGET_IMPROVEMENT
 * 11. BUY_PARTIAL_TARGET_IMPROVEMENT
 * 12. HOLD_NO_COMPELLING_BUY
 */
import {
  computeGoldPriceAnalytics,
  type GoldPriceAnalyticsResult,
  type GoldPriceDataQuality,
  type GoldPriceObservation,
} from './gold-price-analytics';
import {
  derivePricePerGramCents,
  floorGramsFromCentsAtUnitPrice,
  formatGramUnits,
  parseGramsToUnitsOrZero,
  ratioPercent,
  roundHalfUpDiv,
  signedPercentChange,
  valueCentsFromGramsAndUnitPriceAllowZero,
} from './gold-math';
import {
  evaluateGoldProfitGoal,
  type GoldProfitGoalRecord,
} from './gold-profit-goal';
import {
  computeGoldHoldingsSummary,
  type GoldPurchaseObservation,
} from './gold-portfolio-analytics';

export const GOLD_GOAL_DECISION_SIGNALS = [
  'WAIT',
  'BUY_PARTIAL',
  'BUY',
  'HOLD',
  'GOAL_REACHED',
] as const;
export type GoldGoalDecisionSignal =
  (typeof GOLD_GOAL_DECISION_SIGNALS)[number];

export const GOLD_TARGET_IMPACTS = [
  'IMPROVES_TARGET',
  'NEUTRAL',
  'WORSENS_TARGET',
] as const;
export type GoldTargetImpact = (typeof GOLD_TARGET_IMPACTS)[number];

export const GOLD_DECISION_TRENDS = [
  'FALLING',
  'STABLE',
  'RISING',
  'INSUFFICIENT_DATA',
] as const;
export type GoldDecisionTrend = (typeof GOLD_DECISION_TRENDS)[number];

export const GOLD_SPREAD_QUALITIES = [
  'NARROW',
  'NORMAL',
  'WIDE',
  'INSUFFICIENT_DATA',
] as const;
export type GoldSpreadQuality = (typeof GOLD_SPREAD_QUALITIES)[number];

export const DEPLOYMENT_PERCENTS = [25, 50, 75, 100] as const;
export type GoldDeploymentPercent = (typeof DEPLOYMENT_PERCENTS)[number];

/** D7 PG SELL change ≤ this percent → FALLING. */
export const TREND_FALLING_PERCENT = -1;
/** D7 PG SELL change ≥ this percent → RISING. */
export const TREND_RISING_PERCENT = 1;
/** D7 PG SELL rise at/above this percent is a WAIT factor when price is not cheap. */
export const SHARP_RISE_PERCENT = 2;

/** Current spread % below 85% of D30 average → NARROW. */
export const SPREAD_NARROW_RATIO_PERCENT = 85;
/** Current spread % above 125% of D30 average → WIDE. */
export const SPREAD_WIDE_RATIO_PERCENT = 125;

/** 0% = 30-day PG SELL low, 100% = 30-day PG SELL high. */
export const HIGH_PRICE_POSITION_PERCENT = 70;
export const FAVORABLE_PRICE_POSITION_PERCENT = 50;
export const MODERATE_PRICE_POSITION_PERCENT = 60;

/** Required PG BUY must fall by at least 1% for a full-budget BUY. */
export const STRONG_IMPROVEMENT_PERCENT = -1;
/** |required PG BUY change| below 0.25% is NEUTRAL. */
export const NEUTRAL_CHANGE_ABS_PERCENT = 0.25;

export type GoldBuyScenario = {
  deploymentPercent: number;
  deploymentCents: number;
  acquisitionPgSellCents: number | null;
  estimatedNewGrams: string;
  postBuyTotalGrams: string;
  postBuyProtectedCapitalCents: number;
  postBuyRequiredPortfolioValueCents: number | null;
  postBuyRequiredPgBuyCents: number | null;
  requiredPgBuyChangeCents: number | null;
  requiredPgBuyChangePercent: number | null;
  targetImpact: GoldTargetImpact;
  immediateSpreadCostCents: number | null;
};

export type GoldGoalDecision = {
  signal: GoldGoalDecisionSignal;
  ruleCode: string;
  headline: string;
  primaryReason: string;
  supportingReasons: string[];
  cautionReasons: string[];
  monthlyBudgetCents: number | null;
  recommendedDeploymentCents: number | null;
  currentPgBuyCents: number | null;
  currentPgSellCents: number | null;
  spreadCents: number | null;
  spreadPercent: number | null;
  targetProfitCents: number | null;
  protectedCapitalCents: number;
  currentRequiredPgBuyCents: number | null;
  progressPercent: number | null;
  trend: GoldDecisionTrend;
  spreadQuality: GoldSpreadQuality;
  recentPricePositionPercent: number | null;
  dataQuality: GoldPriceDataQuality;
  hasActiveGoal: boolean;
  hasHoldings: boolean;
  hasCurrentPrice: boolean;
  hasMonthlyBudget: boolean;
  scenarios: GoldBuyScenario[];
};

export type ComputeGoldGoalDecisionInput = {
  monthlyBudgetCents: number | null;
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  prices: GoldPriceObservation[];
  latestPrice: {
    pgBuyPricePerGramCents: number;
    pgSellPricePerGramCents: number;
    priceDate: string;
  } | null;
  now?: Date;
  todayPriceDate?: string;
};

function addGrams(left: string, right: string): string {
  return formatGramUnits(
    parseGramsToUnitsOrZero(left) + parseGramsToUnitsOrZero(right),
  );
}

export function deploymentCentsForPercent(
  monthlyBudgetCents: number,
  percent: number,
): number {
  if (monthlyBudgetCents <= 0 || percent <= 0) {
    return 0;
  }
  return Number(
    roundHalfUpDiv(BigInt(monthlyBudgetCents) * BigInt(percent), 100n),
  );
}

export function classifyGoldTargetImpact(
  currentRequiredPgBuyCents: number | null,
  postBuyRequiredPgBuyCents: number | null,
): {
  targetImpact: GoldTargetImpact;
  changeCents: number | null;
  changePercent: number | null;
} {
  if (currentRequiredPgBuyCents == null || postBuyRequiredPgBuyCents == null) {
    return {
      targetImpact: 'NEUTRAL',
      changeCents: null,
      changePercent: null,
    };
  }
  const changeCents = postBuyRequiredPgBuyCents - currentRequiredPgBuyCents;
  const changePercent = signedPercentChange(
    currentRequiredPgBuyCents,
    postBuyRequiredPgBuyCents,
  );
  if (
    changePercent != null &&
    Math.abs(changePercent) < NEUTRAL_CHANGE_ABS_PERCENT
  ) {
    return { targetImpact: 'NEUTRAL', changeCents, changePercent };
  }
  if (changeCents < 0) {
    return { targetImpact: 'IMPROVES_TARGET', changeCents, changePercent };
  }
  if (changeCents > 0) {
    return { targetImpact: 'WORSENS_TARGET', changeCents, changePercent };
  }
  return { targetImpact: 'NEUTRAL', changeCents, changePercent };
}

/**
 * Current PG SELL position in the D30 PG SELL range.
 * 0 = at the 30-day low, 100 = at the 30-day high.
 */
export function goldPricePositionPercent(
  currentPgSellCents: number | null,
  d30: GoldPriceAnalyticsResult,
): number | null {
  if (currentPgSellCents == null || d30.pgSell == null) {
    return null;
  }
  const low = d30.pgSell.low.priceCents;
  const high = d30.pgSell.high.priceCents;
  if (high === low) {
    return 50;
  }
  const raw = ratioPercent(currentPgSellCents - low, high - low);
  if (raw == null) {
    return null;
  }
  if (raw < 0) {
    return 0;
  }
  if (raw > 100) {
    return 100;
  }
  return raw;
}

/**
 * Trend from D7 PG SELL start → latest change percent.
 * FALLING ≤ -1%, RISING ≥ +1%, otherwise STABLE when D7 has sufficient history.
 */
export function classifyGoldDecisionTrend(
  d7: GoldPriceAnalyticsResult,
): GoldDecisionTrend {
  if (!d7.dataQuality.hasSufficientHistory || d7.pgSell?.change == null) {
    return 'INSUFFICIENT_DATA';
  }
  const pct = d7.pgSell.change.changePercent;
  if (pct == null) {
    return 'INSUFFICIENT_DATA';
  }
  if (pct <= TREND_FALLING_PERCENT) {
    return 'FALLING';
  }
  if (pct >= TREND_RISING_PERCENT) {
    return 'RISING';
  }
  return 'STABLE';
}

/**
 * Spread quality vs the user's D30 recorded spread %.
 * NARROW < 85% of average, WIDE > 125% of average.
 */
export function classifyGoldSpreadQuality(
  currentSpreadPercent: number | null,
  d30: GoldPriceAnalyticsResult,
): GoldSpreadQuality {
  if (
    currentSpreadPercent == null ||
    !d30.dataQuality.hasSufficientHistory ||
    d30.history.length < 2
  ) {
    return 'INSUFFICIENT_DATA';
  }
  const hundredths: number[] = [];
  for (const point of d30.history) {
    if (point.spreadPercent == null) {
      continue;
    }
    hundredths.push(Math.round(point.spreadPercent * 100));
  }
  if (hundredths.length < 2) {
    return 'INSUFFICIENT_DATA';
  }
  let sum = 0n;
  for (const value of hundredths) {
    sum += BigInt(value);
  }
  const avgHundredths = Number(roundHalfUpDiv(sum, BigInt(hundredths.length)));
  if (avgHundredths <= 0) {
    return 'INSUFFICIENT_DATA';
  }
  const currentHundredths = Math.round(currentSpreadPercent * 100);
  if (currentHundredths * 100 < avgHundredths * SPREAD_NARROW_RATIO_PERCENT) {
    return 'NARROW';
  }
  if (currentHundredths * 100 > avgHundredths * SPREAD_WIDE_RATIO_PERCENT) {
    return 'WIDE';
  }
  return 'NORMAL';
}

export function simulateGoldBuyScenario(input: {
  deploymentPercent: number;
  deploymentCents: number;
  currentGrams: string;
  protectedCapitalCents: number;
  targetProfitCents: number | null;
  currentRequiredPgBuyCents: number | null;
  pgBuyCents: number | null;
  pgSellCents: number | null;
}): GoldBuyScenario {
  const pgSell = input.pgSellCents;
  const pgBuy = input.pgBuyCents;
  const newGrams =
    input.deploymentCents > 0 && pgSell != null && pgSell > 0
      ? floorGramsFromCentsAtUnitPrice(input.deploymentCents, pgSell)
      : '0.0000';
  const postBuyTotalGrams = addGrams(input.currentGrams, newGrams);
  const postBuyProtectedCapitalCents =
    input.protectedCapitalCents + Math.max(0, input.deploymentCents);

  let postBuyRequiredPortfolioValueCents: number | null = null;
  let postBuyRequiredPgBuyCents: number | null = null;
  if (input.targetProfitCents != null && input.targetProfitCents > 0) {
    postBuyRequiredPortfolioValueCents =
      postBuyProtectedCapitalCents + input.targetProfitCents;
    try {
      postBuyRequiredPgBuyCents = derivePricePerGramCents(
        postBuyRequiredPortfolioValueCents,
        postBuyTotalGrams,
      );
    } catch {
      postBuyRequiredPgBuyCents = null;
    }
  }

  const impact = classifyGoldTargetImpact(
    input.currentRequiredPgBuyCents,
    postBuyRequiredPgBuyCents,
  );

  let immediateSpreadCostCents: number | null = null;
  if (pgSell != null && pgSell > 0 && pgBuy != null && pgBuy > 0) {
    const atSell = valueCentsFromGramsAndUnitPriceAllowZero(newGrams, pgSell);
    const atBuy = valueCentsFromGramsAndUnitPriceAllowZero(newGrams, pgBuy);
    immediateSpreadCostCents = atSell - atBuy;
  }

  return {
    deploymentPercent: input.deploymentPercent,
    deploymentCents: input.deploymentCents,
    acquisitionPgSellCents: pgSell,
    estimatedNewGrams: newGrams,
    postBuyTotalGrams,
    postBuyProtectedCapitalCents,
    postBuyRequiredPortfolioValueCents,
    postBuyRequiredPgBuyCents,
    requiredPgBuyChangeCents: impact.changeCents,
    requiredPgBuyChangePercent: impact.changePercent,
    targetImpact: impact.targetImpact,
    immediateSpreadCostCents,
  };
}

type RuleMatch = {
  ruleCode: string;
  signal: GoldGoalDecisionSignal;
  recommendedPercent: number | null;
};

type RuleContext = {
  hasCurrentPrice: boolean;
  hasActiveGoal: boolean;
  isTargetReached: boolean;
  hasMonthlyBudget: boolean;
  hasSufficientHistory: boolean;
  hasHoldings: boolean;
  spreadQuality: GoldSpreadQuality;
  positionPercent: number | null;
  trend: GoldDecisionTrend;
  d7SellChangePercent: number | null;
  scenario100: GoldBuyScenario | null;
  partialPercents: GoldDeploymentPercent[];
};

function firstImprovingPartial(ctx: RuleContext): GoldDeploymentPercent | null {
  const order: GoldDeploymentPercent[] = [50, 25, 75];
  for (const percent of order) {
    if (ctx.partialPercents.includes(percent)) {
      return percent;
    }
  }
  return null;
}

function isAcceptableSpread(quality: GoldSpreadQuality): boolean {
  return quality === 'NARROW' || quality === 'NORMAL';
}

function isFavorableOrNeutralPosition(position: number | null): boolean {
  return position != null && position <= FAVORABLE_PRICE_POSITION_PERCENT;
}

function isModeratePosition(position: number | null): boolean {
  return position != null && position <= MODERATE_PRICE_POSITION_PERCENT;
}

function isHighPosition(position: number | null): boolean {
  return position != null && position >= HIGH_PRICE_POSITION_PERCENT;
}

function strongImprovement(scenario: GoldBuyScenario | null): boolean {
  if (
    scenario == null ||
    scenario.targetImpact !== 'IMPROVES_TARGET' ||
    scenario.requiredPgBuyChangePercent == null
  ) {
    return false;
  }
  return scenario.requiredPgBuyChangePercent <= STRONG_IMPROVEMENT_PERCENT;
}

/**
 * Ordered rule list. Tests assert this sequence by identity.
 */
export const GOLD_GOAL_DECISION_RULES: Array<{
  code: string;
  match: (ctx: RuleContext) => RuleMatch | null;
}> = [
  {
    code: 'MISSING_CURRENT_PRICE',
    match: (ctx) =>
      ctx.hasCurrentPrice
        ? null
        : {
            ruleCode: 'MISSING_CURRENT_PRICE',
            signal: 'HOLD',
            recommendedPercent: null,
          },
  },
  {
    code: 'NO_ACTIVE_GOAL',
    match: (ctx) =>
      ctx.hasActiveGoal
        ? null
        : {
            ruleCode: 'NO_ACTIVE_GOAL',
            signal: 'WAIT',
            recommendedPercent: null,
          },
  },
  {
    code: 'GOAL_REACHED',
    match: (ctx) =>
      ctx.isTargetReached
        ? {
            ruleCode: 'GOAL_REACHED',
            signal: 'GOAL_REACHED',
            recommendedPercent: null,
          }
        : null,
  },
  {
    code: 'MISSING_BUDGET',
    match: (ctx) =>
      ctx.hasMonthlyBudget
        ? null
        : {
            ruleCode: 'MISSING_BUDGET',
            signal: 'HOLD',
            recommendedPercent: null,
          },
  },
  {
    code: 'INSUFFICIENT_PRICE_HISTORY',
    match: (ctx) =>
      ctx.hasSufficientHistory
        ? null
        : {
            ruleCode: 'INSUFFICIENT_PRICE_HISTORY',
            signal: 'WAIT',
            recommendedPercent: null,
          },
  },
  {
    code: 'WAIT_WIDE_SPREAD_HIGH_PRICE',
    match: (ctx) =>
      ctx.spreadQuality === 'WIDE' && isHighPosition(ctx.positionPercent)
        ? {
            ruleCode: 'WAIT_WIDE_SPREAD_HIGH_PRICE',
            signal: 'WAIT',
            recommendedPercent: null,
          }
        : null,
  },
  {
    code: 'WAIT_SHARP_SHORT_TERM_RISE',
    match: (ctx) =>
      ctx.trend === 'RISING' &&
      ctx.d7SellChangePercent != null &&
      ctx.d7SellChangePercent >= SHARP_RISE_PERCENT &&
      (ctx.positionPercent == null ||
        ctx.positionPercent >= FAVORABLE_PRICE_POSITION_PERCENT)
        ? {
            ruleCode: 'WAIT_SHARP_SHORT_TERM_RISE',
            signal: 'WAIT',
            recommendedPercent: null,
          }
        : null,
  },
  {
    code: 'BUY_PARTIAL_INITIAL_POSITION',
    match: (ctx) => {
      if (ctx.hasHoldings) {
        return null;
      }
      if (
        isAcceptableSpread(ctx.spreadQuality) &&
        isFavorableOrNeutralPosition(ctx.positionPercent) &&
        ctx.trend !== 'RISING'
      ) {
        return {
          ruleCode: 'BUY_PARTIAL_INITIAL_POSITION',
          signal: 'BUY_PARTIAL',
          recommendedPercent: 50,
        };
      }
      return {
        ruleCode: 'WAIT_NO_HOLDINGS',
        signal: 'WAIT',
        recommendedPercent: null,
      };
    },
  },
  {
    code: 'BUY_TARGET_IMPROVEMENT',
    match: (ctx) => {
      if (!ctx.hasHoldings) {
        return null;
      }
      if (
        strongImprovement(ctx.scenario100) &&
        isFavorableOrNeutralPosition(ctx.positionPercent) &&
        isAcceptableSpread(ctx.spreadQuality) &&
        ctx.trend !== 'RISING'
      ) {
        return {
          ruleCode: 'BUY_TARGET_IMPROVEMENT',
          signal: 'BUY',
          recommendedPercent: 100,
        };
      }
      return null;
    },
  },
  {
    code: 'BUY_PARTIAL_TARGET_IMPROVEMENT',
    match: (ctx) => {
      if (!ctx.hasHoldings) {
        return null;
      }
      const percent = firstImprovingPartial(ctx);
      if (
        percent != null &&
        isModeratePosition(ctx.positionPercent) &&
        ctx.spreadQuality !== 'WIDE'
      ) {
        return {
          ruleCode: 'BUY_PARTIAL_TARGET_IMPROVEMENT',
          signal: 'BUY_PARTIAL',
          recommendedPercent: percent,
        };
      }
      return null;
    },
  },
  {
    code: 'HOLD_NO_COMPELLING_BUY',
    match: () => ({
      ruleCode: 'HOLD_NO_COMPELLING_BUY',
      signal: 'HOLD',
      recommendedPercent: null,
    }),
  },
];

export const GOLD_GOAL_DECISION_RULE_ORDER = GOLD_GOAL_DECISION_RULES.map(
  (rule) => rule.code,
);

function selectRule(ctx: RuleContext): RuleMatch {
  for (const rule of GOLD_GOAL_DECISION_RULES) {
    const matched = rule.match(ctx);
    if (matched) {
      return matched;
    }
  }
  return {
    ruleCode: 'HOLD_NO_COMPELLING_BUY',
    signal: 'HOLD',
    recommendedPercent: null,
  };
}

function explain(input: {
  match: RuleMatch;
  trend: GoldDecisionTrend;
  spreadQuality: GoldSpreadQuality;
  positionPercent: number | null;
  dataQuality: GoldPriceDataQuality;
  recommended: GoldBuyScenario | null;
}): Pick<
  GoldGoalDecision,
  'headline' | 'primaryReason' | 'supportingReasons' | 'cautionReasons'
> {
  const supporting: string[] = [];
  const caution: string[] = [];
  const position = input.positionPercent;
  if (position != null) {
    supporting.push(
      `Current PG SELL is ${position.toFixed(2)}% of the way from your recorded 30-day low to high.`,
    );
  }
  if (input.spreadQuality === 'NARROW') {
    supporting.push(
      'The current spread is narrower than your recent 30-day average.',
    );
  } else if (input.spreadQuality === 'NORMAL') {
    supporting.push('The current spread is within your recent normal range.');
  } else if (input.spreadQuality === 'WIDE') {
    caution.push(
      'The current spread is wider than your recent 30-day average. Buying at PG SELL and valuing at PG BUY would initially reflect that spread.',
    );
  }
  if (input.trend === 'FALLING') {
    supporting.push(
      'Your recorded 7-day PG SELL series is lower than at the start of that window.',
    );
  } else if (input.trend === 'RISING') {
    caution.push(
      'Your recorded 7-day PG SELL series has risen. This is not a forecast that it will continue.',
    );
  }
  if (input.dataQuality.daysWithData < 30) {
    caution.push(
      `Your price history currently covers only ${input.dataQuality.daysWithData} day${
        input.dataQuality.daysWithData === 1 ? '' : 's'
      } in the 30-day window.`,
    );
  }
  if (
    input.recommended?.immediateSpreadCostCents != null &&
    input.recommended.immediateSpreadCostCents > 0
  ) {
    caution.push(
      'If purchased at the current PG SELL and valued immediately at PG BUY, the position would initially reflect the current spread.',
    );
  }

  switch (input.match.ruleCode) {
    case 'MISSING_CURRENT_PRICE':
      return {
        headline: 'Your existing Gold position can be maintained for now.',
        primaryReason:
          'A current Public Gold price is not recorded, so a buy or wait decision cannot be calculated from live PG BUY and PG SELL.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'NO_ACTIVE_GOAL':
      return {
        headline:
          'Waiting is reasonable right now because there is no active profit goal.',
        primaryReason:
          'Set a profit goal first. Gold Decision uses that target to judge whether adding Gold now helps or makes the required PG BUY harder.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'GOAL_REACHED':
      return {
        headline: 'Your current protected-profit target is reached.',
        primaryReason: 'Your protected-profit target is currently reached.',
        supportingReasons: [
          'Do not add more Gold by default while the current target is already reached.',
          'Open the profit-taking planner to preview a capital-protected sale. Completing a goal records goal progress only; no sale is placed here.',
          ...supporting,
        ],
        cautionReasons: caution,
      };
    case 'MISSING_BUDGET':
      return {
        headline: 'Your existing Gold position can be maintained for now.',
        primaryReason:
          'Set a monthly Gold budget greater than zero before the engine can suggest a 25%, 50%, 75%, or 100% deployment.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'INSUFFICIENT_PRICE_HISTORY':
      return {
        headline:
          'Waiting is reasonable right now because there is not enough recent price history.',
        primaryReason:
          'There is not enough recent price history for a stronger buy decision.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'WAIT_WIDE_SPREAD_HIGH_PRICE':
      return {
        headline:
          'Waiting is reasonable right now because the current Gold selling price is near the higher end of your recent range and the spread is wide.',
        primaryReason:
          'Current PG SELL is near the higher end of your recorded 30-day range, and the spread is wide relative to that history. Buying now would use PG SELL while the profit goal is measured at PG BUY.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'WAIT_SHARP_SHORT_TERM_RISE':
      return {
        headline:
          'Waiting is reasonable right now because the short-term recorded PG SELL series has risen sharply.',
        primaryReason:
          'Your recorded 7-day PG SELL change is a sharp rise relative to the start of that window. This is not a prediction that the price will fall.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'BUY_PARTIAL_INITIAL_POSITION':
      return {
        headline:
          'A partial purchase may start a Gold position without using your full monthly budget.',
        primaryReason:
          'You have no recorded Gold holdings yet. A partial deployment at the current PG SELL would establish a position that later goal-efficiency math can measure.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'WAIT_NO_HOLDINGS':
      return {
        headline:
          'Waiting is reasonable right now before starting a Gold position.',
        primaryReason:
          'You have no recorded Gold holdings, and current price-range or spread conditions are not strong enough for a first-buy suggestion.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    case 'BUY_TARGET_IMPROVEMENT':
      return {
        headline:
          'Current conditions and your goal calculation support considering your planned Gold budget.',
        primaryReason:
          'Deploying the planned monthly budget at the current PG SELL lowers the PG BUY level required to reach your profit target under the current recorded holdings and prices.',
        supportingReasons: [
          'Suggested budget to consider uses your monthly Gold budget. This does not place a purchase.',
          ...supporting,
        ],
        cautionReasons: caution,
      };
    case 'BUY_PARTIAL_TARGET_IMPROVEMENT':
      return {
        headline:
          'A partial purchase may improve your profit-goal position without using your full monthly budget.',
        primaryReason:
          'A partial purchase lowers the PG BUY level required to reach your profit target.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
    default:
      return {
        headline: 'Your existing Gold position can be maintained for now.',
        primaryReason:
          'Your current position can be maintained while waiting for a better entry or more price confirmation.',
        supportingReasons: supporting,
        cautionReasons: caution,
      };
  }
}

export function computeGoldGoalDecision(
  input: ComputeGoldGoalDecisionInput,
): GoldGoalDecision {
  const now = input.now ?? new Date();
  const todayPriceDate =
    input.todayPriceDate ?? input.latestPrice?.priceDate ?? undefined;
  const d7 = computeGoldPriceAnalytics(input.prices, {
    range: 'D7',
    now,
    todayPriceDate,
  });
  const d30 = computeGoldPriceAnalytics(input.prices, {
    range: 'D30',
    now,
    todayPriceDate,
  });

  const evaluation = input.goal
    ? evaluateGoldProfitGoal({
        goal: input.goal,
        purchases: input.purchases,
        latestPrice: input.latestPrice,
      })
    : null;
  const holdings = computeGoldHoldingsSummary(
    input.purchases,
    input.latestPrice,
  );

  const pgBuy = input.latestPrice?.pgBuyPricePerGramCents ?? null;
  const pgSell = input.latestPrice?.pgSellPricePerGramCents ?? null;
  const spreadCents =
    pgBuy != null && pgSell != null ? pgSell - pgBuy : d30.spreadCents;
  const spreadPercent =
    pgBuy != null && pgSell != null && pgSell > 0
      ? ratioPercent(pgSell - pgBuy, pgSell)
      : d30.spreadPercent;

  const trend = classifyGoldDecisionTrend(d7);
  const spreadQuality = classifyGoldSpreadQuality(spreadPercent, d30);
  const positionPercent = goldPricePositionPercent(pgSell, d30);

  const monthlyBudgetCents =
    input.monthlyBudgetCents != null && input.monthlyBudgetCents > 0
      ? input.monthlyBudgetCents
      : null;
  const protectedCapitalCents =
    evaluation?.protectedCapitalCents ?? holdings.totalInvestedCents;
  const currentGrams = evaluation?.totalGrams ?? holdings.totalGrams;
  const hasHoldings = evaluation?.hasHoldings ?? holdings.hasGrams;
  const targetProfitCents = evaluation?.goal.targetProfitCents ?? null;
  const currentRequiredPgBuyCents =
    evaluation?.requiredPgBuyPerGramCents ?? null;

  const scenarios: GoldBuyScenario[] = DEPLOYMENT_PERCENTS.map((percent) =>
    simulateGoldBuyScenario({
      deploymentPercent: percent,
      deploymentCents:
        monthlyBudgetCents == null
          ? 0
          : deploymentCentsForPercent(monthlyBudgetCents, percent),
      currentGrams,
      protectedCapitalCents,
      targetProfitCents,
      currentRequiredPgBuyCents,
      pgBuyCents: pgBuy,
      pgSellCents: pgSell,
    }),
  );

  const improvingPartials = scenarios
    .filter(
      (row) =>
        row.deploymentPercent < 100 &&
        row.deploymentCents > 0 &&
        row.targetImpact === 'IMPROVES_TARGET',
    )
    .map((row) => row.deploymentPercent as GoldDeploymentPercent);

  const match = selectRule({
    hasCurrentPrice:
      Boolean(input.latestPrice) && pgBuy != null && pgSell != null,
    hasActiveGoal: input.goal != null,
    isTargetReached: evaluation?.isTargetReached === true,
    hasMonthlyBudget: monthlyBudgetCents != null,
    hasSufficientHistory: d30.dataQuality.hasSufficientHistory,
    hasHoldings,
    spreadQuality,
    positionPercent,
    trend,
    d7SellChangePercent: d7.pgSell?.change?.changePercent ?? null,
    scenario100: scenarios.find((row) => row.deploymentPercent === 100) ?? null,
    partialPercents: improvingPartials,
  });

  const recommended =
    match.recommendedPercent == null
      ? null
      : (scenarios.find(
          (row) => row.deploymentPercent === match.recommendedPercent,
        ) ?? null);
  let recommendedDeploymentCents = recommended?.deploymentCents ?? null;
  if (
    recommendedDeploymentCents != null &&
    monthlyBudgetCents != null &&
    recommendedDeploymentCents > monthlyBudgetCents
  ) {
    recommendedDeploymentCents = monthlyBudgetCents;
  }
  if (recommendedDeploymentCents === 0) {
    recommendedDeploymentCents = null;
  }

  const copy = explain({
    match,
    trend,
    spreadQuality,
    positionPercent,
    dataQuality: d30.dataQuality,
    recommended,
  });

  return {
    signal: match.signal,
    ruleCode: match.ruleCode,
    headline: copy.headline,
    primaryReason: copy.primaryReason,
    supportingReasons: copy.supportingReasons,
    cautionReasons: copy.cautionReasons,
    monthlyBudgetCents,
    recommendedDeploymentCents,
    currentPgBuyCents: pgBuy,
    currentPgSellCents: pgSell,
    spreadCents,
    spreadPercent,
    targetProfitCents,
    protectedCapitalCents,
    currentRequiredPgBuyCents,
    progressPercent: evaluation?.progressPercent ?? null,
    trend,
    spreadQuality,
    recentPricePositionPercent: positionPercent,
    dataQuality: d30.dataQuality,
    hasActiveGoal: input.goal != null,
    hasHoldings,
    hasCurrentPrice: Boolean(input.latestPrice),
    hasMonthlyBudget: monthlyBudgetCents != null,
    scenarios,
  };
}
