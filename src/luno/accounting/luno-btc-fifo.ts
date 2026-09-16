import {
  addDecimalStrings,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '../luno-decimal';
import type {
  ClassifiedEvent,
  DisposalLotUse,
  FifoDisposal,
  FifoLot,
} from './luno-btc.types';
import { cashAppliedFee } from './luno-btc-fees';

export type FifoResult = {
  lots: FifoLot[];
  disposals: FifoDisposal[];
  warnings: string[];
  totalBtcBought: string;
  totalBtcSold: string;
  totalBuyFeesMyr: string;
  totalSellFeesMyr: string;
  moneyPutInMyr: string;
  principalRecoveredMyr: string;
  realisedPnlMyr: string;
  externalContributionMyr: string;
  reinvestedMyr: string;
  unexplainedBuyMyr: string;
};

export function runFifo(events: ClassifiedEvent[]): FifoResult {
  const lots: FifoLot[] = [];
  const disposals: FifoDisposal[] = [];
  const warnings: string[] = [];
  let totalBtcBought = '0';
  let totalBtcSold = '0';
  let totalBuyFeesMyr = '0';
  let totalSellFeesMyr = '0';
  let moneyPutInMyr = '0';
  let principalRecoveredMyr = '0';
  let realisedPnlMyr = '0';
  let externalMyr = '0';
  let saleMyr = '0';
  let externalContributionMyr = '0';
  let reinvestedMyr = '0';
  let unexplainedBuyMyr = '0';
  let lotSeq = 0;
  let disposalSeq = 0;

  const sorted = [...events].sort((a, b) => {
    const time = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (time !== 0) {
      return time;
    }
    const ref = (a.reference ?? '').localeCompare(b.reference ?? '');
    if (ref !== 0) {
      return ref;
    }
    return a.classification.localeCompare(b.classification);
  });

  for (const event of sorted) {
    if (event.classification === 'EXCLUDED_ASSET') {
      continue;
    }
    if (event.classification === 'UNKNOWN') {
      warnings.push(event.warning ?? 'Unknown Luno record preserved.');
      continue;
    }
    if (event.classification === 'MYR_DEPOSIT') {
      externalMyr = addDecimalStrings(externalMyr, event.myrAmount);
      continue;
    }
    if (event.classification === 'MYR_WITHDRAWAL') {
      const fromSale = minNonNeg(saleMyr, event.myrAmount);
      saleMyr = subtractDecimalStrings(saleMyr, fromSale);
      const rest = subtractDecimalStrings(event.myrAmount, fromSale);
      externalMyr = subtractDecimalStrings(
        externalMyr,
        minNonNeg(externalMyr, rest),
      );
      continue;
    }
    if (event.classification === 'BTC_BUY') {
      const cashFee = cashAppliedFee(event);
      const reported = event.feeMyrReported || event.feeMyr;
      const gross = event.myrAmount;
      const effective = addDecimalStrings(gross, cashFee);
      lotSeq += 1;
      lots.push({
        key: `lot-${lotSeq}`,
        sourceTransactionId: event.sourceTransactionIds[0] ?? null,
        reference: event.reference,
        acquiredAt: event.occurredAt,
        btcQuantityOriginal: event.btcQuantity,
        btcQuantityRemaining: event.btcQuantity,
        myrCostOriginal: gross,
        myrCostRemaining: effective,
        feeMyr: reported,
        effectiveCostMyr: effective,
        origin: 'BUY',
      });
      totalBtcBought = addDecimalStrings(totalBtcBought, event.btcQuantity);
      totalBuyFeesMyr = addDecimalStrings(totalBuyFeesMyr, reported);
      moneyPutInMyr = addDecimalStrings(moneyPutInMyr, effective);
      const funded = allocateBuyFunding(externalMyr, saleMyr, effective);
      externalMyr = funded.externalMyr;
      saleMyr = funded.saleMyr;
      externalContributionMyr = addDecimalStrings(
        externalContributionMyr,
        addDecimalStrings(funded.fromExternal, funded.unexplained),
      );
      reinvestedMyr = addDecimalStrings(reinvestedMyr, funded.fromSale);
      unexplainedBuyMyr = addDecimalStrings(
        unexplainedBuyMyr,
        funded.unexplained,
      );
      if (event.warning) {
        warnings.push(event.warning);
      }
      continue;
    }
    if (
      event.classification === 'BTC_DEPOSIT' ||
      (event.classification === 'INTERNAL_TRANSFER' &&
        event.btcDirection === 'IN')
    ) {
      lotSeq += 1;
      lots.push({
        key: `lot-${lotSeq}`,
        sourceTransactionId: event.sourceTransactionIds[0] ?? null,
        reference: event.reference,
        acquiredAt: event.occurredAt,
        btcQuantityOriginal: event.btcQuantity,
        btcQuantityRemaining: event.btcQuantity,
        myrCostOriginal: '0',
        myrCostRemaining: '0',
        feeMyr: '0',
        effectiveCostMyr: '0',
        origin:
          event.classification === 'BTC_DEPOSIT' ? 'DEPOSIT' : 'TRANSFER_IN',
      });
      warnings.push(
        event.warning ??
          'Inbound BTC without MYR cost; holdings include a zero-cost lot.',
      );
      continue;
    }
    if (event.classification === 'BTC_SELL') {
      const result = consumeLots(lots, event.btcQuantity, warnings);
      if (!result) {
        continue;
      }
      const cashFee = cashAppliedFee(event);
      const reported = event.feeMyrReported || event.feeMyr;
      const gross = event.myrAmount;
      const net = subtractDecimalStrings(gross, cashFee);
      const realised = subtractDecimalStrings(net, result.costBasisMyr);
      disposalSeq += 1;
      disposals.push({
        key: `disp-${disposalSeq}`,
        sourceTransactionId: event.sourceTransactionIds[0] ?? null,
        reference: event.reference,
        disposedAt: event.occurredAt,
        kind: 'SELL',
        btcQuantity: event.btcQuantity,
        grossProceedsMyr: gross,
        feeMyr: reported,
        netProceedsMyr: net,
        costBasisMyr: result.costBasisMyr,
        realisedPnlMyr: realised,
        lotsUsed: result.uses,
      });
      totalBtcSold = addDecimalStrings(totalBtcSold, event.btcQuantity);
      totalSellFeesMyr = addDecimalStrings(totalSellFeesMyr, reported);
      principalRecoveredMyr = addDecimalStrings(
        principalRecoveredMyr,
        result.costBasisMyr,
      );
      realisedPnlMyr = addDecimalStrings(realisedPnlMyr, realised);
      saleMyr = addDecimalStrings(saleMyr, net);
      if (event.warning) {
        warnings.push(event.warning);
      }
      continue;
    }
    if (
      event.classification === 'BTC_WITHDRAWAL' ||
      (event.classification === 'INTERNAL_TRANSFER' &&
        event.btcDirection === 'OUT')
    ) {
      if (isZeroDecimal(event.btcQuantity)) {
        continue;
      }
      const result = consumeLots(lots, event.btcQuantity, warnings);
      if (!result) {
        continue;
      }
      disposalSeq += 1;
      disposals.push({
        key: `disp-${disposalSeq}`,
        sourceTransactionId: event.sourceTransactionIds[0] ?? null,
        reference: event.reference,
        disposedAt: event.occurredAt,
        kind:
          event.classification === 'BTC_WITHDRAWAL'
            ? 'WITHDRAWAL'
            : 'TRANSFER_OUT',
        btcQuantity: event.btcQuantity,
        grossProceedsMyr: '0',
        feeMyr: '0',
        netProceedsMyr: '0',
        costBasisMyr: result.costBasisMyr,
        realisedPnlMyr: '0',
        lotsUsed: result.uses,
      });
      warnings.push(
        event.warning ??
          'BTC left the account without a sale; cost basis reduced with no trading profit.',
      );
    }
  }

  return {
    lots,
    disposals,
    warnings,
    totalBtcBought,
    totalBtcSold,
    totalBuyFeesMyr,
    totalSellFeesMyr,
    moneyPutInMyr,
    principalRecoveredMyr,
    realisedPnlMyr,
    externalContributionMyr,
    reinvestedMyr,
    unexplainedBuyMyr,
  };
}

function allocateBuyFunding(
  externalMyr: string,
  saleMyr: string,
  cost: string,
): {
  externalMyr: string;
  saleMyr: string;
  fromExternal: string;
  fromSale: string;
  unexplained: string;
} {
  const fromExternal = minNonNeg(externalMyr, cost);
  const afterExternal = subtractDecimalStrings(cost, fromExternal);
  const fromSale = minNonNeg(saleMyr, afterExternal);
  const unexplained = subtractDecimalStrings(afterExternal, fromSale);
  return {
    externalMyr: subtractDecimalStrings(externalMyr, fromExternal),
    saleMyr: subtractDecimalStrings(saleMyr, fromSale),
    fromExternal,
    fromSale,
    unexplained,
  };
}

function consumeLots(
  lots: FifoLot[],
  quantity: string,
  warnings: string[],
): { uses: DisposalLotUse[]; costBasisMyr: string } | null {
  const snapshot = lots.map((lot) => ({
    btcQuantityRemaining: lot.btcQuantityRemaining,
    myrCostRemaining: lot.myrCostRemaining,
  }));
  let remaining = quantity;
  const uses: DisposalLotUse[] = [];
  let costBasisMyr = '0';
  for (const lot of lots) {
    if (compareDecimal(remaining, '0') <= 0) {
      break;
    }
    if (compareDecimal(lot.btcQuantityRemaining, '0') <= 0) {
      continue;
    }
    const take =
      compareDecimal(lot.btcQuantityRemaining, remaining) <= 0
        ? lot.btcQuantityRemaining
        : remaining;
    let cost: string;
    if (compareDecimal(take, lot.btcQuantityRemaining) === 0) {
      cost = lot.myrCostRemaining;
    } else {
      const share = divideDecimalStrings(
        multiplyDecimalStrings(lot.myrCostRemaining, take),
        lot.btcQuantityRemaining,
        18,
      );
      cost = share ?? '0';
    }
    lot.btcQuantityRemaining = subtractDecimalStrings(
      lot.btcQuantityRemaining,
      take,
    );
    lot.myrCostRemaining = subtractDecimalStrings(lot.myrCostRemaining, cost);
    remaining = subtractDecimalStrings(remaining, take);
    costBasisMyr = addDecimalStrings(costBasisMyr, cost);
    uses.push({
      lotKey: lot.key,
      btcQuantityConsumed: take,
      costBasisConsumedMyr: cost,
    });
  }
  if (compareDecimal(remaining, '0') > 0) {
    lots.forEach((lot, index) => {
      const prior = snapshot[index];
      if (!prior) {
        return;
      }
      lot.btcQuantityRemaining = prior.btcQuantityRemaining;
      lot.myrCostRemaining = prior.myrCostRemaining;
    });
    warnings.push(
      `Tried to dispose ${quantity} BTC but only unmatched remainder ${remaining} was missing from lots.`,
    );
    return null;
  }
  return { uses, costBasisMyr };
}

function minNonNeg(left: string, right: string): string {
  if (compareDecimal(left, '0') <= 0) {
    return '0';
  }
  return compareDecimal(left, right) <= 0 ? left : right;
}
