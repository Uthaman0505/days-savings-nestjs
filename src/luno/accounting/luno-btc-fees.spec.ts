import {
  attachExchangeFees,
  buildFeeAudit,
  cashAppliedFee,
  defaultTradeFee,
  parseInstantDetails,
  summarizeFeeCoverage,
} from './luno-btc-fees';
import type { ClassifiedEvent } from './luno-btc.types';

function trade(
  partial: Partial<ClassifiedEvent> &
    Pick<ClassifiedEvent, 'classification' | 'myrAmount' | 'btcQuantity'>,
): ClassifiedEvent {
  return {
    occurredAt: new Date('2024-11-24T00:00:00.000Z'),
    reference: 'r1',
    sourceTransactionIds: ['1'],
    btcDirection: partial.classification === 'BTC_BUY' ? 'IN' : 'OUT',
    warning: null,
    ...defaultTradeFee(),
    ...partial,
  };
}

describe('parseInstantDetails', () => {
  it('derives MYR from BTC fee × Price and strips commas and NBSP', () => {
    const parsed = parseInstantDetails({
      Fee: 'BTC\u00a00.00000778',
      Price: '126,004.89 MYR/BTC',
    });
    expect(parsed?.feeBtc).toBe('0.00000778');
    expect(parsed?.priceMyrPerBtc).toBe('126004.89');
    expect(parsed?.feeMyr).toBe('0.9803180442');
  });

  it('accepts an exact MYR Instant fee without inventing BTC', () => {
    const parsed = parseInstantDetails({
      Fee: 'RM 1.25',
      Price: '100000 MYR/BTC',
    });
    expect(parsed?.feeBtc).toBe('0');
    expect(parsed?.feeMyr).toBe('1.25');
  });

  it('returns null when Fee is missing', () => {
    expect(parseInstantDetails({ Price: '100000 MYR/BTC' })).toBeNull();
  });
});

describe('cashAppliedFee', () => {
  it('does not apply embedded Instant fees to cash', () => {
    const event = trade({
      classification: 'BTC_BUY',
      myrAmount: '50',
      btcQuantity: '0.00038903',
      feeMyr: '0',
      feeMyrReported: '0.98',
      feeTreatment: 'EMBEDDED',
      feeStatus: 'DERIVED',
    });
    expect(cashAppliedFee(event)).toBe('0');
  });

  it('applies statement and order fees once', () => {
    expect(
      cashAppliedFee(
        trade({
          classification: 'BTC_BUY',
          myrAmount: '1000',
          btcQuantity: '0.01',
          feeMyr: '10',
          feeMyrReported: '10',
          feeTreatment: 'ADDED_TO_MYR_COST',
          feeStatus: 'EXACT',
        }),
      ),
    ).toBe('10');
    expect(
      cashAppliedFee(
        trade({
          classification: 'BTC_SELL',
          myrAmount: '434.08',
          btcQuantity: '0.00108',
          feeMyr: '2.17',
          feeMyrReported: '2.17',
          feeTreatment: 'SUBTRACTED_FROM_PROCEEDS',
          feeStatus: 'DERIVED',
        }),
      ),
    ).toBe('2.17');
  });
});

describe('summarizeFeeCoverage', () => {
  it('quantifies mixed exact, derived, missing, and unknown rows', () => {
    const coverage = summarizeFeeCoverage(
      buildFeeAudit([
        trade({
          classification: 'BTC_BUY',
          myrAmount: '50',
          btcQuantity: '0.0003',
          feeMyrReported: '0.98',
          feeStatus: 'DERIVED',
          feeSource: 'INSTANT_DETAILS',
          feeTreatment: 'EMBEDDED',
        }),
        trade({
          classification: 'BTC_SELL',
          myrAmount: '434.08',
          btcQuantity: '0.00108',
          feeMyr: '2',
          feeMyrReported: '2',
          feeStatus: 'EXACT',
          feeSource: 'STATEMENT_FEE_ROW',
          feeTreatment: 'SUBTRACTED_FROM_PROCEEDS',
          reference: 's1',
        }),
        trade({
          classification: 'BTC_BUY',
          myrAmount: '200',
          btcQuantity: '0.001',
          feeStatus: 'MISSING',
          reference: 'm1',
        }),
        trade({
          classification: 'BTC_SELL',
          myrAmount: '100',
          btcQuantity: '0.0004',
          feeStatus: 'UNKNOWN',
          reference: 'u1',
        }),
      ]),
    );
    expect(coverage.tradeCount).toBe(4);
    expect(coverage.exactFeeTransactions).toBe(1);
    expect(coverage.derivedFeeTransactions).toBe(1);
    expect(coverage.missingFeeTransactions).toBe(1);
    expect(coverage.unknownFeeTransactions).toBe(1);
    expect(coverage.knownFeesMyr).toBe('2.98');
    expect(coverage.affectedGrossAmountMyr).toBe('300');
    expect(coverage.feeCoveragePct).toBe('50');
    expect(coverage.impactStatus).toBe('UNKNOWN');
    expect(coverage.estimatedMinAccountingImpactMyr).toBeNull();
    expect(coverage.estimatedMaxAccountingImpactMyr).toBeNull();
  });
});

describe('attachExchangeFees', () => {
  it('does not double-count a statement fee already marked EXACT', () => {
    const events = [
      trade({
        classification: 'BTC_BUY',
        myrAmount: '1000',
        btcQuantity: '0.01',
        feeMyr: '8',
        feeMyrReported: '8',
        feeStatus: 'EXACT',
        feeSource: 'STATEMENT_FEE_ROW',
        feeTreatment: 'ADDED_TO_MYR_COST',
        reference: 'BX1',
      }),
    ];
    const attached = attachExchangeFees(
      events,
      [{ id: 'BX1', feeCounter: '99', feeBase: '0' }],
      [],
    );
    expect(attached[0].feeMyr).toBe('8');
    expect(attached[0].feeSource).toBe('STATEMENT_FEE_ROW');
  });
});
