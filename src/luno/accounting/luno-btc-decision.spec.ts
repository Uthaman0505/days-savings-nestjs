import {
  amountsMatch,
  capSuggestedAmount,
  evaluateBtcBuyDecision,
  priceDifferencePct,
  stagedTargetMyr,
  topUpNeededMyr,
  zoneFromPriceDifference,
  type BuyDecisionInput,
} from './luno-btc-decision';

function input(partial: Partial<BuyDecisionInput> = {}): BuyDecisionInput {
  return {
    accountingStatus: 'READY',
    currentBtcPriceMyr: '317000',
    averageBuyPriceMyr: '326000',
    monthlyBudgetMyr: '100',
    monthlyUsedMyr: '50',
    monthlyRemainingMyr: '50',
    maxAllowedNewSpendMyr: '50',
    normalBuyAllocationMyr: '50',
    dipReserveAllocationMyr: '50',
    lunoMyrAvailableMyr: '64.37',
    actedZones: [],
    remainingNormalBuyMyr: '50',
    remainingDipReserveMyr: '50',
    ...partial,
  };
}

describe('Luno BTC buy decision', () => {
  it('computes price difference with decimal-safe math', () => {
    const pct = priceDifferencePct('317000', '326000');
    expect(pct).not.toBeNull();
    expect(Number(pct)).toBeCloseTo(-2.7607362, 5);
    expect(zoneFromPriceDifference(pct!)).toBe('SMALL_DISCOUNT');
  });

  it('returns HOLD at or above average', () => {
    const hold = evaluateBtcBuyDecision(
      input({ currentBtcPriceMyr: '326000' }),
    );
    expect(hold.action).toBe('HOLD');
    expect(hold.displayAction).toBe('HOLD');
    expect(hold.zone).toBe('ABOVE_AVERAGE');
    expect(hold.suggestedAmountMyr).toBeNull();
  });

  it('returns WAIT between 0% and -5%', () => {
    const wait = evaluateBtcBuyDecision(input());
    expect(wait.action).toBe('WAIT');
    expect(wait.displayAction).toBe('WAIT');
    expect(wait.zone).toBe('SMALL_DISCOUNT');
  });

  it('returns BUY SMALL between -5% and -10%', () => {
    const buy = evaluateBtcBuyDecision(input({ currentBtcPriceMyr: '309000' }));
    expect(zoneFromPriceDifference(buy.priceDifferencePct!)).toBe(
      'FIRST_BUY_ZONE',
    );
    expect(buy.action).toBe('BUY_SMALL');
    expect(buy.displayAction).toBe('BUY SMALL');
    expect(buy.suggestedAmountMyr).toBe('20');
    expect(buy.source).toBe('NORMAL_BUY');
  });

  it('returns BUY MORE between -10% and -15%', () => {
    const buy = evaluateBtcBuyDecision(input({ currentBtcPriceMyr: '290000' }));
    expect(buy.zone).toBe('STRONGER_BUY_ZONE');
    expect(buy.action).toBe('BUY_MORE');
    expect(buy.suggestedAmountMyr).toBe('30');
    expect(buy.source).toBe('DIP_BUY');
  });

  it('returns BUY MORE at or below -15% without dumping the remaining budget', () => {
    const buy = evaluateBtcBuyDecision(input({ currentBtcPriceMyr: '270000' }));
    expect(buy.zone).toBe('DEEPER_DIP');
    expect(buy.action).toBe('BUY_MORE');
    expect(buy.suggestedAmountMyr).toBe('40');
    expect(buy.suggestedAmountMyr).not.toBe('50');
  });

  it('caps suggested amount to monthly remaining and max allowed spend', () => {
    const buy = evaluateBtcBuyDecision(
      input({
        currentBtcPriceMyr: '309000',
        monthlyRemainingMyr: '15',
        maxAllowedNewSpendMyr: '15',
      }),
    );
    expect(buy.suggestedAmountMyr).toBe('15');
    expect(
      capSuggestedAmount({
        monthlyBudgetMyr: '100',
        fraction: '0.30',
        remainingMyr: '20',
        maxAllowedNewSpendMyr: '50',
        sleeveMyr: '50',
      }),
    ).toBe('20');
  });

  it('stops buying when remaining is zero', () => {
    const stop = evaluateBtcBuyDecision(
      input({
        monthlyRemainingMyr: '0',
        maxAllowedNewSpendMyr: '0',
      }),
    );
    expect(stop.action).toBe('STOP_BUYING_THIS_MONTH');
    expect(stop.displayAction).toBe('STOP BUYING THIS MONTH');
  });

  it('blocks when accounting is not READY or budget is missing', () => {
    expect(
      evaluateBtcBuyDecision(input({ accountingStatus: 'PARTIAL' })).action,
    ).toBe('BLOCKED');
    expect(
      evaluateBtcBuyDecision(
        input({ monthlyBudgetMyr: null, monthlyRemainingMyr: null }),
      ).action,
    ).toBe('BLOCKED');
    expect(
      evaluateBtcBuyDecision(input({ currentBtcPriceMyr: null })).action,
    ).toBe('BLOCKED');
    expect(
      evaluateBtcBuyDecision(input({ averageBuyPriceMyr: null })).action,
    ).toBe('BLOCKED');
  });

  it('does not repeat BUY SMALL after the first-buy zone was already used', () => {
    const wait = evaluateBtcBuyDecision(
      input({
        currentBtcPriceMyr: '309000',
        actedZones: ['FIRST_BUY_ZONE'],
      }),
    );
    expect(wait.action).toBe('WAIT');
    expect(wait.zone).toBe('FIRST_BUY_ZONE');
  });

  it('still allows BUY MORE in a stronger zone after the first zone was used', () => {
    const buy = evaluateBtcBuyDecision(
      input({
        currentBtcPriceMyr: '290000',
        actedZones: ['FIRST_BUY_ZONE'],
      }),
    );
    expect(buy.action).toBe('BUY_MORE');
    expect(buy.zone).toBe('STRONGER_BUY_ZONE');
  });

  it('calculates top-up shortfall without reducing the suggested amount', () => {
    const buy = evaluateBtcBuyDecision(
      input({
        currentBtcPriceMyr: '309000',
        lunoMyrAvailableMyr: '14.37',
      }),
    );
    expect(buy.suggestedAmountMyr).toBe('20');
    expect(topUpNeededMyr('20', '14.37')).toBe('5.63');
    expect(buy.topUpNeededMyr).toBe('5.63');
  });

  it('matches purchase amounts with a small fee-safe tolerance', () => {
    expect(amountsMatch('20', '20')).toBe(true);
    expect(amountsMatch('20.40', '20')).toBe(true);
    expect(amountsMatch('50', '20')).toBe(false);
    expect(stagedTargetMyr('100', 'FIRST_BUY_ZONE')).toBe('20');
  });
});
