import { addDecimalStrings, divideDecimalStrings } from '../luno-decimal';
import { cashAppliedFee } from './luno-btc-fees';
import type {
  ClassifiedEvent,
  CurrentMonthBuys,
  ExcludedAsset,
} from './luno-btc.types';

export const LUNO_DISPLAY_TIMEZONE = 'Asia/Kuala_Lumpur';

export function calendarMonthKey(
  date: Date,
  timeZone = LUNO_DISPLAY_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  return `${year}-${month}`;
}

export function formatDisplayDate(
  date: Date,
  timeZone = LUNO_DISPLAY_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function collectExcludedAssets(
  events: ClassifiedEvent[],
): ExcludedAsset[] {
  const seen = new Set<string>();
  const rows: ExcludedAsset[] = [];
  for (const event of events) {
    if (event.classification !== 'EXCLUDED_ASSET' || !event.excludedAsset) {
      continue;
    }
    const asset = event.excludedAsset.toUpperCase();
    if (seen.has(asset)) {
      continue;
    }
    seen.add(asset);
    rows.push({ asset });
  }
  return rows.sort((a, b) => a.asset.localeCompare(b.asset));
}

export function summarizeCurrentMonthBuys(
  events: ClassifiedEvent[],
  now = new Date(),
): CurrentMonthBuys {
  const month = calendarMonthKey(now);
  const buys = events.filter(
    (row) =>
      row.classification === 'BTC_BUY' &&
      calendarMonthKey(row.occurredAt) === month,
  );
  let purchaseTotalMyr = '0';
  let btcReceived = '0';
  let latest: Date | null = null;
  for (const buy of buys) {
    const cash = addDecimalStrings(buy.myrAmount, cashAppliedFee(buy));
    purchaseTotalMyr = addDecimalStrings(purchaseTotalMyr, cash);
    btcReceived = addDecimalStrings(btcReceived, buy.btcQuantity);
    if (!latest || buy.occurredAt.getTime() > latest.getTime()) {
      latest = buy.occurredAt;
    }
  }
  return {
    month: buys.length ? month : month,
    purchaseTotalMyr,
    buyCount: buys.length,
    btcReceived,
    latestBuyAt: latest ? latest.toISOString() : null,
  };
}

export function effectiveBuyPriceMyr(event: ClassifiedEvent): string | null {
  return divideDecimalStrings(
    addDecimalStrings(event.myrAmount, cashAppliedFee(event)),
    event.btcQuantity,
    18,
  );
}
