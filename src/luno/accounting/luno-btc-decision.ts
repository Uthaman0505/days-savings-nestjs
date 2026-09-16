import {
  absDecimal,
  addDecimalStrings,
  asDecimalString,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  maxDecimal,
  minDecimal,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '../luno-decimal';
import { cashAppliedFee } from './luno-btc-fees';
import type { ClassifiedEvent } from './luno-btc.types';
import type {
  LunoBtcStrategyAction,
  LunoBtcStrategySource,
  LunoBtcStrategyZone,
} from '../entities/luno-btc-strategy-event.entity';

export const DECISION_TTL_MS = 24 * 60 * 60 * 1000;
export const FIRST_BUY_FRACTION = '0.20';
export const STRONGER_BUY_FRACTION = '0.30';
export const DEEPER_BUY_FRACTION = '0.40';
const MATCH_ABS_TOLERANCE_MYR = '2';
const MATCH_PCT_TOLERANCE = '15';

export type BuyDecisionInput = {
  accountingStatus: string;
  currentBtcPriceMyr: string | null;
  averageBuyPriceMyr: string | null;
  monthlyBudgetMyr: string | null;
  monthlyUsedMyr: string;
  monthlyRemainingMyr: string | null;
  maxAllowedNewSpendMyr: string;
  normalBuyAllocationMyr: string | null;
  dipReserveAllocationMyr: string | null;
  lunoMyrAvailableMyr: string | null;
  actedZones: LunoBtcStrategyZone[];
  remainingNormalBuyMyr: string | null;
  remainingDipReserveMyr: string | null;
};

export type BuyDecision = {
  action: LunoBtcStrategyAction;
  displayAction: string;
  zone: LunoBtcStrategyZone;
  source: LunoBtcStrategySource | null;
  suggestedAmountMyr: string | null;
  currentPriceMyr: string | null;
  averageBuyPriceMyr: string | null;
  priceDifferencePct: string | null;
  monthlyBudgetMyr: string | null;
  monthlyUsedMyr: string;
  monthlyRemainingMyr: string | null;
  maxAllowedNewSpendMyr: string;
  lunoMyrAvailableMyr: string | null;
  topUpNeededMyr: string | null;
  expectedRemainingAfterMyr: string | null;
  reason: string[];
};

export function priceDifferencePct(
  currentPriceMyr: string,
  averageBuyPriceMyr: string,
): string | null {
  if (isZeroDecimal(averageBuyPriceMyr)) {
    return null;
  }
  return divideDecimalStrings(
    multiplyDecimalStrings(
      subtractDecimalStrings(currentPriceMyr, averageBuyPriceMyr),
      '100',
    ),
    averageBuyPriceMyr,
    8,
  );
}

export function zoneFromPriceDifference(
  pct: string,
): Extract<
  LunoBtcStrategyZone,
  | 'ABOVE_AVERAGE'
  | 'SMALL_DISCOUNT'
  | 'FIRST_BUY_ZONE'
  | 'STRONGER_BUY_ZONE'
  | 'DEEPER_DIP'
> {
  if (compareDecimal(pct, '0') >= 0) {
    return 'ABOVE_AVERAGE';
  }
  if (compareDecimal(pct, '-5') > 0) {
    return 'SMALL_DISCOUNT';
  }
  if (compareDecimal(pct, '-10') > 0) {
    return 'FIRST_BUY_ZONE';
  }
  if (compareDecimal(pct, '-15') > 0) {
    return 'STRONGER_BUY_ZONE';
  }
  return 'DEEPER_DIP';
}

export function displayActionFor(action: LunoBtcStrategyAction): string {
  switch (action) {
    case 'BUY_SMALL':
      return 'BUY SMALL';
    case 'BUY_MORE':
      return 'BUY MORE';
    case 'STOP_BUYING_THIS_MONTH':
      return 'STOP BUYING THIS MONTH';
    case 'HOLD':
      return 'HOLD';
    case 'WAIT':
      return 'WAIT';
    case 'BLOCKED':
      return 'BLOCKED';
  }
}

export function evaluateBtcBuyDecision(input: BuyDecisionInput): BuyDecision {
  const used = asDecimalString(input.monthlyUsedMyr || '0');
  const maxAllowed = asDecimalString(input.maxAllowedNewSpendMyr || '0');
  if (input.accountingStatus !== 'READY') {
    return blocked(input, used, maxAllowed, 'BTC accounting is not ready.');
  }
  if (input.monthlyBudgetMyr == null || input.monthlyRemainingMyr == null) {
    return blocked(input, used, maxAllowed, 'Set your monthly BTC budget.');
  }
  if (compareDecimal(input.monthlyRemainingMyr, '0') <= 0) {
    return {
      ...base(input, used, maxAllowed),
      action: 'STOP_BUYING_THIS_MONTH',
      displayAction: 'STOP BUYING THIS MONTH',
      zone: 'MONTHLY_LIMIT',
      source: null,
      suggestedAmountMyr: null,
      expectedRemainingAfterMyr: '0.00',
      topUpNeededMyr: '0.00',
      reason: ['Your monthly BTC budget has been fully used.'],
    };
  }
  if (
    input.currentBtcPriceMyr == null ||
    input.averageBuyPriceMyr == null ||
    isZeroDecimal(input.averageBuyPriceMyr)
  ) {
    return blocked(
      input,
      used,
      maxAllowed,
      'Current BTC price or average buy price is unavailable.',
    );
  }
  const pct = priceDifferencePct(
    input.currentBtcPriceMyr,
    input.averageBuyPriceMyr,
  );
  if (pct == null) {
    return blocked(
      input,
      used,
      maxAllowed,
      'Current BTC price or average buy price is unavailable.',
    );
  }
  const zone = zoneFromPriceDifference(pct);
  if (zone === 'ABOVE_AVERAGE') {
    return informational(input, used, maxAllowed, pct, zone, 'HOLD', [
      'BTC is at or above your average buy price. Do not chase the price.',
    ]);
  }
  if (zone === 'SMALL_DISCOUNT') {
    return informational(input, used, maxAllowed, pct, zone, 'WAIT', [
      'Price is lower than your average, but not enough for the next staged buy.',
      belowAverageReason(pct),
    ]);
  }
  const acted = new Set(input.actedZones);
  if (acted.has(zone)) {
    return informational(input, used, maxAllowed, pct, zone, 'WAIT', [
      'Price is lower than your average, but not enough for the next staged buy.',
      'This buying zone was already used this month.',
      belowAverageReason(pct),
    ]);
  }
  const fraction =
    zone === 'FIRST_BUY_ZONE'
      ? FIRST_BUY_FRACTION
      : zone === 'STRONGER_BUY_ZONE'
        ? STRONGER_BUY_FRACTION
        : DEEPER_BUY_FRACTION;
  const source: LunoBtcStrategySource =
    zone === 'FIRST_BUY_ZONE' ? 'NORMAL_BUY' : 'DIP_BUY';
  const sleeve =
    source === 'NORMAL_BUY'
      ? input.remainingNormalBuyMyr
      : input.remainingDipReserveMyr;
  const suggested = capSuggestedAmount({
    monthlyBudgetMyr: input.monthlyBudgetMyr,
    fraction,
    remainingMyr: input.monthlyRemainingMyr,
    maxAllowedNewSpendMyr: maxAllowed,
    sleeveMyr: sleeve,
  });
  if (suggested == null || compareDecimal(suggested, '0') <= 0) {
    return informational(input, used, maxAllowed, pct, zone, 'WAIT', [
      'Price is lower than your average, but not enough for the next staged buy.',
      'No unused staged amount remains for this zone.',
    ]);
  }
  const expected = subtractDecimalStrings(input.monthlyRemainingMyr, suggested);
  const topUp = topUpNeededMyr(suggested, input.lunoMyrAvailableMyr);
  const buyAction: LunoBtcStrategyAction =
    zone === 'FIRST_BUY_ZONE' ? 'BUY_SMALL' : 'BUY_MORE';
  return {
    ...base(input, used, maxAllowed),
    action: buyAction,
    displayAction: displayActionFor(buyAction),
    zone,
    source,
    suggestedAmountMyr: suggested,
    priceDifferencePct: pct,
    topUpNeededMyr: topUp,
    expectedRemainingAfterMyr: expected,
    reason: [
      belowAverageReason(pct),
      `You still have RM${formatPlain(input.monthlyRemainingMyr)} available this month.`,
      buyAction === 'BUY_SMALL'
        ? 'BTC entered your first buying zone.'
        : 'BTC entered a deeper buying zone.',
    ],
  };
}

export function capSuggestedAmount(input: {
  monthlyBudgetMyr: string;
  fraction: string;
  remainingMyr: string;
  maxAllowedNewSpendMyr: string;
  sleeveMyr: string | null;
}): string | null {
  const raw = multiplyDecimalStrings(input.monthlyBudgetMyr, input.fraction);
  let capped = minDecimal(raw, input.remainingMyr);
  capped = minDecimal(capped, input.maxAllowedNewSpendMyr);
  if (input.sleeveMyr != null) {
    capped = minDecimal(capped, input.sleeveMyr);
  }
  if (compareDecimal(capped, '0') <= 0) {
    return null;
  }
  return capped;
}

export function topUpNeededMyr(
  suggestedAmountMyr: string,
  lunoMyrAvailableMyr: string | null,
): string {
  if (lunoMyrAvailableMyr == null) {
    return '0';
  }
  return maxDecimal(
    subtractDecimalStrings(suggestedAmountMyr, lunoMyrAvailableMyr),
    '0',
  );
}

export function buyCashMyr(event: ClassifiedEvent): string {
  return addDecimalStrings(event.myrAmount, cashAppliedFee(event));
}

export function amountsMatch(actualMyr: string, suggestedMyr: string): boolean {
  const diff = absDecimal(subtractDecimalStrings(actualMyr, suggestedMyr));
  if (compareDecimal(diff, MATCH_ABS_TOLERANCE_MYR) <= 0) {
    return true;
  }
  if (isZeroDecimal(suggestedMyr)) {
    return false;
  }
  const pct = divideDecimalStrings(
    multiplyDecimalStrings(diff, '100'),
    suggestedMyr,
    8,
  );
  return pct != null && compareDecimal(pct, MATCH_PCT_TOLERANCE) <= 0;
}

export function stagedTargetMyr(
  monthlyBudgetMyr: string,
  zone: LunoBtcStrategyZone,
): string | null {
  const fraction =
    zone === 'FIRST_BUY_ZONE'
      ? FIRST_BUY_FRACTION
      : zone === 'STRONGER_BUY_ZONE'
        ? STRONGER_BUY_FRACTION
        : zone === 'DEEPER_DIP'
          ? DEEPER_BUY_FRACTION
          : null;
  if (fraction == null) {
    return null;
  }
  return multiplyDecimalStrings(monthlyBudgetMyr, fraction);
}

export function isBuyAction(action: LunoBtcStrategyAction): boolean {
  return action === 'BUY_SMALL' || action === 'BUY_MORE';
}

export function isMeaningfulHistoryAction(
  action: LunoBtcStrategyAction,
): boolean {
  return action !== 'BLOCKED';
}

function base(
  input: BuyDecisionInput,
  used: string,
  maxAllowed: string,
): Pick<
  BuyDecision,
  | 'currentPriceMyr'
  | 'averageBuyPriceMyr'
  | 'monthlyBudgetMyr'
  | 'monthlyUsedMyr'
  | 'monthlyRemainingMyr'
  | 'maxAllowedNewSpendMyr'
  | 'lunoMyrAvailableMyr'
  | 'priceDifferencePct'
> {
  return {
    currentPriceMyr: input.currentBtcPriceMyr,
    averageBuyPriceMyr: input.averageBuyPriceMyr,
    monthlyBudgetMyr: input.monthlyBudgetMyr,
    monthlyUsedMyr: used,
    monthlyRemainingMyr: input.monthlyRemainingMyr,
    maxAllowedNewSpendMyr: maxAllowed,
    lunoMyrAvailableMyr: input.lunoMyrAvailableMyr,
    priceDifferencePct: null,
  };
}

function blocked(
  input: BuyDecisionInput,
  used: string,
  maxAllowed: string,
  reason: string,
): BuyDecision {
  return {
    ...base(input, used, maxAllowed),
    action: 'BLOCKED',
    displayAction: 'BLOCKED',
    zone: 'BLOCKED',
    source: null,
    suggestedAmountMyr: null,
    topUpNeededMyr: null,
    expectedRemainingAfterMyr: null,
    reason: [reason],
  };
}

function informational(
  input: BuyDecisionInput,
  used: string,
  maxAllowed: string,
  pct: string,
  zone: LunoBtcStrategyZone,
  action: Extract<LunoBtcStrategyAction, 'HOLD' | 'WAIT'>,
  reason: string[],
): BuyDecision {
  return {
    ...base(input, used, maxAllowed),
    action,
    displayAction: displayActionFor(action),
    zone,
    source: null,
    suggestedAmountMyr: null,
    priceDifferencePct: pct,
    topUpNeededMyr: '0',
    expectedRemainingAfterMyr: input.monthlyRemainingMyr,
    reason,
  };
}

function belowAverageReason(pct: string): string {
  const abs = absDecimal(pct);
  return `BTC is ${formatPlain(abs)}% below your average buy price.`;
}

function formatPlain(value: string): string {
  const rounded = divideDecimalStrings(value, '1', 2) ?? value;
  if (!rounded.includes('.')) {
    return `${rounded}.00`;
  }
  const [whole, frac = ''] = rounded.split('.');
  return `${whole}.${frac.padEnd(2, '0').slice(0, 2)}`;
}
