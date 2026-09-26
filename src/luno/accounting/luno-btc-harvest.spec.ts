import {
  addDecimalStrings,
  compareDecimal,
  divideDecimalStrings,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '../luno-decimal';
import { cloneFifoLots } from './luno-btc-fifo';
import {
  buildOpenPositionMetrics,
  defaultHarvestSettings,
  evaluateBtcHarvest,
  harvestZoneFromProfitPct,
  saleMatchesHarvestRecommendation,
  splitRealizedProfit,
} from './luno-btc-harvest';
import { previewFifoSale } from './luno-btc-sale-preview';
import type { FifoLot } from './luno-btc.types';

function lot(qty: string, cost: string, key = 'lot-1'): FifoLot {
  return {
    key,
    sourceTransactionId: `tx-${key}`,
    reference: key,
    acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
    btcQuantityOriginal: qty,
    btcQuantityRemaining: qty,
    myrCostOriginal: cost,
    myrCostRemaining: cost,
    feeMyr: '0',
    effectiveCostMyr: cost,
    origin: 'BUY',
  };
}

function harvest(input: {
  qty: string;
  cost: string;
  price: string;
  lifetimeRealized?: string;
  lifetimePutIn?: string;
  principalRecovered?: string;
  actedZones?: Parameters<typeof evaluateBtcHarvest>[0]['actedZones'];
  settings?: ReturnType<typeof defaultHarvestSettings>;
  lots?: FifoLot[];
  accountingStatus?: string;
}) {
  const settings = input.settings ?? defaultHarvestSettings();
  const lots = input.lots ?? [lot(input.qty, input.cost)];
  const metrics = buildOpenPositionMetrics({
    currentBtcBalance: input.qty,
    currentPriceMyr: input.price,
    openAverageBuyPriceMyr: divideDecimalStrings(input.cost, input.qty, 18),
    openCostBasisMyr: input.cost,
    lifetimeMoneyPutInMyr: input.lifetimePutIn ?? input.cost,
    principalRecoveredMyr: input.principalRecovered ?? '0',
    lifetimeRealizedProfitMyr: input.lifetimeRealized ?? '0',
  });
  return evaluateBtcHarvest({
    accountingStatus: input.accountingStatus ?? 'READY',
    metrics,
    lots,
    settings,
    actedZones: input.actedZones ?? [],
  });
}

describe('open-position harvest math', () => {
  it('confirms currentValue - remainingCost = unrealizedProfit', () => {
    const qty = '0.00000504';
    const price = '315451';
    const avg = '333546.56';
    const remainingCost = multiplyDecimalStrings(qty, avg);
    const metrics = buildOpenPositionMetrics({
      currentBtcBalance: qty,
      currentPriceMyr: price,
      openAverageBuyPriceMyr: avg,
      openCostBasisMyr: remainingCost,
      lifetimeMoneyPutInMyr: '871.00',
      principalRecoveredMyr: '818.89',
      lifetimeRealizedProfitMyr: '191.80',
    });
    expect(metrics.currentMarketValueMyr).not.toBeNull();
    expect(metrics.unrealizedProfitMyr).toBe(
      subtractDecimalStrings(metrics.currentMarketValueMyr!, remainingCost),
    );
    expect(metrics.unrealizedProfitPct).toBe(
      divideDecimalStrings(
        multiplyDecimalStrings(subtractDecimalStrings(price, avg), '100'),
        avg,
        8,
      ),
    );
    expect(compareDecimal(metrics.unrealizedProfitMyr!, '0.39')).toBeLessThan(
      0,
    );
    expect(metrics.unrealizedProfitMyr).not.toBe('0.39');
  });

  it('computes unrealizedProfitPct from remaining cost when remainingCost > 0', () => {
    const metrics = buildOpenPositionMetrics({
      currentBtcBalance: '0.001',
      currentPriceMyr: '60000',
      openAverageBuyPriceMyr: '50000',
      openCostBasisMyr: '50',
      lifetimeMoneyPutInMyr: '50',
      principalRecoveredMyr: '0',
      lifetimeRealizedProfitMyr: '0',
    });
    expect(metrics.currentMarketValueMyr).toBe('60');
    expect(metrics.unrealizedProfitMyr).toBe('10');
    expect(metrics.unrealizedProfitPct).toBe('20');
    const fromValue = divideDecimalStrings(
      multiplyDecimalStrings(
        subtractDecimalStrings(
          metrics.currentMarketValueMyr!,
          metrics.openCostBasisMyr,
        ),
        '100',
      ),
      metrics.openCostBasisMyr,
      8,
    );
    expect(fromValue).toBe(metrics.unrealizedProfitPct);
  });
});

describe('harvest zones', () => {
  const settings = defaultHarvestSettings();

  it('holds below +15%', () => {
    const decision = harvest({ qty: '0.004', cost: '200', price: '57000' });
    expect(decision.action).toBe('HOLD');
    expect(decision.displayAction).toBe('HOLD');
    expect(decision.zone).toBe('BELOW_FIRST');
    expect(decision.recommendation?.suggestedHarvestMyr).toBeNull();
    expect(decision.reason[0]).toContain(
      'has not reached the first harvest zone',
    );
  });

  it('takes some profit from +15% to < +25%', () => {
    const decision = harvest({ qty: '0.004', cost: '200', price: '60000' });
    expect(harvestZoneFromProfitPct('20', settings)).toBe('FIRST_HARVEST');
    expect(decision.action).toBe('TAKE_SOME_PROFIT');
    expect(decision.displayAction).toBe('TAKE SOME PROFIT');
    expect(decision.zone).toBe('FIRST_HARVEST');
    expect(decision.recommendation?.suggestedHarvestMyr).toBe('8');
  });

  it('protects profit from +25% to < +40%', () => {
    const decision = harvest({ qty: '0.004', cost: '200', price: '65000' });
    expect(decision.action).toBe('PROTECT_PROFIT');
    expect(decision.zone).toBe('PROTECT');
    expect(decision.recommendation?.suggestedHarvestMyr).toBe('21');
  });

  it('protects profit at >= +40%', () => {
    const decision = harvest({ qty: '0.004', cost: '200', price: '70000' });
    expect(decision.action).toBe('PROTECT_PROFIT');
    expect(decision.zone).toBe('HIGH_PROTECT');
    expect(decision.recommendation?.suggestedHarvestMyr).toBe('40');
  });
});

describe('harvest trigger uses current open position only', () => {
  it('does not harvest from large lifetime realized profit', () => {
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '57000',
      lifetimeRealized: '10000',
      lifetimePutIn: '5000',
      principalRecovered: '4800',
    });
    expect(decision.action).toBe('HOLD');
    expect(decision.recommendation?.suggestedHarvestMyr).toBeNull();
  });

  it('can harvest from current open profit even when lifetime realized is zero', () => {
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '60000',
      lifetimeRealized: '0',
    });
    expect(decision.action).toBe('TAKE_SOME_PROFIT');
  });
});

describe('harvest sizing', () => {
  it('sizes harvest from unrealized profit, not portfolio value', () => {
    const decision = harvest({ qty: '0.001', cost: '50', price: '60000' });
    expect(decision.currentPosition.unrealizedProfitMyr).toBe('10');
    expect(decision.currentPosition.marketValueMyr).toBe('60');
    expect(decision.action).toBe('HOLD');
    expect(decision.reason[0]).toContain('still too small to be practical');
    expect(decision.recommendation?.suggestedHarvestMyr).toBeNull();
  });

  it('uses RM5 as the default practical minimum', () => {
    const below = harvest({ qty: '0.002', cost: '100', price: '57500' });
    expect(below.action).toBe('HOLD');
    expect(below.reason[0]).toContain('still too small to be practical');
    const above = harvest({ qty: '0.004', cost: '200', price: '57500' });
    expect(above.action).toBe('TAKE_SOME_PROFIT');
    expect(above.recommendation?.suggestedHarvestMyr).toBe('6');
    expect(
      compareDecimal(above.recommendation?.suggestedHarvestMyr ?? '0', '5'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('holds when suggested harvest is below the configured minimum', () => {
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '60000',
      settings: defaultHarvestSettings({ minimumHarvestMyr: '20' }),
    });
    expect(decision.action).toBe('HOLD');
    expect(decision.reason[0]).toContain('still too small to be practical');
  });
});

describe('permanent BTC core', () => {
  it('never produces SELL ALL and keeps at least 50% of current BTC', () => {
    const decision = harvest({ qty: '0.004', cost: '200', price: '70000' });
    expect(decision.action).not.toBe('SELL ALL');
    expect(decision.displayAction).not.toContain('SELL ALL');
    expect(
      compareDecimal(decision.recommendation?.remainingBtc ?? '0', '0.002'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('HOLD CORE when a core-floor shrink makes the sale impractical', () => {
    const settings = defaultHarvestSettings();
    settings.minimumCorePct = '99.9';
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '60000',
      settings,
    });
    expect(decision.action).toBe('HOLD_CORE');
    expect(decision.displayAction).toBe('HOLD CORE');
    expect(decision.reason[0]).toBe('Keep this BTC as your long-term core.');
    expect(decision.recommendation?.suggestedHarvestMyr).toBeNull();
  });

  it('reduces a sale that would dip below a higher core floor', () => {
    const settings = defaultHarvestSettings();
    settings.minimumCorePct = '95';
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '70000',
      settings,
    });
    expect(decision.action).toBe('PROTECT_PROFIT');
    expect(
      compareDecimal(decision.recommendation?.remainingBtc ?? '0', '0.0038'),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('FIFO sale preview', () => {
  it('previews FIFO cost released and realized profit without mutating lots', () => {
    const lots = [lot('0.002', '50', 'a'), lot('0.002', '80', 'b')];
    const snapshot = cloneFifoLots(lots);
    const preview = previewFifoSale({
      lots,
      btcToSell: '0.003',
      estimatedSalePriceMyr: '60000',
      estimatedFeeMyr: '2',
    });
    expect(preview).not.toBeNull();
    expect(preview!.grossProceedsMyr).toBe('180');
    expect(preview!.estimatedFeesMyr).toBe('2');
    expect(preview!.netProceedsMyr).toBe('178');
    expect(preview!.fifoCostBasisReleasedMyr).toBe('90');
    expect(preview!.estimatedRealizedProfitMyr).toBe('88');
    expect(preview!.remainingBtc).toBe('0.001');
    expect(preview!.remainingCostBasisMyr).toBe('40');
    expect(lots).toEqual(snapshot);
    expect(lots[0].btcQuantityRemaining).toBe('0.002');
    expect(lots[1].myrCostRemaining).toBe('80');
  });

  it('treats a zero estimated sell fee as estimated, not a live Luno fee', () => {
    const preview = previewFifoSale({
      lots: [lot('0.001', '50')],
      btcToSell: '0.0002',
      estimatedSalePriceMyr: '60000',
      estimatedFeeMyr: '0',
    });
    expect(preview!.estimatedFeesMyr).toBe('0');
    expect(preview!.grossProceedsMyr).toBe(preview!.netProceedsMyr);
  });
});

describe('principal recovery and profit split', () => {
  it('projects principal recovery from FIFO cost released, not sale proceeds', () => {
    const decision = harvest({
      qty: '0.004',
      cost: '200',
      price: '70000',
      lifetimePutIn: '500',
      principalRecovered: '100',
    });
    expect(decision.principalRecovery.recoveredMyr).toBe('100');
    expect(decision.principalRecovery.projectedRecoveredMyr).toBe(
      addDecimalStrings(
        '100',
        decision.recommendation?.fifoCostBasisReleasedMyr ?? '0',
      ),
    );
    expect(decision.salePreview?.fifoCostBasisReleasedMyr).toBe(
      decision.recommendation?.fifoCostBasisReleasedMyr,
    );
  });

  it('splits 70/30 of realized profit only', () => {
    expect(splitRealizedProfit('10', defaultHarvestSettings())).toEqual({
      protectedProfitMyr: '7',
      reinvestmentReserveMyr: '3',
    });
    expect(splitRealizedProfit('0', defaultHarvestSettings())).toEqual({
      protectedProfitMyr: '0',
      reinvestmentReserveMyr: '0',
    });
    const decision = harvest({ qty: '0.004', cost: '200', price: '70000' });
    expect(decision.profitSplit.protectedProfitMyr).not.toBe(
      decision.recommendation?.suggestedHarvestMyr,
    );
    expect(
      addDecimalStrings(
        decision.profitSplit.protectedProfitMyr ?? '0',
        decision.profitSplit.reinvestmentReserveMyr ?? '0',
      ),
    ).toBe(decision.recommendation?.estimatedRealizedProfitMyr);
  });
});

describe('duplicate-zone and matching', () => {
  it('blocks the same harvest zone after it was acted', () => {
    const again = harvest({
      qty: '0.004',
      cost: '200',
      price: '60000',
      actedZones: ['FIRST_HARVEST'],
    });
    expect(again.action).toBe('HOLD');
    expect(again.reason[0]).toContain('already used');
  });

  it('allows a stronger profit zone after the first harvest was acted', () => {
    const stronger = harvest({
      qty: '0.004',
      cost: '200',
      price: '65000',
      actedZones: ['FIRST_HARVEST'],
    });
    expect(stronger.action).toBe('PROTECT_PROFIT');
    expect(stronger.zone).toBe('PROTECT');
  });

  it('matches a sale that is close in BTC or MYR and rejects unrelated sales', () => {
    expect(
      saleMatchesHarvestRecommendation({
        soldBtc: '0.000133',
        proceedsMyr: '8.01',
        suggestedBtc: '0.00013333',
        suggestedHarvestMyr: '8',
      }),
    ).toBe(true);
    expect(
      saleMatchesHarvestRecommendation({
        soldBtc: '0.01',
        proceedsMyr: '400',
        suggestedBtc: '0.00013333',
        suggestedHarvestMyr: '8',
      }),
    ).toBe(false);
  });
});

describe('decimal precision', () => {
  it('keeps harvest math on decimal strings', () => {
    const decision = harvest({
      qty: '0.00033333',
      cost: '100.00',
      price: '360000',
    });
    expect(decision.currentPosition.unrealizedProfitMyr).toMatch(
      /^\d+(\.\d+)?$/,
    );
    expect(typeof decision.currentPosition.unrealizedProfitMyr).toBe('string');
    expect(decision.currentPosition.unrealizedProfitPct).not.toMatch(/e/i);
  });
});
