import {
  absDecimal,
  addDecimalStrings,
  asDecimalString,
  compareDecimal,
  isZeroDecimal,
  subtractDecimalStrings,
} from '../luno-decimal';
import type { ClassifiedEvent, SourceTx } from './luno-btc.types';
import {
  defaultTradeFee,
  mergeTxDetails,
  parseInstantDetails,
  attachExchangeFees,
} from './luno-btc-fees';

const FEE_KIND = /^(fee)$/i;
const FEE_TEXT = /\bfee\b/i;
const BUY_TEXT = /\b(bought|buy)\b/i;
const SELL_TEXT = /\b(sold|sell)\b/i;
const WITHDRAW_TEXT = /\b(withdraw|withdrawal|sent|send)\b/i;
const TRANSFER_TEXT = /\btransfer\b/i;

type Group = {
  key: string;
  rows: SourceTx[];
};

function isFeeRow(row: SourceTx): boolean {
  return FEE_KIND.test(row.kind ?? '') || FEE_TEXT.test(row.description ?? '');
}

function isTransferKind(row: SourceTx): boolean {
  return (
    (row.kind ?? '').toUpperCase() === 'TRANSFER' ||
    TRANSFER_TEXT.test(row.description ?? '')
  );
}

function asset(row: SourceTx): string {
  return (row.currency ?? '').toUpperCase();
}

export function classifyLunoTransactions(
  rows: SourceTx[],
  btcAccountId: string | null,
  myrAccountId: string | null,
): ClassifiedEvent[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = row.reference
      ? `ref:${row.reference}`
      : `solo:${row.lunoAccountId}:${row.rowIndex}`;
    const group = groups.get(key) ?? { key, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const events: ClassifiedEvent[] = [];
  for (const group of groups.values()) {
    events.push(...classifyGroup(group, btcAccountId, myrAccountId));
  }
  return events.sort(compareEvents);
}

function compareEvents(left: ClassifiedEvent, right: ClassifiedEvent): number {
  const time = left.occurredAt.getTime() - right.occurredAt.getTime();
  if (time !== 0) {
    return time;
  }
  return (left.reference ?? '').localeCompare(right.reference ?? '');
}

function classifyGroup(
  group: Group,
  btcAccountId: string | null,
  myrAccountId: string | null,
): ClassifiedEvent[] {
  const rows = [...group.rows].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      Number(a.rowIndex) - Number(b.rowIndex),
  );
  const occurredAt = rows[0]?.occurredAt ?? new Date(0);
  const reference = rows.find((row) => row.reference)?.reference ?? null;
  const sourceTransactionIds = rows.map((row) => row.id);

  let xbtDelta = '0';
  let myrDelta = '0';
  let feeMyr = '0';
  let hasFeeRow = false;
  const warnings: string[] = [];
  let malformed = false;
  let transferLike = false;

  for (const row of rows) {
    let delta: string;
    try {
      delta = asDecimalString(row.balanceDelta);
    } catch {
      malformed = true;
      warnings.push(
        `Malformed decimal on ${row.lunoAccountId} row ${row.rowIndex}.`,
      );
      continue;
    }
    const code = asset(row);
    const onBtc =
      code === 'XBT' || code === 'BTC' || row.lunoAccountId === btcAccountId;
    const onMyr = code === 'MYR' || row.lunoAccountId === myrAccountId;
    if (isTransferKind(row)) {
      transferLike = true;
    }
    if (isFeeRow(row)) {
      hasFeeRow = true;
      if (onMyr && compareDecimal(delta, '0') < 0) {
        feeMyr = addDecimalStrings(feeMyr, absDecimal(delta));
      } else if (onMyr && compareDecimal(delta, '0') > 0) {
        warnings.push('Positive MYR fee row ignored (not invented as income).');
      } else if (onBtc) {
        warnings.push(
          'BTC-denominated fee row kept as a warning; not converted to MYR.',
        );
      }
      continue;
    }
    if (onBtc) {
      xbtDelta = addDecimalStrings(xbtDelta, delta);
    } else if (onMyr) {
      myrDelta = addDecimalStrings(myrDelta, delta);
    } else {
      warnings.push(
        `Untracked asset ${code || 'unknown'} on row ${row.rowIndex}.`,
      );
    }
  }

  if (malformed && isZeroDecimal(xbtDelta) && isZeroDecimal(myrDelta)) {
    return [
      unknownEvent(
        occurredAt,
        reference,
        sourceTransactionIds,
        warnings.join(' '),
      ),
    ];
  }

  const buyHint = rows.some((row) => BUY_TEXT.test(row.description ?? ''));
  const sellHint = rows.some((row) => SELL_TEXT.test(row.description ?? ''));
  const withdrawHint = rows.some((row) =>
    WITHDRAW_TEXT.test(row.description ?? ''),
  );

  const xbtIn = compareDecimal(xbtDelta, '0') > 0;
  const xbtOut = compareDecimal(xbtDelta, '0') < 0;
  const myrIn = compareDecimal(myrDelta, '0') > 0;
  const myrOut = compareDecimal(myrDelta, '0') < 0;

  if (xbtIn && myrOut) {
    return [
      tradeEvent(
        'BTC_BUY',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        absDecimal(myrDelta),
        feeMyr,
        hasFeeRow,
        warnings,
        rows,
      ),
    ];
  }
  if (xbtOut && myrIn) {
    return [
      tradeEvent(
        'BTC_SELL',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        absDecimal(myrDelta),
        feeMyr,
        hasFeeRow,
        warnings,
        rows,
      ),
    ];
  }
  if (xbtIn && isZeroDecimal(myrDelta)) {
    if (transferLike) {
      return [
        movement(
          'INTERNAL_TRANSFER',
          occurredAt,
          reference,
          sourceTransactionIds,
          absDecimal(xbtDelta),
          '0',
          'Inbound BTC transfer does not add MYR cost or trading profit.',
          'IN',
        ),
      ];
    }
    return [
      movement(
        'BTC_DEPOSIT',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        '0',
        'BTC deposit has no MYR cost and is not trading profit.',
        'IN',
      ),
    ];
  }
  if (xbtOut && isZeroDecimal(myrDelta)) {
    if (withdrawHint) {
      return [
        movement(
          'BTC_WITHDRAWAL',
          occurredAt,
          reference,
          sourceTransactionIds,
          absDecimal(xbtDelta),
          '0',
          'BTC withdrawal consumes lots without realised trading profit.',
          'OUT',
        ),
      ];
    }
    return [
      movement(
        'INTERNAL_TRANSFER',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        '0',
        'Outbound BTC transfer consumes lots without realised trading profit.',
        'OUT',
      ),
    ];
  }
  if (isZeroDecimal(xbtDelta) && isZeroDecimal(myrDelta) && !malformed) {
    if (warnings.length > 0) {
      return [
        unknownEvent(
          occurredAt,
          reference,
          sourceTransactionIds,
          warnings.join(' ') ||
            'Could not classify this Luno group; preserved for audit.',
        ),
      ];
    }
    return [];
  }
  if (isZeroDecimal(xbtDelta) && myrIn) {
    const gross = absDecimal(myrDelta);
    const net =
      compareDecimal(feeMyr, '0') > 0 && compareDecimal(gross, feeMyr) >= 0
        ? subtractDecimalStrings(gross, feeMyr)
        : gross;
    return [
      movement(
        'MYR_DEPOSIT',
        occurredAt,
        reference,
        sourceTransactionIds,
        '0',
        net,
        compareDecimal(feeMyr, '0') > 0
          ? `MYR deposit fee ${feeMyr} excluded from spendable deposit.`
          : null,
      ),
    ];
  }
  if (isZeroDecimal(xbtDelta) && myrOut && !xbtIn && !buyHint) {
    return [
      movement(
        'MYR_WITHDRAWAL',
        occurredAt,
        reference,
        sourceTransactionIds,
        '0',
        absDecimal(myrDelta),
        null,
      ),
    ];
  }
  if (sellHint && xbtOut) {
    return [
      tradeEvent(
        'BTC_SELL',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        absDecimal(myrDelta),
        feeMyr,
        hasFeeRow,
        warnings,
        rows,
      ),
    ];
  }
  if (buyHint && xbtIn) {
    return [
      tradeEvent(
        'BTC_BUY',
        occurredAt,
        reference,
        sourceTransactionIds,
        absDecimal(xbtDelta),
        absDecimal(myrDelta),
        feeMyr,
        hasFeeRow,
        warnings,
        rows,
      ),
    ];
  }

  return [
    unknownEvent(
      occurredAt,
      reference,
      sourceTransactionIds,
      warnings.join(' ') ||
        'Could not classify this Luno group; preserved for audit.',
    ),
  ];
}

function tradeEvent(
  classification: 'BTC_BUY' | 'BTC_SELL',
  occurredAt: Date,
  reference: string | null,
  sourceTransactionIds: string[],
  btcQuantity: string,
  myrAmount: string,
  statementFeeMyr: string,
  hasFeeRow: boolean,
  warnings: string[],
  rows: SourceTx[],
): ClassifiedEvent {
  const base = defaultTradeFee();
  let fee = {
    ...base,
    warningExtra: null as string | null,
  };
  if (hasFeeRow && !isZeroDecimal(statementFeeMyr)) {
    fee = {
      ...base,
      feeMyr: statementFeeMyr,
      feeMyrReported: statementFeeMyr,
      feeBtc: null,
      feeStatus: 'EXACT',
      feeSource: 'STATEMENT_FEE_ROW',
      feeTreatment:
        classification === 'BTC_BUY'
          ? 'ADDED_TO_MYR_COST'
          : 'SUBTRACTED_FROM_PROCEEDS',
      tradeChannel: 'EXCHANGE',
      derivationNote: 'Separate Luno FEE statement row on the same reference.',
      warningExtra: null,
    };
  } else {
    const instant = parseInstantDetails(mergeTxDetails(rows));
    if (instant) {
      const reported = instant.feeMyr ?? '0';
      const hasBtcFee = !isZeroDecimal(instant.feeBtc);
      const hasMyrFee =
        instant.feeMyr != null && !isZeroDecimal(instant.feeMyr);
      fee = {
        ...base,
        feeMyr: '0',
        feeMyrReported: reported,
        feeBtc: hasBtcFee ? instant.feeBtc : null,
        feeStatus:
          hasBtcFee && instant.feeMyr != null
            ? 'DERIVED'
            : hasBtcFee || hasMyrFee
              ? 'EXACT'
              : 'MISSING',
        feeSource: 'INSTANT_DETAILS',
        feeTreatment: 'EMBEDDED',
        tradeChannel: 'INSTANT',
        derivationNote:
          hasBtcFee && instant.feeMyr != null
            ? 'Instant Buy/Sell details.Fee (BTC) × details.Price. Already in net BTC/MYR; not added again.'
            : hasMyrFee
              ? 'Instant details.Fee already in MYR and embedded in the statement cash amount.'
              : 'Instant details.Fee recorded in BTC; MYR equivalent not derived (no Price).',
        warningExtra: null,
      };
    } else if (!isZeroDecimal(statementFeeMyr)) {
      fee = {
        ...base,
        feeMyr: statementFeeMyr,
        feeMyrReported: statementFeeMyr,
        feeStatus: 'EXACT',
        feeSource: 'STATEMENT_FEE_ROW',
        feeTreatment:
          classification === 'BTC_BUY'
            ? 'ADDED_TO_MYR_COST'
            : 'SUBTRACTED_FROM_PROCEEDS',
        tradeChannel: 'EXCHANGE',
        derivationNote: null,
        warningExtra: null,
      };
    } else {
      fee = {
        ...base,
        feeStatus: 'MISSING',
        derivationNote:
          'No statement FEE row, Instant details.Fee, or matching order/trade fee.',
        warningExtra:
          'Fee missing for this BTC trade; cash amount used as-is and coverage quantified.',
      };
    }
  }
  return {
    classification,
    occurredAt,
    reference,
    sourceTransactionIds,
    btcQuantity,
    myrAmount,
    feeMyr: fee.feeMyr,
    feeMyrReported: fee.feeMyrReported,
    feeBtc: fee.feeBtc,
    feeStatus: fee.feeStatus,
    feeSource: fee.feeSource,
    feeTreatment: fee.feeTreatment,
    tradeChannel: fee.tradeChannel,
    derivationNote: fee.derivationNote,
    warning: [...warnings, fee.warningExtra].filter(Boolean).join(' ') || null,
    btcDirection: classification === 'BTC_BUY' ? 'IN' : 'OUT',
  };
}

function movement(
  classification: ClassifiedEvent['classification'],
  occurredAt: Date,
  reference: string | null,
  sourceTransactionIds: string[],
  btcQuantity: string,
  myrAmount: string,
  warning: string | null,
  btcDirection: ClassifiedEvent['btcDirection'] = 'NONE',
): ClassifiedEvent {
  return {
    classification,
    occurredAt,
    reference,
    sourceTransactionIds,
    btcQuantity,
    btcDirection,
    myrAmount,
    ...defaultTradeFee(),
    warning,
  };
}

export function attachOrderFees(
  events: ClassifiedEvent[],
  orders: { lunoOrderId: string; feeCounter: string; feeBase: string }[],
  trades: { id: string; feeCounter: string; feeBase: string }[] = [],
): ClassifiedEvent[] {
  return attachExchangeFees(
    events,
    orders.map((row) => ({
      id: row.lunoOrderId,
      feeCounter: row.feeCounter,
      feeBase: row.feeBase,
    })),
    trades,
  );
}

function unknownEvent(
  occurredAt: Date,
  reference: string | null,
  sourceTransactionIds: string[],
  warning: string,
): ClassifiedEvent {
  return {
    classification: 'UNKNOWN',
    occurredAt,
    reference,
    sourceTransactionIds,
    btcQuantity: '0',
    btcDirection: 'NONE',
    myrAmount: '0',
    ...defaultTradeFee(),
    feeStatus: 'UNKNOWN',
    warning,
  };
}
