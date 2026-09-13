import { LUNO_ASSET_BTC, LUNO_ASSET_MYR } from './luno.constants';
import type { LunoAccountBalance } from './luno.types';

const PREFERRED_TYPES = new Set(['TRANSACTIONAL', 'SPOT', 'Current/Cheque']);

function pickAccount(
  balances: LunoAccountBalance[],
  asset: string,
): LunoAccountBalance | null {
  const matches = balances.filter(
    (row) => (row.asset ?? '').toUpperCase() === asset,
  );
  if (matches.length === 0) {
    return null;
  }
  const preferred = matches.find((row) =>
    PREFERRED_TYPES.has((row.account_type ?? '').toUpperCase()),
  );
  return preferred ?? matches[0];
}

export function identifyBtcMyrAccounts(balances: LunoAccountBalance[]): {
  btc: LunoAccountBalance | null;
  myr: LunoAccountBalance | null;
} {
  return {
    btc: pickAccount(balances, LUNO_ASSET_BTC),
    myr: pickAccount(balances, LUNO_ASSET_MYR),
  };
}
