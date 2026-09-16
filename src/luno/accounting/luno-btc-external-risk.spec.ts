import {
  evaluateBtcBuyDecision,
  type BuyDecisionInput,
} from './luno-btc-decision';
import type { MarketSnapshotView } from './luno-btc-market';
import type { ProviderNewsItem } from '../news/news-provider';
import type { ProviderEconomicItem } from '../news/news-provider';
import {
  applyExternalRiskModifier,
  calculateExternalRiskSnapshot,
  classifyEconomicEvent,
  classifyNews,
  clusterNews,
  emptyExternalRisk,
  newsDataStatus,
  normalizeHeadline,
  type ExternalRiskSnapshotView,
} from './luno-btc-external-risk';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function news(
  partial: Partial<ProviderNewsItem> & { headline: string },
): ProviderNewsItem {
  return {
    externalId: partial.externalId ?? partial.headline.slice(0, 40),
    provider: 'FINNHUB',
    sourceName: partial.sourceName ?? 'Reuters',
    sourceUrl: partial.sourceUrl ?? 'https://www.reuters.com/example',
    headline: partial.headline,
    summary: partial.summary ?? null,
    publishedAt: partial.publishedAt ?? NOW,
    countryOrRegion: partial.countryOrRegion ?? 'US',
    raw: partial.raw ?? {},
  };
}

function economic(
  partial: Partial<ProviderEconomicItem> & { eventName: string },
): ProviderEconomicItem {
  return {
    externalId: partial.externalId ?? partial.eventName,
    provider: 'FINNHUB',
    eventName: partial.eventName,
    country: partial.country ?? 'US',
    scheduledAt:
      partial.scheduledAt ?? new Date(NOW.getTime() + 8 * 60 * 60 * 1000),
    actualValue: partial.actualValue ?? null,
    forecastValue: partial.forecastValue ?? '0.2',
    previousValue: partial.previousValue ?? '0.3',
    importance: partial.importance ?? 'HIGH',
    status: partial.status ?? 'SCHEDULED',
    sourceUrl: partial.sourceUrl ?? null,
  };
}

function snapshot(
  newsItems: ProviderNewsItem[],
  extra?: Partial<Parameters<typeof calculateExternalRiskSnapshot>[0]>,
): ExternalRiskSnapshotView {
  return calculateExternalRiskSnapshot({
    now: NOW,
    lastSuccessfulFetchAt: NOW,
    sourceHealthy: true,
    news: newsItems.map(classifyNews),
    economic:
      (extra?.economic as ReturnType<typeof classifyEconomicEvent>[]) ?? [],
    market: extra?.market ?? calmMarket(),
    lookaheadMs: extra?.lookaheadMs,
    ...extra,
    news: newsItems.map(classifyNews),
  });
}

function calmMarket(): MarketSnapshotView {
  return {
    direction: 'UNCLEAR',
    buyingCondition: 'NORMAL',
    stability: 'NORMAL',
    confidence: 'MEDIUM',
    currentPriceMyr: '313903',
    shortTrendPct: '-0.4',
    mediumTrendPct: '0.1',
    drawdownFromRecentHighPct: '-1.0',
    volatilityPct: '1.2',
    momentumValue: '0.2',
    sma20Myr: '318000',
    sma50Myr: '320000',
    recentHighMyr: '318000',
    recentLowMyr: '310000',
    marketScore: '10',
    reason: ['BTC market movement is currently normal.'],
    source: 'LUNO',
    latestCandleAt: NOW,
    marketDataAgeMinutes: '8',
    marketContextStatus: 'FRESH',
  };
}

function unstableMarket(): MarketSnapshotView {
  return {
    ...calmMarket(),
    stability: 'UNSTABLE',
    buyingCondition: 'RISKY',
    drawdownFromRecentHighPct: '-8.0',
  };
}

function baseDecision(
  action: 'BUY_MORE' | 'BUY_SMALL' | 'WAIT' | 'HOLD' | 'STOP_BUYING_THIS_MONTH',
  suggested: string | null,
) {
  const input: BuyDecisionInput = {
    accountingStatus: 'READY',
    currentBtcPriceMyr: '290000',
    averageBuyPriceMyr: '326000',
    monthlyBudgetMyr: '100',
    monthlyUsedMyr: '50',
    monthlyRemainingMyr: '50',
    maxAllowedNewSpendMyr: '50',
    normalBuyAllocationMyr: '50',
    dipReserveAllocationMyr: '50',
    lunoMyrAvailableMyr: '64.37',
    actedZones: action === 'BUY_MORE' ? ['FIRST_BUY_ZONE'] : [],
    remainingNormalBuyMyr: '50',
    remainingDipReserveMyr: '50',
  };
  if (action === 'BUY_SMALL') {
    return evaluateBtcBuyDecision({
      ...input,
      currentBtcPriceMyr: '309000',
      actedZones: [],
    });
  }
  if (action === 'WAIT') {
    return evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '317000' });
  }
  if (action === 'HOLD') {
    return evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '326000' });
  }
  if (action === 'STOP_BUYING_THIS_MONTH') {
    return evaluateBtcBuyDecision({
      ...input,
      monthlyRemainingMyr: '0',
      maxAllowedNewSpendMyr: '0',
    });
  }
  return {
    ...evaluateBtcBuyDecision({ ...input, currentBtcPriceMyr: '290000' }),
    action,
    suggestedAmountMyr: suggested,
  };
}

describe('luno-btc-external-risk', () => {
  it('classifies LOW risk when there is little meaningful news', () => {
    const risk = snapshot([]);
    expect(risk.riskLevel).toBe('LOW');
    expect(risk.dominantCategory).toBe('NONE');
    expect(risk.reasons[0]).toMatch(/little meaningful/i);
  });

  it('classifies NORMAL risk for ordinary crypto flow', () => {
    const risk = snapshot([
      news({
        headline: 'Bitcoin network activity stays steady this week',
        summary: 'Ordinary bitcoin and crypto market commentary.',
        publishedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
      }),
    ]);
    expect(risk.riskLevel).toBe('NORMAL');
    expect(risk.dominantCategory).toBe('CRYPTO');
  });

  it('classifies ELEVATED when a high-importance CPI print is due soon', () => {
    const risk = calculateExternalRiskSnapshot({
      now: NOW,
      lastSuccessfulFetchAt: NOW,
      sourceHealthy: true,
      news: [],
      economic: [
        classifyEconomicEvent(
          economic({
            eventName: 'US CPI',
            scheduledAt: new Date(NOW.getTime() + 8 * 60 * 60 * 1000),
          }),
        ),
      ],
      market: calmMarket(),
    });
    expect(risk.riskLevel).toBe('ELEVATED');
    expect(risk.dominantCategory).toBe('MACRO');
    expect(risk.upcomingMacroEventCount).toBe(1);
    expect(risk.reasons).toContain(
      'A major economic announcement is due soon.',
    );
    expect(risk.reasons.join(' ')).not.toMatch(/crash/i);
  });

  it('does not treat HIGH from one weak source', () => {
    const risk = snapshot([
      news({
        headline: 'SEC files lawsuit against a crypto lending firm',
        summary: 'A regulatory lawsuit was announced.',
        sourceName: 'Unknown Blog',
      }),
    ]);
    expect(risk.riskLevel).not.toBe('HIGH');
    expect(['ELEVATED', 'NORMAL']).toContain(risk.riskLevel);
  });

  it('classifies HIGH when severe news is confirmed by market reaction', () => {
    const risk = calculateExternalRiskSnapshot({
      now: NOW,
      lastSuccessfulFetchAt: NOW,
      sourceHealthy: true,
      news: [
        classifyNews(
          news({
            headline: 'Major crypto exchange collapse after insolvency',
            summary: 'A large bitcoin exchange failed and halted withdrawals.',
          }),
        ),
      ],
      economic: [],
      market: unstableMarket(),
    });
    expect(risk.riskLevel).toBe('HIGH');
    expect(risk.marketReactionConfirmed).toBe(true);
  });

  it('uses multiple independent sources as HIGH confirmation', () => {
    const headline = 'Major crypto exchange collapse after insolvency';
    const risk = snapshot([
      news({
        headline,
        summary: 'A large bitcoin exchange failed.',
        sourceName: 'Reuters',
        externalId: 'r1',
      }),
      news({
        headline,
        summary: 'A large bitcoin exchange failed.',
        sourceName: 'Bloomberg',
        externalId: 'b1',
      }),
    ]);
    expect(risk.independentSourceCount).toBe(2);
    expect(risk.riskLevel).toBe('HIGH');
  });

  it('deduplicates republished headlines across feeds', () => {
    const headline = 'New digital-asset regulation was announced';
    const clusters = clusterNews([
      classifyNews(news({ headline, sourceName: 'Reuters', externalId: '1' })),
      classifyNews(
        news({
          headline: 'New digital-asset regulation was announced',
          sourceName: 'Yahoo Finance',
          externalId: '2',
        }),
      ),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].independentSourceCount).toBe(2);
  });

  it('normalizes headlines for duplicate detection', () => {
    expect(normalizeHeadline('SEC Files Lawsuit!!!')).toBe(
      normalizeHeadline('sec files lawsuit'),
    );
  });

  it('marks provider unavailable without assuming LOW risk', () => {
    const risk = emptyExternalRisk(NOW);
    expect(risk.newsDataStatus).toBe('UNAVAILABLE');
    expect(risk.riskLevel).not.toBe('LOW');
    expect(risk.reasons[0]).toMatch(/unavailable/i);
    const calculated = calculateExternalRiskSnapshot({
      now: NOW,
      lastSuccessfulFetchAt: null,
      sourceHealthy: false,
      news: [],
      economic: [],
      market: null,
    });
    expect(calculated.newsDataStatus).toBe('UNAVAILABLE');
    expect(calculated.riskLevel).not.toBe('LOW');
    const modified = applyExternalRiskModifier(
      baseDecision('BUY_MORE', '30.00'),
      risk,
    );
    expect(modified.action).toBe('BUY_MORE');
    expect(modified.modifiedByExternalRisk).toBe(false);
  });

  it('does not modify the decision when data is stale', () => {
    const stale = {
      ...snapshot([]),
      newsDataStatus: 'STALE' as const,
      riskLevel: 'HIGH' as const,
    };
    expect(
      newsDataStatus(new Date(NOW.getTime() - 3 * 60 * 60 * 1000), NOW),
    ).toBe('STALE');
    const modified = applyExternalRiskModifier(
      baseDecision('BUY_MORE', '30.00'),
      stale,
    );
    expect(modified.action).toBe('BUY_MORE');
    expect(modified.modifiedByExternalRisk).toBe(false);
  });

  it('downgrades Phase 5 BUY MORE + HIGH to WAIT', () => {
    const risk = {
      ...snapshot([]),
      riskLevel: 'HIGH' as const,
      newsDataStatus: 'FRESH' as const,
    };
    const modified = applyExternalRiskModifier(
      baseDecision('BUY_MORE', '30.00'),
      risk,
    );
    expect(modified.action).toBe('WAIT');
    expect(modified.suggestedAmountMyr).toBeNull();
    expect(modified.modifiedByExternalRisk).toBe(true);
  });

  it('downgrades Phase 5 BUY MORE + ELEVATED to BUY SMALL', () => {
    const risk = {
      ...snapshot([]),
      riskLevel: 'ELEVATED' as const,
      upcomingMacroEventCount: 1,
      newsDataStatus: 'FRESH' as const,
    };
    const modified = applyExternalRiskModifier(
      baseDecision('BUY_MORE', '30.00'),
      risk,
    );
    expect(modified.action).toBe('BUY_SMALL');
    expect(Number(modified.suggestedAmountMyr)).toBeLessThanOrEqual(30);
    expect(modified.modifiedByExternalRisk).toBe(true);
  });

  it('downgrades Phase 5 BUY SMALL + HIGH or ELEVATED to WAIT', () => {
    const small = baseDecision('BUY_SMALL', '20.00');
    expect(
      applyExternalRiskModifier(small, {
        ...snapshot([]),
        riskLevel: 'HIGH',
        newsDataStatus: 'FRESH',
      }).action,
    ).toBe('WAIT');
    expect(
      applyExternalRiskModifier(small, {
        ...snapshot([]),
        riskLevel: 'ELEVATED',
        newsDataStatus: 'FRESH',
      }).action,
    ).toBe('WAIT');
  });

  it('never upgrades WAIT or HOLD', () => {
    const high = {
      ...snapshot([]),
      riskLevel: 'LOW' as const,
      newsDataStatus: 'FRESH' as const,
    };
    expect(
      applyExternalRiskModifier(baseDecision('WAIT', null), high).action,
    ).toBe('WAIT');
    expect(
      applyExternalRiskModifier(baseDecision('HOLD', null), high).action,
    ).toBe('HOLD');
  });

  it('leaves BLOCKED unchanged', () => {
    const blocked = {
      ...baseDecision('WAIT', null),
      action: 'BLOCKED' as const,
      displayAction: 'BLOCKED',
    };
    const modified = applyExternalRiskModifier(blocked, {
      ...snapshot([]),
      riskLevel: 'HIGH',
      newsDataStatus: 'FRESH',
    });
    expect(modified.action).toBe('BLOCKED');
    expect(modified.modifiedByExternalRisk).toBe(false);
  });

  it('leaves STOP BUYING THIS MONTH unchanged', () => {
    const stop = baseDecision('STOP_BUYING_THIS_MONTH', null);
    const modified = applyExternalRiskModifier(stop, {
      ...snapshot([]),
      riskLevel: 'HIGH',
      newsDataStatus: 'FRESH',
    });
    expect(modified.action).toBe('STOP_BUYING_THIS_MONTH');
    expect(modified.modifiedByExternalRisk).toBe(false);
  });

  it('never increases suggested amount and keeps the Phase 3 cap', () => {
    const base = evaluateBtcBuyDecision({
      accountingStatus: 'READY',
      currentBtcPriceMyr: '290000',
      averageBuyPriceMyr: '326000',
      monthlyBudgetMyr: '100',
      monthlyUsedMyr: '90',
      monthlyRemainingMyr: '10',
      maxAllowedNewSpendMyr: '10',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '50',
      lunoMyrAvailableMyr: '64.37',
      actedZones: ['FIRST_BUY_ZONE'],
      remainingNormalBuyMyr: '0',
      remainingDipReserveMyr: '10',
    });
    expect(base.action).toBe('BUY_MORE');
    const modified = applyExternalRiskModifier(base, {
      ...snapshot([]),
      riskLevel: 'ELEVATED',
      newsDataStatus: 'FRESH',
    });
    expect(Number(modified.suggestedAmountMyr ?? '0')).toBeLessThanOrEqual(
      Number(base.suggestedAmountMyr),
    );
    expect(Number(modified.suggestedAmountMyr ?? '0')).toBeLessThanOrEqual(10);
  });

  it('does not reopen an already acted zone', () => {
    const base = evaluateBtcBuyDecision({
      accountingStatus: 'READY',
      currentBtcPriceMyr: '309000',
      averageBuyPriceMyr: '326000',
      monthlyBudgetMyr: '100',
      monthlyUsedMyr: '20',
      monthlyRemainingMyr: '80',
      maxAllowedNewSpendMyr: '80',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '50',
      lunoMyrAvailableMyr: '64.37',
      actedZones: ['FIRST_BUY_ZONE'],
      remainingNormalBuyMyr: '30',
      remainingDipReserveMyr: '50',
    });
    expect(base.action).toBe('WAIT');
    const modified = applyExternalRiskModifier(base, {
      ...snapshot([]),
      riskLevel: 'LOW',
      newsDataStatus: 'FRESH',
    });
    expect(modified.action).toBe('WAIT');
    expect(modified.modifiedByExternalRisk).toBe(false);
  });

  it('keeps source metadata on classified news', () => {
    const classified = classifyNews(
      news({
        headline: 'New digital-asset regulation was announced',
        sourceName: 'Reuters',
        sourceUrl: 'https://www.reuters.com/markets/regulation',
      }),
    );
    expect(classified.sourceName).toBe('Reuters');
    expect(classified.sourceUrl).toContain('reuters.com');
    expect(classified.category).toBe('REGULATION');
    expect(classified.raw).toBeDefined();
  });

  it('does not turn geopolitical headlines into partisan wording', () => {
    const classified = classifyNews(
      news({
        headline:
          'An election-related policy announcement created market uncertainty',
        summary:
          'A new digital-asset regulation was announced after the election.',
      }),
    );
    expect(classified.category).toBe('GEOPOLITICAL');
    const joined = `${classified.headline} ${classified.summary}`;
    expect(joined).not.toMatch(/bad for crypto/i);
    expect(joined).not.toMatch(/good for bitcoin/i);
  });
});
