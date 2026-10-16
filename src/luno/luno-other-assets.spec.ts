import {
  LUNO_OTHER_ASSET_QUANTITY_FORMULA,
  LUNO_OTHER_ASSET_SORT,
  detectOtherLunoAssets,
  type LunoStoredAssetBalance,
} from './luno-other-assets';

function row(
  asset: string,
  balance: string,
  reserved = '0',
  unconfirmed = '0',
): LunoStoredAssetBalance {
  return { asset, balance, reserved, unconfirmed };
}

describe('detectOtherLunoAssets', () => {
  it('detects a positive XAUT balance with a friendly label', () => {
    expect(detectOtherLunoAssets([row('XAUT', '0.012345')])).toEqual([
      {
        asset: 'XAUT',
        quantity: '0.012345',
        displayName: 'Tether Gold',
      },
    ]);
  });

  it('detects a positive ETH balance without requiring a display name', () => {
    expect(detectOtherLunoAssets([row('eth', '1.5')])).toEqual([
      { asset: 'ETH', quantity: '1.5' },
    ]);
  });

  it('detects an unknown future asset without an allowlist', () => {
    expect(detectOtherLunoAssets([row('ABC', '3')])).toEqual([
      { asset: 'ABC', quantity: '3' },
    ]);
  });

  it('excludes BTC, XBT, and MYR', () => {
    expect(
      detectOtherLunoAssets([
        row('XBT', '0.01'),
        row('BTC', '0.02'),
        row('MYR', '100.00', '10'),
        row('ETH', '0.4'),
      ]),
    ).toEqual([{ asset: 'ETH', quantity: '0.4' }]);
  });

  it('excludes a zero balance and keeps genuine dust', () => {
    expect(
      detectOtherLunoAssets([
        row('LTC', '0'),
        row('UNI', '0.00000000', '0'),
        row('XRP', '0.00000001'),
      ]),
    ).toEqual([{ asset: 'XRP', quantity: '0.00000001' }]);
  });

  it('uses balance + reserved and ignores unconfirmed', () => {
    expect(LUNO_OTHER_ASSET_QUANTITY_FORMULA).toBe('balance + reserved');
    expect(
      detectOtherLunoAssets([
        row('ETH', '1.25', '0.25', '9'),
        row('ETH', '0.50', '0', '1'),
      ]),
    ).toEqual([{ asset: 'ETH', quantity: '2' }]);
  });

  it('returns multiple assets with XAUT first, then alphabetical', () => {
    expect(LUNO_OTHER_ASSET_SORT).toBe('XAUT, then alphabetical');
    expect(
      detectOtherLunoAssets([
        row('XRP', '2'),
        row('ETH', '1'),
        row('LTC', '4'),
        row('XAUT', '0.1'),
        row('UNI', '3'),
      ]).map((item) => item.asset),
    ).toEqual(['XAUT', 'ETH', 'LTC', 'UNI', 'XRP']);
  });

  it('skips a blank symbol and a malformed amount without rejecting the rest', () => {
    expect(
      detectOtherLunoAssets([
        row(' ', '1'),
        row('ABC', 'not-a-number'),
        row('ETH', '0.2'),
      ]),
    ).toEqual([{ asset: 'ETH', quantity: '0.2' }]);
  });

  it('uses only the balances it is given', () => {
    expect(detectOtherLunoAssets([])).toEqual([]);
  });
});
