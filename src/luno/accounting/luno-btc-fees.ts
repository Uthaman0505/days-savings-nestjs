import {
  addDecimalStrings,
  asDecimalString,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  multiplyDecimalStrings,
} from '../luno-decimal';
import type {
  ClassifiedEvent,
  FeeAuditRow,
  FeeCoverage,
  FeeSource,
  FeeTreatment,
  SourceTx,
  TradeChannel,
  TradeFeeStatus,
} from './luno-btc.types';

const SPACES = /[\u00a0\u202f\s]+/g;

export type InstantFeeParse = {
  feeBtc: string;
  priceMyrPerBtc: string | null;
  feeMyr: string | null;
};

export function mergeTxDetails(rows: SourceTx[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const row of rows) {
    const fromRow = row.details;
    const fromRaw =
      row.rawPayload && typeof row.rawPayload.details === 'object'
        ? (row.rawPayload.details as Record<string, unknown>)
        : null;
    for (const source of [fromRow, fromRaw]) {
      if (!source) {
        continue;
      }
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'string' && value.trim()) {
          merged[key] = value;
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          merged[key] = String(value);
        }
      }
    }
  }
  return merged;
}

export function parseInstantDetails(
  details: Record<string, string>,
): InstantFeeParse | null {
  const feeRaw = (details.Fee ?? details.fee ?? '').replace(SPACES, ' ').trim();
  const priceRaw = (details.Price ?? details.price ?? '')
    .replace(SPACES, ' ')
    .trim();
  const btcFee =
    /^BTC\s+([0-9]+(?:\.[0-9]+)?)$/i.exec(feeRaw) ??
    /^([0-9]+(?:\.[0-9]+)?)\s*BTC$/i.exec(feeRaw);
  if (!btcFee?.[1]) {
    const myrFee =
      /^(?:RM|MYR)\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(feeRaw) ??
      /^([0-9]+(?:\.[0-9]+)?)\s*(?:RM|MYR)$/i.exec(feeRaw);
    if (!myrFee?.[1]) {
      return null;
    }
    return {
      feeBtc: '0',
      priceMyrPerBtc: parsePrice(priceRaw),
      feeMyr: myrFee[1],
    };
  }
  const feeBtc = btcFee[1];
  const priceMyrPerBtc = parsePrice(priceRaw);
  const feeMyr =
    priceMyrPerBtc == null
      ? null
      : multiplyDecimalStrings(feeBtc, priceMyrPerBtc);
  return { feeBtc, priceMyrPerBtc, feeMyr };
}

function parsePrice(raw: string): string | null {
  const match = /^([0-9][0-9,]*(?:\.[0-9]+)?)\s*MYR\/BTC$/i.exec(raw);
  if (!match?.[1]) {
    return null;
  }
  try {
    return asDecimalString(match[1].replace(/,/g, ''));
  } catch {
    return null;
  }
}

export function cashAppliedFee(event: ClassifiedEvent): string {
  if (
    event.feeTreatment === 'ADDED_TO_MYR_COST' ||
    event.feeTreatment === 'SUBTRACTED_FROM_PROCEEDS'
  ) {
    return event.feeMyr;
  }
  return '0';
}

export function buildFeeAudit(events: ClassifiedEvent[]): FeeAuditRow[] {
  return events
    .filter(
      (
        row,
      ): row is ClassifiedEvent & { classification: 'BTC_BUY' | 'BTC_SELL' } =>
        row.classification === 'BTC_BUY' || row.classification === 'BTC_SELL',
    )
    .map((row) => ({
      occurredAt: row.occurredAt.toISOString(),
      type: row.classification,
      channel: row.tradeChannel,
      reference: row.reference,
      btcQuantity: row.btcQuantity,
      grossMyr: row.myrAmount,
      feeMyr: row.feeMyrReported,
      feeBtc: row.feeBtc,
      feeStatus: row.feeStatus,
      feeSource: row.feeSource,
      feeTreatment: row.feeTreatment,
      accountingImpact: impactCopy(row),
      derivationNote: row.derivationNote,
    }));
}

function impactCopy(row: ClassifiedEvent): string {
  if (row.feeTreatment === 'EMBEDDED') {
    return row.classification === 'BTC_BUY'
      ? `Instant BTC fee already reduced BTC received; MYR cost stays ${row.myrAmount}. Do not add ${row.feeMyrReported} again.`
      : `Instant fee already netted from MYR received; proceeds stay ${row.myrAmount}. Do not subtract ${row.feeMyrReported} again.`;
  }
  if (row.feeTreatment === 'ADDED_TO_MYR_COST') {
    return `Buy cost increased by ${row.feeMyrReported}.`;
  }
  if (row.feeTreatment === 'SUBTRACTED_FROM_PROCEEDS') {
    return `Realised proceeds reduced by ${row.feeMyrReported}.`;
  }
  if (row.feeStatus === 'MISSING' || row.feeStatus === 'UNKNOWN') {
    return `No reliable fee; cash amount ${row.myrAmount} used as-is.`;
  }
  return 'No extra cash fee.';
}

export function summarizeFeeCoverage(audit: FeeAuditRow[]): FeeCoverage {
  let knownFeesMyr = '0';
  let affectedGrossAmountMyr = '0';
  let missing = 0;
  let exact = 0;
  let derived = 0;
  let unknown = 0;
  for (const row of audit) {
    if (row.feeStatus === 'EXACT') {
      exact += 1;
    } else if (row.feeStatus === 'DERIVED') {
      derived += 1;
    } else if (row.feeStatus === 'MISSING') {
      missing += 1;
      affectedGrossAmountMyr = addDecimalStrings(
        affectedGrossAmountMyr,
        row.grossMyr,
      );
    } else {
      unknown += 1;
      affectedGrossAmountMyr = addDecimalStrings(
        affectedGrossAmountMyr,
        row.grossMyr,
      );
    }
    if (
      (row.feeStatus === 'EXACT' || row.feeStatus === 'DERIVED') &&
      !isZeroDecimal(row.feeMyr)
    ) {
      knownFeesMyr = addDecimalStrings(knownFeesMyr, row.feeMyr);
    }
  }
  const tradeCount = audit.length;
  const covered = exact + derived;
  const feeCoveragePct =
    tradeCount === 0
      ? null
      : divideDecimalStrings(
          multiplyDecimalStrings(String(covered), '100'),
          String(tradeCount),
          2,
        );
  // Instant coverage is exact for cash PnL. Missing fees: no defensible historical
  // rate bound (GET /fee_info is current maker/taker only).
  let impactStatus: FeeCoverage['impactStatus'] = 'EXACT';
  if (missing > 0 || unknown > 0) {
    impactStatus = 'UNKNOWN';
  }
  return {
    knownFeesMyr,
    feeCoveragePct,
    missingFeeTransactions: missing,
    exactFeeTransactions: exact,
    derivedFeeTransactions: derived,
    unknownFeeTransactions: unknown,
    tradeCount,
    affectedGrossAmountMyr,
    impactStatus,
    estimatedMinAccountingImpactMyr: null,
    estimatedMaxAccountingImpactMyr: null,
  };
}

export type OrderOrTradeFee = {
  id: string;
  feeCounter: string;
  feeBase: string;
};

export function attachExchangeFees(
  events: ClassifiedEvent[],
  orders: OrderOrTradeFee[],
  trades: OrderOrTradeFee[],
): ClassifiedEvent[] {
  const byId = new Map<string, OrderOrTradeFee>();
  for (const row of [...orders, ...trades]) {
    if (row.id) {
      byId.set(row.id, row);
    }
  }
  return events.map((event) => {
    if (
      event.classification !== 'BTC_BUY' &&
      event.classification !== 'BTC_SELL'
    ) {
      return event;
    }
    if (event.feeStatus === 'EXACT' || event.feeStatus === 'DERIVED') {
      return event;
    }
    if (!event.reference) {
      return event;
    }
    const match = byId.get(event.reference);
    if (!match) {
      return event;
    }
    let feeCounter = '0';
    try {
      feeCounter = asDecimalString(match.feeCounter);
    } catch {
      return {
        ...event,
        feeStatus: 'UNKNOWN',
        derivationNote: 'Matching order/trade fee_counter was malformed.',
      };
    }
    if (compareDecimal(feeCounter, '0') > 0) {
      const fromTrade = trades.some((row) => row.id === event.reference);
      return {
        ...event,
        feeMyr: feeCounter,
        feeMyrReported: feeCounter,
        feeStatus: 'DERIVED',
        feeSource: fromTrade ? 'USER_TRADE' : 'ORDER_FEE_COUNTER',
        feeTreatment:
          event.classification === 'BTC_BUY'
            ? 'ADDED_TO_MYR_COST'
            : 'SUBTRACTED_FROM_PROCEEDS',
        tradeChannel: 'EXCHANGE',
        derivationNote: fromTrade
          ? 'MYR fee from GET /api/1/listtrades fee_counter.'
          : 'MYR fee from GET /api/1/listorders fee_counter.',
        warning: null,
      };
    }
    return event;
  });
}

export function defaultTradeFee(): {
  feeMyr: string;
  feeMyrReported: string;
  feeBtc: string | null;
  feeStatus: TradeFeeStatus;
  feeSource: FeeSource;
  feeTreatment: FeeTreatment;
  tradeChannel: TradeChannel;
  derivationNote: string | null;
} {
  return {
    feeMyr: '0',
    feeMyrReported: '0',
    feeBtc: null,
    feeStatus: 'MISSING',
    feeSource: 'NONE',
    feeTreatment: 'NONE',
    tradeChannel: 'UNKNOWN',
    derivationNote: null,
  };
}
