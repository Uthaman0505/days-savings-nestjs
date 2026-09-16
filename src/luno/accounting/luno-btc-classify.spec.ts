import { attachOrderFees, classifyLunoTransactions } from './luno-btc-classify';
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

describe('classifyLunoTransactions', () => {
  it('pairs XBT+MYR legs on the same reference as a buy without inventing a fee', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'oid',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought Bitcoin',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'oid',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought Bitcoin',
          balanceDelta: '-250',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events).toHaveLength(1);
    expect(events[0].classification).toBe('BTC_BUY');
    expect(events[0].btcQuantity).toBe('0.001');
    expect(events[0].myrAmount).toBe('250');
    expect(events[0].feeMyr).toBe('0');
    expect(events[0].feeStatus).toBe('MISSING');
    expect(events[0].feeTreatment).toBe('NONE');
  });

  it('keeps a separate FEE row off the MYR trade amount', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'oid',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'oid',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
        }),
        tx({
          id: '3',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'oid',
          currency: 'MYR',
          kind: 'FEE',
          description: 'Trading fee',
          balanceDelta: '-1.25',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events).toHaveLength(1);
    expect(events[0].myrAmount).toBe('250');
    expect(events[0].feeMyr).toBe('1.25');
    expect(events[0].feeStatus).toBe('EXACT');
    expect(events[0].feeSource).toBe('STATEMENT_FEE_ROW');
    expect(events[0].feeTreatment).toBe('ADDED_TO_MYR_COST');
  });

  it('classifies deposits, withdrawals, and internal transfers', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'dep',
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Deposit',
          balanceDelta: '100',
        }),
        tx({
          id: 'in',
          lunoAccountId: BTC,
          rowIndex: '2',
          reference: 'tin',
          currency: 'XBT',
          kind: 'TRANSFER',
          description: 'Transfer',
          balanceDelta: '0.002',
          occurredAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        tx({
          id: 'out',
          lunoAccountId: BTC,
          rowIndex: '3',
          reference: 'wd',
          currency: 'XBT',
          kind: 'WITHDRAWAL',
          description: 'Sent',
          balanceDelta: '-0.001',
          occurredAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
      ],
      BTC,
      MYR,
    );
    expect(events.map((row) => row.classification)).toEqual([
      'MYR_DEPOSIT',
      'INTERNAL_TRANSFER',
      'BTC_WITHDRAWAL',
    ]);
    expect(events[1].btcDirection).toBe('IN');
    expect(events[2].btcDirection).toBe('OUT');
  });

  it('nets a MYR deposit fee and ignores zero-delta reservation rows', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'd1',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'depfee',
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Deposit received',
          balanceDelta: '50.7',
        }),
        tx({
          id: 'd2',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'depfee',
          currency: 'MYR',
          kind: 'FEE',
          description: 'Deposit fee',
          balanceDelta: '-0.7',
        }),
        tx({
          id: 'z',
          lunoAccountId: MYR,
          rowIndex: '3',
          reference: null,
          currency: 'MYR',
          kind: 'TRANSFER',
          description: 'Reserved funds for withdrawal',
          balanceDelta: '0',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events).toHaveLength(1);
    expect(events[0].classification).toBe('MYR_DEPOSIT');
    expect(events[0].myrAmount).toBe('50');
  });

  it('excludes non-BTC assets from BTC accounting without a failure warning', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: 'u',
          lunoAccountId: 'eth',
          rowIndex: '1',
          reference: null,
          currency: 'ETH',
          kind: 'EXCHANGE',
          description: 'Mystery',
          balanceDelta: '1',
        }),
        tx({
          id: 'u2',
          lunoAccountId: 'eth-acc',
          rowIndex: '1',
          reference: 'eth-buy',
          currency: 'ETH',
          kind: 'EXCHANGE',
          description: 'Bought ETH',
          balanceDelta: '0.5',
        }),
        tx({
          id: 'u3',
          lunoAccountId: MYR,
          rowIndex: '2',
          reference: 'eth-buy',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought ETH',
          balanceDelta: '-100',
        }),
      ],
      BTC,
      MYR,
    );
    expect(events.every((row) => row.classification === 'EXCLUDED_ASSET')).toBe(
      true,
    );
    expect(events.every((row) => row.excludedAsset === 'ETH')).toBe(true);
  });

  it('attaches order fee_counter once and does not overwrite a statement fee', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'oid',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'oid',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
        }),
      ],
      BTC,
      MYR,
    );
    const withOrder = attachOrderFees(events, [
      { lunoOrderId: 'oid', feeCounter: '1.10', feeBase: '0' },
    ]);
    expect(withOrder[0].feeMyr).toBe('1.10');

    const withStatementFee = classifyLunoTransactions(
      [
        ...[
          tx({
            id: '1',
            lunoAccountId: BTC,
            rowIndex: '1',
            reference: 'oid',
            currency: 'XBT',
            kind: 'EXCHANGE',
            description: 'Bought',
            balanceDelta: '0.001',
          }),
          tx({
            id: '2',
            lunoAccountId: MYR,
            rowIndex: '1',
            reference: 'oid',
            currency: 'MYR',
            kind: 'EXCHANGE',
            description: 'Bought',
            balanceDelta: '-250',
          }),
          tx({
            id: '3',
            lunoAccountId: MYR,
            rowIndex: '2',
            reference: 'oid',
            currency: 'MYR',
            kind: 'FEE',
            description: 'Fee',
            balanceDelta: '-2',
          }),
        ],
      ],
      BTC,
      MYR,
    );
    const ignored = attachOrderFees(withStatementFee, [
      { lunoOrderId: 'oid', feeCounter: '9', feeBase: '0' },
    ]);
    expect(ignored[0].feeMyr).toBe('2');
  });

  it('treats Instant details.Fee as embedded and does not add it to MYR cash', () => {
    const details = {
      Fee: 'BTC\u00a00.00000778',
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
      ],
      BTC,
      MYR,
    );
    expect(events[0].feeTreatment).toBe('EMBEDDED');
    expect(events[0].feeStatus).toBe('DERIVED');
    expect(events[0].feeMyr).toBe('0');
    expect(events[0].tradeChannel).toBe('INSTANT');
    expect(events[0].feeBtc).toBe('0.00000778');
  });

  it('derives Exchange fees from listtrades without replacing a statement fee', () => {
    const events = classifyLunoTransactions(
      [
        tx({
          id: '1',
          lunoAccountId: BTC,
          rowIndex: '1',
          reference: 'BX9',
          currency: 'XBT',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '0.001',
        }),
        tx({
          id: '2',
          lunoAccountId: MYR,
          rowIndex: '1',
          reference: 'BX9',
          currency: 'MYR',
          kind: 'EXCHANGE',
          description: 'Bought',
          balanceDelta: '-250',
        }),
      ],
      BTC,
      MYR,
    );
    const withTrade = attachOrderFees(
      events,
      [],
      [{ id: 'BX9', feeCounter: '0.80', feeBase: '0' }],
    );
    expect(withTrade[0].feeStatus).toBe('DERIVED');
    expect(withTrade[0].feeSource).toBe('USER_TRADE');
    expect(withTrade[0].feeMyr).toBe('0.80');
  });
});
