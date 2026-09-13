import { classifyLunoTransactions, attachOrderFees } from './luno-btc-classify';
import { runFifo } from './luno-btc-fifo';
import {
  buildPortfolioView,
  remainingBtc,
  remainingCostBasis,
} from './luno-btc-formulas';
import type { SourceTx } from './luno-btc.types';

function tx(
  partial: Omit<SourceTx, 'occurredAt'> & { occurredAt?: Date },
): SourceTx {
  return {
    occurredAt: new Date('2024-01-01T00:00:00.000Z'),
    ...partial,
  };
}

const BTC = 'btc-acc';
const MYR = 'myr-acc';

describe('Luno BTC FIFO accounting', () => {
  it('creates lots and consumes FIFO across a partial second lot', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'buy-1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'buy-1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'buy-2',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'buy-2',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '5',
          lunoAccountId: BTC,
          rowIndex: '3',
          reference: 'sell-1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.0015',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
        tx({
          id: '6',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: 'sell-1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '400',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(remainingBtc(fifo.lots)).toBe('0.0005');
    expect(remainingCostBasis(fifo.lots)).toBe('125');
    expect(fifo.realisedPnlMyr).toBe('75');
    expect(fifo.principalRecoveredMyr).toBe('325');
    expect(fifo.disposals[0].lotsUsed).toHaveLength(2);
  });

  it('adds separate MYR fee rows to buy cost and sell net proceeds once', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd',
          lunoAccountId: MYR,
          rowIndex: '0',
          reference: 'dep',
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Deposit',
          balanceDelta: '1010',
        }),
        tx({
          id: 'b1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'oid',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.01',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: 'm1',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'oid',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-1000',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: 'f1',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'oid',
          currency: 'MYR',
          kind: 'FEE',
          description: 'Trading fee',
          balanceDelta: '-10',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const buy = events.find((row) => row.classification === 'BTC_BUY');
    expect(buy?.myrAmount).toBe('1000');
    expect(buy?.feeMyr).toBe('10');
    const fifo = runFifo(events);
    expect(fifo.moneyPutInMyr).toBe('1010');
    expect(fifo.totalBuyFeesMyr).toBe('10');
    expect(fifo.lots[0].effectiveCostMyr).toBe('1010');
    const ready = buildPortfolioView({
      fifo,
      liveBtcBalance: '0.01',
      btcPriceMyr: '100000',
      classifiedEvents: events,
    });
    expect(ready.status).toBe('READY');
    expect(ready.strategyReady).toBe(true);
    expect(ready.feeStatus).toBe('KNOWN');
  });

  it('subtracts a separate sell fee from net proceeds once', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'b1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.01',
        }),
        tx({
          id: 'm1',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-1000',
        }),
        tx({
          id: 's1',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 's',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.01',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        tx({
          id: 's2',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 's',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '1200',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        tx({
          id: 'f',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: 's',
          currency: 'MYR',
          kind: 'FEE',
          description: 'Trading fee',
          balanceDelta: '-5',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(fifo.disposals[0].grossProceedsMyr).toBe('1200');
    expect(fifo.disposals[0].feeMyr).toBe('5');
    expect(fifo.disposals[0].netProceedsMyr).toBe('1195');
    expect(fifo.realisedPnlMyr).toBe('195');
    expect(fifo.totalSellFeesMyr).toBe('5');
  });

  it('does not treat a BTC withdrawal as realised trading profit', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.002',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-800',
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'w',
          currency: 'XBT',
          kind: 'WITHDRAWAL',
          description: 'Withdrawal',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-03-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(remainingBtc(fifo.lots)).toBe('0.001');
    expect(fifo.realisedPnlMyr).toBe('0');
    expect(fifo.principalRecoveredMyr).toBe('0');
    expect(fifo.disposals[0].kind).toBe('WITHDRAWAL');
  });

  it('rolls back lots when a sale exceeds remaining BTC', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 's',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.009',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 's',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '9',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(remainingBtc(fifo.lots)).toBe('0.001');
    expect(remainingCostBasis(fifo.lots)).toBe('200');
    expect(fifo.disposals).toHaveLength(0);
    expect(fifo.warnings.some((row) => /unmatched remainder/.test(row))).toBe(
      true,
    );
  });

  it('does not treat unknown rows as profit and keeps a warning', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'u1',
          lunoAccountId: 'other',
          rowIndex: '9',
          reference: null,
          currency: 'ETH',
          kind: 'EXCHANGE',
          description: 'Mystery',
          balanceDelta: '1',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events[0].classification).toBe('UNKNOWN');
    const fifo = runFifo(events);
    expect(fifo.realisedPnlMyr).toBe('0');
    expect(fifo.warnings.length).toBeGreaterThan(0);
  });

  it('computes weighted average, unrealised, lifetime, and zero-BTC null average', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.002',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-800',
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    const open = buildPortfolioView({
      fifo,
      liveBtcBalance: '0.002',
      btcPriceMyr: '500000',
      classifiedEvents: events,
    });
    expect(open.averageBuyPriceMyr).toBe('400000');
    expect(open.profitStillInsideBtcMyr).toBe('200');
    expect(open.lifetimeProfitMyr).toBe('200');
    expect(open.overallReturnPct).toBe('25');
    expect(open.reconciliation.status).toBe('MATCHED');
    expect(open.status).toBe('APPROVED_PARTIAL');
    expect(open.strategyReady).toBe(false);
    expect(open.feeStatus).toBe('UNKNOWN');

    const sellEvents = classifyLunoTransactions(
      [
        ...[
          tx({
            id: '1',
            lunoAccountId: BTC,
            rowIndex: '1',
            reference: 'b',
            currency: 'XBT',
            kind: 'EXCHANGE',
            description: 'Bought',
            balanceDelta: '0.002',
          }),
          tx({
            id: '2',
            lunoAccountId: MYR,
            rowIndex: '1',
            reference: 'b',
            currency: 'MYR',
            kind: 'EXCHANGE',
            description: 'Bought',
            balanceDelta: '-800',
          }),
          tx({
            id: '3',
            lunoAccountId: BTC,
            rowIndex: '2',
            reference: 's',
            currency: 'XBT',
            kind: 'EXCHANGE',
            description: 'Sold',
            balanceDelta: '-0.002',
            occurredAt: new Date('2024-02-01T00:00:00.000Z'),
          }),
          tx({
            id: '4',
            lunoAccountId: MYR,
            rowIndex: '2',
            reference: 's',
            currency: 'MYR',
            kind: 'EXCHANGE',
            description: 'Sold',
            balanceDelta: '900',
            occurredAt: new Date('2024-02-01T00:00:00.000Z'),
          }),
        ],
      ],
      BTC,
      MYR,
    );
    const sold = runFifo(sellEvents);
    const flat = buildPortfolioView({
      fifo: sold,
      liveBtcBalance: '0',
      btcPriceMyr: '500000',
    });
    expect(flat.btcQuantity).toBe('0');
    expect(flat.averageBuyPriceMyr).toBeNull();
    expect(flat.profitAlreadyTakenMyr).toBe('100');
    expect(flat.principalRecoveredMyr).toBe('800');
  });

  it('caps displayed principal recovery at 100 while keeping raw ratio', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-100',
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 's',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 's',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '250',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const view = buildPortfolioView({
      fifo: runFifo(events),
      liveBtcBalance: '0',
      btcPriceMyr: '1',
    });
    expect(view.principalRecoveryPct).toBe('100');
    expect(view.principalRecoveryPctRaw).toBe('100');
  });

  it('caps displayed principal recovery at 100 when the raw ratio exceeds 100', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd',
          lunoAccountId: MYR,
          rowIndex: '0',
          reference: 'dep',
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Deposit',
          balanceDelta: '200',
        }),
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 's1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 's1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '300',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
        tx({
          id: '5',
          lunoAccountId: BTC,
          rowIndex: '3',
          reference: 'b2',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-01-04T00:00:00.000Z'),
        }),
        tx({
          id: '6',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: 'b2',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
          occurredAt: new Date('2024-01-04T00:00:00.000Z'),
        }),
        tx({
          id: '7',
          lunoAccountId: BTC,
          rowIndex: '4',
          reference: 's2',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-01-05T00:00:00.000Z'),
        }),
        tx({
          id: '8',
          lunoAccountId: MYR,
          rowIndex: '4',
          reference: 's2',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '260',
          occurredAt: new Date('2024-01-05T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(fifo.externalContributionMyr).toBe('200');
    expect(fifo.principalRecoveredMyr).toBe('450');
    const view = buildPortfolioView({
      fifo,
      liveBtcBalance: '0',
      btcPriceMyr: '1',
    });
    expect(view.principalRecoveryPctRaw).toBe('225');
    expect(view.principalRecoveryPct).toBe('100');
  });

  it('treats reinvested sale proceeds as not new external contribution', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd',
          lunoAccountId: MYR,
          rowIndex: '0',
          reference: 'dep',
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Deposit',
          balanceDelta: '200',
        }),
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 's1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 's1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold',
          balanceDelta: '300',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
        tx({
          id: '5',
          lunoAccountId: BTC,
          rowIndex: '3',
          reference: 'b2',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-01-04T00:00:00.000Z'),
        }),
        tx({
          id: '6',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: 'b2',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
          occurredAt: new Date('2024-01-04T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(fifo.moneyPutInMyr).toBe('450');
    expect(fifo.reinvestedMyr).toBe('250');
    expect(fifo.externalContributionMyr).toBe('200');
  });

  it('matches live balance, allows dust, and hard-fails mismatch', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'b',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.00000504',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'b',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-2',
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    const matched = buildPortfolioView({
      fifo,
      liveBtcBalance: '0.00000504',
      btcPriceMyr: '315451',
      classifiedEvents: events,
    });
    expect(matched.reconciliation.status).toBe('MATCHED');
    expect(matched.status).toBe('APPROVED_PARTIAL');
    expect(matched.strategyReady).toBe(false);

    const dust = buildPortfolioView({
      fifo,
      liveBtcBalance: '0.00000503',
      btcPriceMyr: '1',
      classifiedEvents: events,
    });
    expect(dust.reconciliation.status).toBe('SMALL_ROUNDING_DIFFERENCE');

    const mismatch = buildPortfolioView({
      fifo,
      liveBtcBalance: '0.001',
      btcPriceMyr: '1',
    });
    expect(mismatch.reconciliation.status).toBe('MISMATCH');
    expect(mismatch.status).toBe('NOT_READY');
    expect(mismatch.strategyReady).toBe(false);
  });

  it('rebuilds deterministically and ignores duplicate identical source rows by grouping', () => {
    const rows = [
      tx({
        id: '1',
        lunoAccountId: BTC,
        rowIndex: '1',
        reference: 'b',
        currency: 'XBT',
        kind: 'EXCHANGE',
        description: 'Bought',
        balanceDelta: '0.001',
      }),
      tx({
        id: '2',
        lunoAccountId: MYR,
        rowIndex: '1',
        reference: 'b',
        currency: 'MYR',
        kind: 'EXCHANGE',
        description: 'Bought',
        balanceDelta: '-821',
      }),
    ];
    const first = runFifo(classifyLunoTransactions(rows, BTC, MYR));
    const second = runFifo(classifyLunoTransactions(rows, BTC, MYR));
    expect(first.moneyPutInMyr).toBe(second.moneyPutInMyr);
    expect(first.totalBtcBought).toBe(second.totalBtcBought);
    expect(remainingBtc(first.lots)).toBe(remainingBtc(second.lots));
  });

  it('skips malformed decimals without inventing quantities', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'bad',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'x',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: 'not-a-number',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events[0].classification).toBe('UNKNOWN');
    expect(runFifo(events).totalBtcBought).toBe('0');
  });

  it('does not add Instant BTC fees to MYR cost or subtract them from proceeds', () => {
    const details = {
      Fee: 'BTC 0.00000778',
      Price: '126,004.89 MYR/BTC',
    };
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'inst',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought BTC 0.00038903 for RM 50.00',
          balanceDelta: '0.00038903',
          details,
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'inst',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought BTC 0.00038903 for RM 50.00',
          balanceDelta: '-50',
          details,
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'sell',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Sold BTC 0.00038903 for RM 60.00',
          balanceDelta: '-0.00038903',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
          details: {
            Fee: 'BTC 0.0000048',
            Price: '208,935.88 MYR/BTC',
          },
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'sell',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Sold BTC 0.00038903 for RM 60.00',
          balanceDelta: '60',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
          details: {
            Fee: 'BTC 0.0000048',
            Price: '208,935.88 MYR/BTC',
          },
        }),
      ],
      BTC,
      MYR,
    );
    const buy = events.find((row) => row.classification === 'BTC_BUY');
    expect(buy?.feeTreatment).toBe('EMBEDDED');
    expect(buy?.feeStatus).toBe('DERIVED');
    expect(buy?.feeMyr).toBe('0');
    const fifo = runFifo(events);
    expect(fifo.moneyPutInMyr).toBe('50');
    expect(fifo.realisedPnlMyr).toBe('10');
    expect(remainingBtc(fifo.lots)).toBe('0');
    const view = buildPortfolioView({
      fifo,
      liveBtcBalance: '0',
      btcPriceMyr: '1',
      classifiedEvents: events,
    });
    expect(view.status).toBe('READY');
    expect(view.feeCoverage.missingFeeTransactions).toBe(0);
    expect(view.strategyReady).toBe(true);
  });

  it('derives Exchange fees from order fee_counter without double-counting statement fees', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.01',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-1000',
        }),
      ],
      BTC,
      MYR,
    );
    const withOrder = attachOrderFees(events, [
      { lunoOrderId: 'BX1', feeCounter: '5', feeBase: '0' },
    ]);
    expect(withOrder[0].feeStatus).toBe('DERIVED');
    expect(runFifo(withOrder).moneyPutInMyr).toBe('1005');
    const withStatement = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.01',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-1000',
        }),
        tx({
          id: '3',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'BX1',
          currency: 'MYR',
          kind: 'FEE',
          description: 'Trading fee',
          balanceDelta: '-8',
        }),
      ],
      BTC,
      MYR,
    );
    const ignored = attachOrderFees(withStatement, [
      { lunoOrderId: 'BX1', feeCounter: '99', feeBase: '0' },
    ]);
    expect(ignored[0].feeMyr).toBe('8');
    expect(runFifo(ignored).moneyPutInMyr).toBe('1008');
  });

  it('marks accounting APPROVED_PARTIAL for missing fees and NOT_READY on mismatch', () => {
    const missing = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'm',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'm',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-100',
        }),
      ],
      BTC,
      MYR,
    );
    const missingView = buildPortfolioView({
      fifo: runFifo(missing),
      liveBtcBalance: '0.001',
      btcPriceMyr: '100000',
      classifiedEvents: missing,
    });
    expect(missingView.status).toBe('APPROVED_PARTIAL');
    expect(missingView.feeCoverage.missingFeeTransactions).toBe(1);
    expect(missingView.feeCoverage.impactStatus).toBe('UNKNOWN');
    expect(missingView.strategyReady).toBe(false);

    const mismatch = buildPortfolioView({
      fifo: runFifo(missing),
      liveBtcBalance: '0.002',
      btcPriceMyr: '100000',
      classifiedEvents: missing,
    });
    expect(mismatch.status).toBe('NOT_READY');
    expect(mismatch.reconciliation.status).toBe('MISMATCH');
  });

  it('keeps PARTIAL when a zero-cost lot remains even if fees are known', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'dep',
          currency: 'XBT',
          kind: 'RECEIVED',
          description: 'Deposit',
          balanceDelta: '0.01',
        }),
      ],
      BTC,
      MYR,
    );
    const view = buildPortfolioView({
      fifo: runFifo(events),
      liveBtcBalance: '0.01',
      btcPriceMyr: '100000',
      classifiedEvents: events,
    });
    expect(view.status).toBe('PARTIAL');
    expect(view.strategyReady).toBe(false);
    expect(view.reconciliation.status).toBe('MATCHED');
  });

  it('treats a malformed order fee as UNKNOWN without inventing a value', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'BX1',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-100',
        }),
      ],
      BTC,
      MYR,
    );
    const unknown = attachOrderFees(events, [
      { lunoOrderId: 'BX1', feeCounter: 'not-a-fee', feeBase: '0' },
    ]);
    expect(unknown[0].feeStatus).toBe('UNKNOWN');
    expect(unknown[0].feeMyr).toBe('0');
    const view = buildPortfolioView({
      fifo: runFifo(unknown),
      liveBtcBalance: '0.001',
      btcPriceMyr: '1',
      classifiedEvents: unknown,
    });
    expect(view.status).toBe('APPROVED_PARTIAL');
    expect(view.feeCoverage.unknownFeeTransactions).toBe(1);
  });

  it('classifies mixed Instant and missing-fee history without changing Instant cash PnL', () => {
    const details = {
      Fee: 'BTC 0.00000778',
      Price: '126,004.89 MYR/BTC',
    };
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'inst',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought BTC 0.00038903 for RM 50.00',
          balanceDelta: '0.00038903',
          details,
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'inst',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought BTC 0.00038903 for RM 50.00',
          balanceDelta: '-50',
          details,
        }),
        tx({
          id: '3',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'old',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        tx({
          id: '4',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'old',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-200',
          occurredAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    const fifo = runFifo(events);
    expect(fifo.moneyPutInMyr).toBe('250');
    const view = buildPortfolioView({
      fifo,
      liveBtcBalance: remainingBtc(fifo.lots),
      btcPriceMyr: '100000',
      classifiedEvents: events,
    });
    expect(view.status).toBe('APPROVED_PARTIAL');
    expect(view.feeCoverage.derivedFeeTransactions).toBe(1);
    expect(view.feeCoverage.missingFeeTransactions).toBe(1);
    expect(view.feeCoverage.feeCoveragePct).toBe('50');
  });
});
