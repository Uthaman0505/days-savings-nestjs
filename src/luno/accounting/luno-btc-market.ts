/**
 * Phase 5 market intelligence — explainable SMA-based context.
 *
 * SMA is used instead of EMA because each average is a plain mean of the last
 * N closes and can be audited without a smoothing factor.
 *
 * Primary series: 1h closes.
 * 7-day high/low: last 7 daily candles.
 */
import {
  addDecimalStrings,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  maxDecimal,
  minDecimal,
  multiplyDecimalStrings,
  sqrtDecimal,
  subtractDecimalStrings,
} from '../luno-decimal';
import {
  capSuggestedAmount,
  displayActionFor,
  FIRST_BUY_FRACTION,
  topUpNeededMyr,
  type BuyDecision,
} from './luno-btc-decision';
import type { LunoBtcStrategyAction } from '../entities/luno-btc-strategy-event.entity';
import type {
  LunoBtcBuyingCondition,
  LunoBtcMarketConfidence,
  LunoBtcMarketContextStatus,
  LunoBtcMarketDirection,
  LunoBtcMarketStability,
} from '../entities/luno-btc-market-snapshot.entity';
import type { LunoBtcMarketDataSource } from '../entities/luno-btc-market-candle.entity';

export const MARKET_SMA_SHORT = 20;
export const MARKET_SMA_LONG = 50;
export const MARKET_MOMENTUM_PERIOD = 14;
export const MARKET_VOLATILITY_PERIOD = 14;
export const MARKET_RECENT_ROC_PERIOD = 4;
export const MARKET_HIGH_LOW_DAYS = 7;
export const STABLE_VOL_RATIO_MAX = '0.75';
export const UNSTABLE_VOL_RATIO_MIN = '1.50';
export const EXPENSIVE_VS_AVG_PCT = '5';
export const EXTENDED_ABOVE_MA_PCT = '5';
export const MEANINGFUL_DRAWDOWN_PCT = '-5';
export const EXTREME_BREAKDOWN_MOMENTUM_PCT = '-15';
export const FRESH_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MARKET_DATA_SOURCE: LunoBtcMarketDataSource = 'LUNO';

export type MarketCandleInput = {
  time: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

export type MarketSnapshotInput = {
  hourly: MarketCandleInput[];
  daily: MarketCandleInput[];
  now: Date;
  averageBuyPriceMyr: string | null;
};

export type MarketSnapshotView = {
  direction: LunoBtcMarketDirection;
  buyingCondition: LunoBtcBuyingCondition;
  stability: LunoBtcMarketStability;
  confidence: LunoBtcMarketConfidence;
  currentPriceMyr: string | null;
  shortTrendPct: string | null;
  mediumTrendPct: string | null;
  drawdownFromRecentHighPct: string | null;
  volatilityPct: string | null;
  momentumValue: string | null;
  sma20Myr: string | null;
  sma50Myr: string | null;
  recentHighMyr: string | null;
  recentLowMyr: string | null;
  marketScore: string | null;
  reason: string[];
  source: LunoBtcMarketDataSource;
  latestCandleAt: Date | null;
  marketDataAgeMinutes: string | null;
  marketContextStatus: LunoBtcMarketContextStatus;
};

export function sma(closes: string[], period: number): string | null {
  if (closes.length < period || period <= 0) {
    return null;
  }
  const window = closes.slice(closes.length - period);
  const sum = window.reduce((acc, value) => addDecimalStrings(acc, value), '0');
  return divideDecimalStrings(sum, String(period), 8);
}

export function rateOfChangePct(
  closes: string[],
  period: number,
): string | null {
  if (closes.length <= period) {
    return null;
  }
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (!current || !past || isZeroDecimal(past)) {
    return null;
  }
  return divideDecimalStrings(
    multiplyDecimalStrings(subtractDecimalStrings(current, past), '100'),
    past,
    8,
  );
}

export function returnStdevPct(
  closes: string[],
  period: number,
): string | null {
  if (closes.length < period + 1) {
    return null;
  }
  const window = closes.slice(closes.length - (period + 1));
  const returns: string[] = [];
  for (let i = 1; i < window.length; i += 1) {
    const prev = window[i - 1];
    const next = window[i];
    if (!prev || !next || isZeroDecimal(prev)) {
      return null;
    }
    const change = divideDecimalStrings(
      subtractDecimalStrings(next, prev),
      prev,
      8,
    );
    if (change == null) {
      return null;
    }
    returns.push(change);
  }
  const mean = divideDecimalStrings(
    returns.reduce((acc, value) => addDecimalStrings(acc, value), '0'),
    String(returns.length),
    8,
  );
  if (mean == null) {
    return null;
  }
  const squared = returns.reduce((acc, value) => {
    const diff = subtractDecimalStrings(value, mean);
    return addDecimalStrings(acc, multiplyDecimalStrings(diff, diff));
  }, '0');
  const divisor = returns.length > 1 ? String(returns.length - 1) : '1';
  const variance = divideDecimalStrings(squared, divisor, 16);
  if (variance == null) {
    return null;
  }
  const stdev = sqrtDecimal(variance, 8);
  if (stdev == null) {
    return null;
  }
  return multiplyDecimalStrings(stdev, '100');
}

export function marketContextStatus(
  latestCandleAt: Date | null,
  now: Date,
): LunoBtcMarketContextStatus {
  if (!latestCandleAt) {
    return 'UNAVAILABLE';
  }
  const age = now.getTime() - latestCandleAt.getTime();
  if (age <= FRESH_MAX_AGE_MS) {
    return 'FRESH';
  }
  if (age <= STALE_MAX_AGE_MS) {
    return 'STALE';
  }
  return 'UNAVAILABLE';
}

export function classifyDirection(input: {
  price: string;
  sma20: string;
  sma50: string;
  recentRocPct: string;
}): { direction: LunoBtcMarketDirection; agreeCount: number } {
  const aboveShort = compareDecimal(input.price, input.sma20) > 0;
  const shortAboveLong = compareDecimal(input.sma20, input.sma50) > 0;
  const rocPositive = compareDecimal(input.recentRocPct, '0') > 0;
  const rocNegative = compareDecimal(input.recentRocPct, '0') < 0;
  const risingVotes = [aboveShort, shortAboveLong, rocPositive].filter(
    Boolean,
  ).length;
  const fallingVotes = [!aboveShort, !shortAboveLong, rocNegative].filter(
    Boolean,
  ).length;
  if (risingVotes === 3) {
    return { direction: 'RISING', agreeCount: 3 };
  }
  if (fallingVotes === 3) {
    return { direction: 'FALLING', agreeCount: 3 };
  }
  return {
    direction: 'UNCLEAR',
    agreeCount: Math.max(risingVotes, fallingVotes),
  };
}

export function classifyStability(
  volShortPct: string,
  volLongPct: string | null,
): LunoBtcMarketStability {
  if (volLongPct == null || isZeroDecimal(volLongPct)) {
    return 'NORMAL';
  }
  const ratio = divideDecimalStrings(volShortPct, volLongPct, 8);
  if (ratio == null) {
    return 'NORMAL';
  }
  if (compareDecimal(ratio, STABLE_VOL_RATIO_MAX) < 0) {
    return 'STABLE';
  }
  if (compareDecimal(ratio, UNSTABLE_VOL_RATIO_MIN) > 0) {
    return 'UNSTABLE';
  }
  return 'NORMAL';
}

export function classifyBuyingCondition(input: {
  price: string;
  sma20: string;
  averageBuyPriceMyr: string | null;
  drawdownPct: string | null;
  stability: LunoBtcMarketStability;
  direction: LunoBtcMarketDirection;
  momentumPct: string | null;
}): LunoBtcBuyingCondition {
  const extendedAboveMa = divideDecimalStrings(
    multiplyDecimalStrings(
      subtractDecimalStrings(input.price, input.sma20),
      '100',
    ),
    input.sma20,
    8,
  );
  const extremeBreakdown =
    input.direction === 'FALLING' &&
    input.momentumPct != null &&
    compareDecimal(input.momentumPct, EXTREME_BREAKDOWN_MOMENTUM_PCT) <= 0;
  if (input.stability === 'UNSTABLE' || extremeBreakdown) {
    return 'RISKY';
  }
  if (
    extendedAboveMa != null &&
    compareDecimal(extendedAboveMa, EXTENDED_ABOVE_MA_PCT) >= 0
  ) {
    return 'EXPENSIVE';
  }
  if (input.averageBuyPriceMyr && !isZeroDecimal(input.averageBuyPriceMyr)) {
    const vsAvg = divideDecimalStrings(
      multiplyDecimalStrings(
        subtractDecimalStrings(input.price, input.averageBuyPriceMyr),
        '100',
      ),
      input.averageBuyPriceMyr,
      8,
    );
    if (vsAvg != null && compareDecimal(vsAvg, EXPENSIVE_VS_AVG_PCT) >= 0) {
      return 'EXPENSIVE';
    }
    if (
      vsAvg != null &&
      compareDecimal(vsAvg, '0') < 0 &&
      input.drawdownPct != null &&
      compareDecimal(input.drawdownPct, MEANINGFUL_DRAWDOWN_PCT) <= 0
    ) {
      return 'GOOD';
    }
  }
  return 'NORMAL';
}

export function classifyConfidence(input: {
  agreeCount: number;
  direction: LunoBtcMarketDirection;
  status: LunoBtcMarketContextStatus;
  complete: boolean;
}): LunoBtcMarketConfidence {
  if (!input.complete || input.status !== 'FRESH') {
    return 'LOW';
  }
  if (input.direction !== 'UNCLEAR' && input.agreeCount >= 3) {
    return 'HIGH';
  }
  if (input.agreeCount >= 2) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function calculateMarketSnapshot(
  input: MarketSnapshotInput,
): MarketSnapshotView {
  const hourly = [...input.hourly].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );
  const daily = [...input.daily].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );
  const latest = hourly[hourly.length - 1] ?? null;
  const status = marketContextStatus(latest?.time ?? null, input.now);
  if (!latest) {
    return unavailableSnapshot();
  }
  const closes = hourly.map((row) => row.close);
  const sma20 = sma(closes, MARKET_SMA_SHORT);
  const sma50 = sma(closes, MARKET_SMA_LONG);
  const recentRoc = rateOfChangePct(closes, MARKET_RECENT_ROC_PERIOD);
  const momentum = rateOfChangePct(closes, MARKET_MOMENTUM_PERIOD);
  const volShort = returnStdevPct(closes, MARKET_VOLATILITY_PERIOD);
  const volLong = returnStdevPct(closes, MARKET_SMA_LONG);
  const recentDays = daily.slice(-MARKET_HIGH_LOW_DAYS);
  const recentHigh = recentDays.length
    ? recentDays.reduce(
        (acc, row) => maxDecimal(acc, row.high),
        recentDays[0].high,
      )
    : null;
  const recentLow = recentDays.length
    ? recentDays.reduce(
        (acc, row) => minDecimal(acc, row.low),
        recentDays[0].low,
      )
    : null;
  const drawdown =
    recentHigh && !isZeroDecimal(recentHigh)
      ? divideDecimalStrings(
          multiplyDecimalStrings(
            subtractDecimalStrings(latest.close, recentHigh),
            '100',
          ),
          recentHigh,
          8,
        )
      : null;
  const complete = Boolean(sma20 && sma50 && recentRoc && volShort);
  const directionResult =
    sma20 && sma50 && recentRoc
      ? classifyDirection({
          price: latest.close,
          sma20,
          sma50,
          recentRocPct: recentRoc,
        })
      : { direction: 'UNCLEAR' as const, agreeCount: 0 };
  const stability =
    volShort != null
      ? classifyStability(volShort, volLong)
      : ('NORMAL' as const);
  const buyingCondition =
    sma20 != null
      ? classifyBuyingCondition({
          price: latest.close,
          sma20,
          averageBuyPriceMyr: input.averageBuyPriceMyr,
          drawdownPct: drawdown,
          stability,
          direction: directionResult.direction,
          momentumPct: momentum,
        })
      : ('NORMAL' as const);
  const confidence = classifyConfidence({
    agreeCount: directionResult.agreeCount,
    direction: directionResult.direction,
    status,
    complete,
  });
  const shortTrendPct =
    sma20 != null
      ? divideDecimalStrings(
          multiplyDecimalStrings(
            subtractDecimalStrings(latest.close, sma20),
            '100',
          ),
          sma20,
          8,
        )
      : null;
  const mediumTrendPct =
    sma50 != null
      ? divideDecimalStrings(
          multiplyDecimalStrings(
            subtractDecimalStrings(latest.close, sma50),
            '100',
          ),
          sma50,
          8,
        )
      : null;
  const ageMinutes = divideDecimalStrings(
    String(Math.max(0, input.now.getTime() - latest.time.getTime())),
    String(60_000),
    2,
  );
  return {
    direction: directionResult.direction,
    buyingCondition,
    stability,
    confidence: status === 'FRESH' ? confidence : 'LOW',
    currentPriceMyr: latest.close,
    shortTrendPct,
    mediumTrendPct,
    drawdownFromRecentHighPct: drawdown,
    volatilityPct: volShort,
    momentumValue: momentum,
    sma20Myr: sma20,
    sma50Myr: sma50,
    recentHighMyr: recentHigh,
    recentLowMyr: recentLow,
    marketScore: marketScore({
      direction: directionResult.direction,
      agreeCount: directionResult.agreeCount,
      stability,
      drawdown,
      momentum,
    }),
    reason: marketReasons({
      direction: directionResult.direction,
      buyingCondition,
      stability,
      drawdown,
      shortTrendPct,
    }),
    source: MARKET_DATA_SOURCE,
    latestCandleAt: latest.time,
    marketDataAgeMinutes: ageMinutes,
    marketContextStatus: status,
  };
}

export function actionRiskRank(action: LunoBtcStrategyAction): number {
  if (action === 'BUY_MORE') {
    return 2;
  }
  if (action === 'BUY_SMALL') {
    return 1;
  }
  return 0;
}

export function applyMarketModifier(
  base: BuyDecision,
  market: MarketSnapshotView | null,
): BuyDecision & { modifiedByMarketContext: boolean } {
  if (
    !market ||
    market.marketContextStatus !== 'FRESH' ||
    base.action === 'STOP_BUYING_THIS_MONTH' ||
    base.action === 'BLOCKED' ||
    base.action === 'WAIT' ||
    base.action === 'HOLD'
  ) {
    return { ...base, modifiedByMarketContext: false };
  }
  const risky = market.buyingCondition === 'RISKY';
  const unstable = market.stability === 'UNSTABLE';
  if (!risky && !unstable) {
    return { ...base, modifiedByMarketContext: false };
  }
  if (base.action === 'BUY_SMALL') {
    return waitFrom(base, market);
  }
  if (base.action === 'BUY_MORE' && risky) {
    return waitFrom(base, market);
  }
  if (base.action === 'BUY_MORE' && unstable) {
    return buySmallFrom(base, market);
  }
  return { ...base, modifiedByMarketContext: false };
}

function waitFrom(
  base: BuyDecision,
  market: MarketSnapshotView,
): BuyDecision & { modifiedByMarketContext: boolean } {
  return {
    ...base,
    action: 'WAIT',
    displayAction: displayActionFor('WAIT'),
    suggestedAmountMyr: null,
    expectedRemainingAfterMyr: base.monthlyRemainingMyr,
    topUpNeededMyr: '0.00',
    source: null,
    reason: [
      ...base.reason,
      market.stability === 'UNSTABLE'
        ? 'Market movement is unusually unstable, so no buy is suggested now.'
        : 'Market conditions are risky, so no buy is suggested now.',
    ],
    modifiedByMarketContext: true,
  };
}

function buySmallFrom(
  base: BuyDecision,
  market: MarketSnapshotView,
): BuyDecision & { modifiedByMarketContext: boolean } {
  if (base.monthlyBudgetMyr == null || base.monthlyRemainingMyr == null) {
    return waitFrom(base, market);
  }
  let suggested = capSuggestedAmount({
    monthlyBudgetMyr: base.monthlyBudgetMyr,
    fraction: FIRST_BUY_FRACTION,
    remainingMyr: base.monthlyRemainingMyr,
    maxAllowedNewSpendMyr: base.maxAllowedNewSpendMyr,
    sleeveMyr: null,
  });
  if (
    suggested != null &&
    base.suggestedAmountMyr != null &&
    compareDecimal(suggested, base.suggestedAmountMyr) > 0
  ) {
    suggested = base.suggestedAmountMyr;
  }
  if (suggested == null || compareDecimal(suggested, '0') <= 0) {
    return waitFrom(base, market);
  }
  if (actionRiskRank('BUY_SMALL') > actionRiskRank(base.action)) {
    return { ...base, modifiedByMarketContext: false };
  }
  const expected = subtractDecimalStrings(base.monthlyRemainingMyr, suggested);
  return {
    ...base,
    action: 'BUY_SMALL',
    displayAction: displayActionFor('BUY_SMALL'),
    suggestedAmountMyr: suggested,
    expectedRemainingAfterMyr: expected,
    topUpNeededMyr: topUpNeededMyr(suggested, base.lunoMyrAvailableMyr),
    reason: [
      'The deeper buy zone was reached.',
      'Market movement is unusually unstable, so the buy amount was reduced.',
    ],
    modifiedByMarketContext: true,
  };
}

function unavailableSnapshot(): MarketSnapshotView {
  return {
    direction: 'UNCLEAR',
    buyingCondition: 'NORMAL',
    stability: 'NORMAL',
    confidence: 'LOW',
    currentPriceMyr: null,
    shortTrendPct: null,
    mediumTrendPct: null,
    drawdownFromRecentHighPct: null,
    volatilityPct: null,
    momentumValue: null,
    sma20Myr: null,
    sma50Myr: null,
    recentHighMyr: null,
    recentLowMyr: null,
    marketScore: null,
    reason: ['Market data is not available yet.'],
    source: MARKET_DATA_SOURCE,
    latestCandleAt: null,
    marketDataAgeMinutes: null,
    marketContextStatus: 'UNAVAILABLE',
  };
}

function marketReasons(input: {
  direction: LunoBtcMarketDirection;
  buyingCondition: LunoBtcBuyingCondition;
  stability: LunoBtcMarketStability;
  drawdown: string | null;
  shortTrendPct: string | null;
}): string[] {
  const reasons: string[] = [];
  if (
    input.shortTrendPct != null &&
    compareDecimal(input.shortTrendPct, '0') < 0
  ) {
    reasons.push('BTC is below its short-term average.');
  } else if (
    input.shortTrendPct != null &&
    compareDecimal(input.shortTrendPct, '0') > 0
  ) {
    reasons.push('BTC is above its short-term average.');
  }
  if (input.drawdown != null && compareDecimal(input.drawdown, '0') < 0) {
    const abs = input.drawdown.startsWith('-')
      ? input.drawdown.slice(1)
      : input.drawdown;
    const rounded = divideDecimalStrings(abs, '1', 1) ?? abs;
    reasons.push(`Price is ${rounded}% below the recent high.`);
  }
  if (input.stability === 'UNSTABLE') {
    reasons.push('Market movement is unusually unstable.');
  } else if (input.stability === 'STABLE') {
    reasons.push('Market movement is currently stable.');
  }
  if (input.direction === 'UNCLEAR') {
    reasons.push('Market direction is mixed right now.');
  }
  if (reasons.length === 0) {
    reasons.push('No strong market condition stands out.');
  }
  return reasons;
}

function marketScore(input: {
  direction: LunoBtcMarketDirection;
  agreeCount: number;
  stability: LunoBtcMarketStability;
  drawdown: string | null;
  momentum: string | null;
}): string {
  let score = 40;
  score += input.agreeCount * 10;
  if (input.direction === 'UNCLEAR') {
    score -= 10;
  }
  if (input.stability === 'STABLE') {
    score += 10;
  }
  if (input.stability === 'UNSTABLE') {
    score -= 20;
  }
  if (input.drawdown != null && compareDecimal(input.drawdown, '-5') <= 0) {
    score += 10;
  }
  if (input.momentum != null && compareDecimal(input.momentum, '0') < 0) {
    score += 5;
  }
  return String(Math.max(0, Math.min(100, score)));
}
