import { identifyBtcMyrAccounts } from './luno-accounts';
import type { LunoAccountBalance } from './luno.types';

function row(
  partial: Partial<LunoAccountBalance> & Pick<LunoAccountBalance, 'account_id' | 'asset'>,
): LunoAccountBalance {
  return {
    balance: '0',
    reserved: '0',
    unconfirmed: '0',
    ...partial,
  };
}

describe('identifyBtcMyrAccounts', () => {
  it('prefers TRANSACTIONAL XBT and MYR accounts', () => {
    const result = identifyBtcMyrAccounts([
      row({
        account_id: 'xbt-savings',
        asset: 'XBT',
        account_type: 'SAVINGS',
        balance: '0.1',
      }),
      row({
        account_id: 'xbt-spot',
        asset: 'XBT',
        account_type: 'TRANSACTIONAL',
        balance: '0.01',
      }),
      row({
        account_id: 'myr-spot',
        asset: 'MYR',
        account_type: 'TRANSACTIONAL',
        balance: '250.55',
        reserved: '10.00',
      }),
    ]);
    expect(result.btc?.account_id).toBe('xbt-spot');
    expect(result.myr?.account_id).toBe('myr-spot');
  });

  it('falls back to the first matching asset when no preferred type exists', () => {
    const result = identifyBtcMyrAccounts([
      row({ account_id: 'xbt-1', asset: 'xbt', balance: '1' }),
    ]);
    expect(result.btc?.account_id).toBe('xbt-1');
    expect(result.myr).toBeNull();
  });
});
