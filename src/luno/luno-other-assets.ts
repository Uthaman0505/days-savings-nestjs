import { addDecimalStrings, compareDecimal } from './luno-decimal';

/**
 * Holdings quantity already used for live BTC in LunoBtcAccountingService:
 * balance + reserved.
 * Unconfirmed is stored on luno_accounts / luno_balances and is not added.
 */
export const LUNO_OTHER_ASSET_QUANTITY_FORMULA = 'balance + reserved' as const;

/** Friendly labels only. Detection does not consult this map. */
export const LUNO_OTHER_ASSET_DISPLAY_NAMES: Readonly<Record<string, string>> =
  {
    XAUT: 'Tether Gold',
  };

/**
 * XAUT first when present, then remaining symbols A–Z.
 * Provider row order is ignored.
 */
export const LUNO_OTHER_ASSET_SORT = 'XAUT, then alphabetical' as const;

const HIDDEN_ASSETS = new Set(['XBT', 'BTC', 'MYR']);

export type LunoStoredAssetBalance = {
  asset: string;
  balance: string;
  reserved: string;
  unconfirmed?: string;
};

export type LunoDetectedAsset = {
  asset: string;
  quantity: string;
  displayName?: string;
};

/**
 * Positive-balance Luno assets other than BTC/XBT and MYR.
 * Reads already-synced account rows. Does not call Luno.
 */
export function detectOtherLunoAssets(
  rows: LunoStoredAssetBalance[],
): LunoDetectedAsset[] {
  const totals = new Map<string, string>();
  for (const row of rows) {
    const asset = String(row.asset ?? '')
      .trim()
      .toUpperCase();
    if (!asset || HIDDEN_ASSETS.has(asset)) {
      continue;
    }
    let quantity: string;
    try {
      quantity = addDecimalStrings(row.balance ?? '0', row.reserved ?? '0');
    } catch {
      continue;
    }
    const current = totals.get(asset);
    totals.set(
      asset,
      current == null ? quantity : addDecimalStrings(current, quantity),
    );
  }

  const detected: LunoDetectedAsset[] = [];
  for (const [asset, quantity] of totals) {
    if (compareDecimal(quantity, '0') <= 0) {
      continue;
    }
    const displayName = LUNO_OTHER_ASSET_DISPLAY_NAMES[asset];
    detected.push(
      displayName ? { asset, quantity, displayName } : { asset, quantity },
    );
  }
  detected.sort(compareDetectedAssets);
  return detected;
}

function compareDetectedAssets(
  left: LunoDetectedAsset,
  right: LunoDetectedAsset,
): number {
  if (left.asset === 'XAUT' && right.asset !== 'XAUT') {
    return -1;
  }
  if (right.asset === 'XAUT' && left.asset !== 'XAUT') {
    return 1;
  }
  return left.asset.localeCompare(right.asset);
}
