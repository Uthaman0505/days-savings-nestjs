import { classifyLunoTransactions } from './luno-btc-classify';
import {
  calendarMonthKey,
  collectExcludedAssets,
  summarizeCurrentMonthBuys,
} from './luno-btc-activity';
import type { SourceTx } from './luno-btc.types';

function tx(
  partial: Omit<SourceTx, 'occurredAt'> & { occurredAt?: Date },
): SourceTx {
  return {
    occurredAt: new Date('2026-09-16T02:00:00.000Z'),
    ...partial,
  };
}

const BTC = 'btc-acc';
const MYR = 'myr-acc';

describe('Luno BTC activity helpers', () => {
  it('aggregates current-month BTC buys without inventing a budget', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'a',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.0001',
          occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'a',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-30',
          occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.00005637',
          occurredAt: new Date('2026-09-16T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-20',
          occurredAt: new Date('2026-09-16T00:00:00.000Z'),
        }),
        tx({
          id: '5',
          lunoAccountId: BTC,
          rowIndex: '3',
          reference: 'old',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
        tx({
          id: '6',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: 'old',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
          occurredAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const month = summarizeCurrentMonthBuys(
      events,
      new Date('2026-09-16T12:00:00.000Z'),
    );
    expect(month.buyCount).toBe(2);
    expect(month.purchaseTotalMyr).toBe('50');
    expect(month.btcReceived).toBe('0.00015637');
    expect(month.latestBuyAt).toBe('2026-09-16T00:00:00.000Z');
    expect(month.month).toBe('2026-09');
  });

  it('uses Asia/Kuala_Lumpur for first day, last day, and UTC rollover', () => {
    expect(calendarMonthKey(new Date('2026-08-31T16:00:00.000Z'))).toBe(
      '2026-09',
    );
    expect(calendarMonthKey(new Date('2026-09-01T00:00:00+08:00'))).toBe(
      '2026-09',
    );
    expect(calendarMonthKey(new Date('2026-09-30T15:59:59.999Z'))).toBe(
      '2026-09',
    );
    expect(calendarMonthKey(new Date('2026-09-30T16:00:00.000Z'))).toBe(
      '2026-10',
    );
  });

  it('ignores sells and excluded assets when summing monthly used', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'buy',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.0001',
          occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'buy',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-30',
          occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'sell',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.00005',
          occurredAt: new Date('2026-09-15T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'sell',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '20',
          occurredAt: new Date('2026-09-15T00:00:00.000Z'),
        }),
        tx({
          id: '5',
          lunoAccountId: 'eth',
          rowIndex: '1',
          reference: 'eth',
          currency: 'ETH',
          kind: 'EXCHANGE',
          description: 'Bought ETH',
          balanceDelta: '1',
          occurredAt: new Date('2026-09-16T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const month = summarizeCurrentMonthBuys(
      events,
      new Date('2026-09-16T12:00:00.000Z'),
    );
    expect(month.buyCount).toBe(1);
    expect(month.purchaseTotalMyr).toBe('30');
  });

  it('lists excluded non-BTC assets once', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'e',
          lunoAccountId: 'eth',
          rowIndex: '1',
          reference: 'e1',
          currency: 'ETH',
          kind: 'EXCHANGE',
          description: 'Bought ETH',
          balanceDelta: '1',
        }),
        tx({
          id: 'x',
          lunoAccountId: 'xrp',
          rowIndex: '1',
          reference: 'x1',
          currency: 'XRP',
          kind: 'EXCHANGE',
          description: 'Bought XRP',
          balanceDelta: '10',
        }),
      ],
      BTC,
      MYR,
    );
    expect(collectExcludedAssets(events)).toEqual([
      { asset: 'ETH' },
      { asset: 'XRP' },
    ]);
  });
});
