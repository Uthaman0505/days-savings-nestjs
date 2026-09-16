import {
  evaluateBtcBuyDecision,
  type BuyDecisionInput,
} from './luno-btc-decision';
import {
  applyMarketModifier,
  calculateMarketSnapshot,
  classifyBuyingCondition,
  classifyConfidence,
  classifyDirection,
  classifyStability,
  marketContextStatus,
  sma,
  type MarketCandleInput,
  type MarketSnapshotView,
} from './luno-btc-market';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function hourlySeries(
  start: number,
  step: number,
  count: number,
): MarketCandleInput[] {
  const rows: MarketCandleInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const close = String(start + step * i);
    rows.push({
      time: new Date(NOW.getTime() - (count - 1 - i) * 60 * 60 * 1000),
      open: close,
      high: close,
      low: close,
      close,
      volume: '1',
    });
  }
  return rows;
}

function dailyFromHourly(hourly: MarketCandleInput[]): MarketCandleInput[] {
  return hourly.filter((_, index) => index % 24 === 23).slice(-7);
}

function baseDecision(
  action: 'BUY_MORE' | 'BUY_SMALL' | 'WAIT' | 'HOLD' | 'STOP_BUYING_THIS_MONTH',
  suggested: string | null,
) {
  const input: BuyDecisionInput = {
    accountingStatus: 'READY',
    currentBtcPriceMyr: '290000',
    averageBuyPriceMyr: '326000',
    monthlyBudgetMyr: '100',
    monthlyUsedMyr: '50',
    monthlyRemainingMyr: '50',
    maxAllowedNewSpendMyr: '50',
    normalBuyAllocationMyr: '50',
    dipReserveAllocationMyr: '50',
    lunoMyrAvailableMyr: '64.37',
    actedZones: action === 'BUY_MORE' ? ['FIRST_BUY_ZONE'] : [],
    remainingNormalBuyMyr: '50',
    remainingDipReserveMyr: '50',
  };
  if (action === 'BUY_SMALL') {
    return evaluateBtcBuyDecision({
      ...input,
      currentBtcPriceMyr: '309000',
      actedZones: [],
    });
  }
  if (action === 'WAIT') {
    return evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '317000' });
  }
  if (action === 'HOLD') {
    return evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '326000' });
  }
  if (action === 'STOP_BUYING_THIS_MONTH') {
    return evaluateBtcBuyDecision({
      ...input,
      monthlyRemainingMyr: '0',
      maxAllowedNewSpendMyr: '0',
    });
  }
  return {
    ...evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '290000' }),
    action,
    suggestedAmountMyr: suggested,
  };
}

function fallingUnstable(): MarketSnapshotView {
  const hourly = hourlySeries(400000, -1500, 60);
  return calculateMarketSnapshot({
    hourly,
    daily: dailyFromHourly(hourly),
    now: NOW,
    averageBuyPriceMyr: '326000',
  });
}

describe('Luno BTC market intelligence', () => {
  it('classifies rising, falling, and unclear direction', () => {
    expect(
      classifyDirection({
        price: '110',
        sma20: '100',
        sma50: '90',
        recentRocPct: '2',
      }).direction,
    ).toBe('RISING');
    expect(
      classifyDirection({
        price: '90',
        sma20: '100',
        sma50: '110',
        recentRocPct: '-2',
      }).direction,
    ).toBe('FALLING');
    expect(
      classifyDirection({
        price: '110',
        sma20: '100',
        sma50: '120',
        recentRocPct: '-1',
      }).direction,
    ).toBe('UNCLEAR');
  });

  it('classifies stability from relative volatility', () => {
    expect(classifyStability('1', '2')).toBe('STABLE');
    expect(classifyStability('2', '2')).toBe('NORMAL');
    expect(classifyStability('4', '2')).toBe('UNSTABLE');
  });

  it('classifies buying condition without treating it as a buy signal', () => {
    expect(
      classifyBuyingCondition({
        price: '300000',
        sma20: '310000',
        averageBuyPriceMyr: '326000',
        drawdownPct: '-8',
        stability: 'NORMAL',
        direction: 'FALLING',
        momentumPct: '-6',
      }),
    ).toBe('GOOD');
    expect(
      classifyBuyingCondition({
        price: '350000',
        sma20: '310000',
        averageBuyPriceMyr: '326000',
        drawdownPct: '2',
        stability: 'NORMAL',
        direction: 'RISING',
        momentumPct: '4',
      }),
    ).toBe('EXPENSIVE');
    expect(
      classifyBuyingCondition({
        price: '300000',
        sma20: '310000',
        averageBuyPriceMyr: '326000',
        drawdownPct: '-8',
        stability: 'UNSTABLE',
        direction: 'FALLING',
        momentumPct: '-20',
      }),
    ).toBe('RISKY');
  });

  it('sets confidence from agreement and freshness', () => {
    expect(
      classifyConfidence({
        agreeCount: 3,
        direction: 'FALLING',
        status: 'FRESH',
        complete: true,
      }),
    ).toBe('HIGH');
    expect(
      classifyConfidence({
        agreeCount: 2,
        direction: 'UNCLEAR',
        status: 'FRESH',
        complete: true,
      }),
    ).toBe('MEDIUM');
    expect(
      classifyConfidence({
        agreeCount: 3,
        direction: 'FALLING',
        status: 'STALE',
        complete: true,
      }),
    ).toBe('LOW');
  });

  it('marks stale and missing market data', () => {
    expect(
      marketContextStatus(new Date(NOW.getTime() - 30 * 60 * 1000), NOW),
    ).toBe('FRESH');
    expect(
      marketContextStatus(new Date(NOW.getTime() - 5 * 60 * 60 * 1000), NOW),
    ).toBe('STALE');
    expect(marketContextStatus(null, NOW)).toBe('UNAVAILABLE');
  });

  it('builds a reproducible falling snapshot from 1h candles', () => {
    const hourly = hourlySeries(400000, -800, 60);
    const first = calculateMarketSnapshot({
      hourly,
      daily: dailyFromHourly(hourly),
      now: NOW,
      averageBuyPriceMyr: '326000',
    });
    const second = calculateMarketSnapshot({
      hourly,
      daily: dailyFromHourly(hourly),
      now: NOW,
      averageBuyPriceMyr: '326000',
    });
    expect(first.direction).toBe('FALLING');
    expect(first).toEqual(second);
    expect(
      sma(
        hourly.map((row) => row.close),
        20,
      ),
    ).not.toBeNull();
  });

  it('builds a rising snapshot and an unavailable snapshot for missing candles', () => {
    const hourly = hourlySeries(300000, 800, 60);
    const rising = calculateMarketSnapshot({
      hourly,
      daily: dailyFromHourly(hourly),
      now: NOW,
      averageBuyPriceMyr: '326000',
    });
    expect(rising.direction).toBe('RISING');
    const missing = calculateMarketSnapshot({
      hourly: [],
      daily: [],
      now: NOW,
      averageBuyPriceMyr: '326000',
    });
    expect(missing.marketContextStatus).toBe('UNAVAILABLE');
    expect(missing.confidence).toBe('LOW');
    expect(sma(['1.00', '2.00', '3.00'], 3)).toBe('2');
  });

  it('classifies ordinary buying condition as NORMAL', () => {
    expect(
      classifyBuyingCondition({
        price: '320000',
        sma20: '318000',
        averageBuyPriceMyr: '326000',
        drawdownPct: '-1',
        stability: 'NORMAL',
        direction: 'UNCLEAR',
        momentumPct: '1',
      }),
    ).toBe('NORMAL');
  });

  it('downgrades BUY MORE to WAIT when the market is risky', () => {
    const base = baseDecision('BUY_MORE', '30');
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'RISKY' as const,
      stability: 'UNSTABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    expect(applyMarketModifier(base, market).action).toBe('WAIT');
  });

  it('never increases suggested amount and keeps the monthly cap', () => {
    const base = evaluateBtcBuyDecision({
      accountingStatus: 'READY',
      currentBtcPriceMyr: '290000',
      averageBuyPriceMyr: '326000',
      monthlyBudgetMyr: '100',
      monthlyUsedMyr: '90',
      monthlyRemainingMyr: '10',
      maxAllowedNewSpendMyr: '10',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '50',
      lunoMyrAvailableMyr: '64.37',
      actedZones: ['FIRST_BUY_ZONE'],
      remainingNormalBuyMyr: '0',
      remainingDipReserveMyr: '10',
    });
    expect(base.action).toBe('BUY_MORE');
    expect(Number(base.suggestedAmountMyr)).toBeLessThanOrEqual(10);
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'NORMAL' as const,
      stability: 'UNSTABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    const final = applyMarketModifier(base, market);
    expect(Number(final.suggestedAmountMyr ?? '0')).toBeLessThanOrEqual(
      Number(base.suggestedAmountMyr),
    );
    expect(Number(final.suggestedAmountMyr ?? '0')).toBeLessThanOrEqual(10);
  });

  it('does not reopen an already acted zone', () => {
    const base = evaluateBtcBuyDecision({
      accountingStatus: 'READY',
      currentBtcPriceMyr: '309000',
      averageBuyPriceMyr: '326000',
      monthlyBudgetMyr: '100',
      monthlyUsedMyr: '20',
      monthlyRemainingMyr: '80',
      maxAllowedNewSpendMyr: '50',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '50',
      lunoMyrAvailableMyr: '64.37',
      actedZones: ['FIRST_BUY_ZONE'],
      remainingNormalBuyMyr: '30',
      remainingDipReserveMyr: '50',
    });
    expect(base.action).toBe('WAIT');
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'GOOD' as const,
      stability: 'STABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    expect(applyMarketModifier(base, market).action).toBe('WAIT');
    expect(applyMarketModifier(base, market).modifiedByMarketContext).toBe(
      false,
    );
  });

  it('downgrades BUY MORE to BUY SMALL when unstable, never increasing the amount', () => {
    const base = baseDecision('BUY_MORE', '30');
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'NORMAL' as const,
      stability: 'UNSTABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    const final = applyMarketModifier(base, market);
    expect(base.action).toBe('BUY_MORE');
    expect(final.action).toBe('BUY_SMALL');
    expect(final.modifiedByMarketContext).toBe(true);
    expect(Number(final.suggestedAmountMyr)).toBeLessThanOrEqual(
      Number(base.suggestedAmountMyr),
    );
  });

  it('downgrades BUY SMALL to WAIT when risky or unstable', () => {
    const base = baseDecision('BUY_SMALL', '20');
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'RISKY' as const,
      stability: 'UNSTABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    const final = applyMarketModifier(base, market);
    expect(final.action).toBe('WAIT');
    expect(final.suggestedAmountMyr).toBeNull();
  });

  it('never upgrades WAIT, HOLD, or STOP', () => {
    const market = {
      ...fallingUnstable(),
      buyingCondition: 'GOOD' as const,
      stability: 'STABLE' as const,
      marketContextStatus: 'FRESH' as const,
    };
    expect(applyMarketModifier(baseDecision('WAIT', null), market).action).toBe(
      'WAIT',
    );
    expect(applyMarketModifier(baseDecision('HOLD', null), market).action).toBe(
      'HOLD',
    );
    expect(
      applyMarketModifier(baseDecision('STOP_BUYING_THIS_MONTH', null), market)
        .action,
    ).toBe('STOP_BUYING_THIS_MONTH');
  });

  it('does not modify Phase 4 when market data is stale', () => {
    const base = baseDecision('BUY_MORE', '30');
    const market = {
      ...fallingUnstable(),
      stability: 'UNSTABLE' as const,
      marketContextStatus: 'STALE' as const,
    };
    const final = applyMarketModifier(base, market);
    expect(final.action).toBe(base.action);
    expect(final.modifiedByMarketContext).toBe(false);
  });
});
