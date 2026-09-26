import {
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '../luno-decimal';
import { consumeLotsForPreview } from './luno-btc-fifo';
import { remainingBtc, remainingCostBasis } from './luno-btc-formulas';
import type { FifoLot } from './luno-btc.types';

export type FifoSalePreview = {
  grossProceedsMyr: string;
  estimatedFeesMyr: string;
  netProceedsMyr: string;
  fifoCostBasisReleasedMyr: string;
  estimatedRealizedProfitMyr: string;
  remainingBtc: string;
  remainingCostBasisMyr: string;
  remainingAverageBuyPriceMyr: string | null;
};

export function previewFifoSale(input: {
  lots: FifoLot[];
  btcToSell: string;
  estimatedSalePriceMyr: string;
  estimatedFeeMyr: string;
}): FifoSalePreview | null {
  if (compareDecimal(input.btcToSell, '0') <= 0) {
    return null;
  }
  const consumed = consumeLotsForPreview(input.lots, input.btcToSell);
  if (!consumed) {
    return null;
  }
  const gross = multiplyDecimalStrings(
    input.btcToSell,
    input.estimatedSalePriceMyr,
  );
  const fee =
    compareDecimal(input.estimatedFeeMyr, '0') < 0
      ? '0'
      : input.estimatedFeeMyr;
  const net = subtractDecimalStrings(gross, fee);
  const remainingQty = remainingBtc(consumed.remainingLots);
  const remainingCost = remainingCostBasis(consumed.remainingLots);
  return {
    grossProceedsMyr: gross,
    estimatedFeesMyr: fee,
    netProceedsMyr: net,
    fifoCostBasisReleasedMyr: consumed.costBasisMyr,
    estimatedRealizedProfitMyr: subtractDecimalStrings(
      net,
      consumed.costBasisMyr,
    ),
    remainingBtc: remainingQty,
    remainingCostBasisMyr: remainingCost,
    remainingAverageBuyPriceMyr: isZeroDecimal(remainingQty)
      ? null
      : (divideDecimalStrings(remainingCost, remainingQty, 18) ?? null),
  };
}
