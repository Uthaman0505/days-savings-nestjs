/**
 * Phase 6 — news & economy risk engine (modifier only).
 *
 * Pipeline: Phase 3 money caps → Phase 4 base action → Phase 5 market
 * modifier → this Phase 6 overlay → user-facing final decision.
 *
 * Integration: wrap the Phase 5 result from LunoBtcMarketService.getFinalDecision.
 * This file must not change Phase 4/5 formulas.
 *
 * Scoring (transparent integer weights, capped at 100):
 *   max news severity: LOW 10, MEDIUM 25, HIGH 45, CRITICAL 70
 *   relevance ≥70: +10; relevance ≥40: +5
 *   published <6h: +10; <24h: +5
 *   independent confirming sources: 2 → +10; ≥3 → +15
 *   market reaction confirmed: +15
 *   upcoming high-importance macro in lookahead: +25
 *
 * HIGH requires score ≥70 AND at least one confirmation:
 *   market reaction, ≥2 independent sources, or a CRITICAL event.
 * Score ≥70 without confirmation stays ELEVATED.
 *
 * Positive headlines never create a BUY and never reduce risk.
 */
import { compareDecimal, subtractDecimalStrings } from '../luno-decimal';
import {
  capSuggestedAmount,
  displayActionFor,
  FIRST_BUY_FRACTION,
  topUpNeededMyr,
  type BuyDecision,
} from './luno-btc-decision';
import { actionRiskRank } from './luno-btc-market';
import type {
  LunoBtcNewsCategory,
  LunoBtcNewsSeverity,
  LunoBtcNewsSentiment,
} from '../entities/luno-btc-news-event.entity';
import type { LunoBtcEconomicCategory } from '../entities/luno-btc-economic-event.entity';
import type {
  LunoBtcExternalRiskConfidence,
  LunoBtcExternalRiskLevel,
  LunoBtcNewsDataStatus,
  LunoBtcNewsSourceHealth,
} from '../entities/luno-btc-news-risk-snapshot.entity';
import type { MarketSnapshotView } from './luno-btc-market';
import type {
  ProviderEconomicItem,
  ProviderNewsItem,
} from '../news/news-provider';
import {
  DEFAULT_MACRO_LOOKAHEAD_MS,
  NEWS_DEDUPE_WINDOW_MS,
  NEWS_FRESH_MAX_AGE_MS,
  NEWS_HIGH_RELEVANCE,
  NEWS_RECENCY_DAY_MS,
  NEWS_RECENCY_FRESH_MS,
  NEWS_RELEVANCE_MIN,
  NEWS_STALE_MAX_AGE_MS,
} from '../luno-news.constants';

export const UNAVAILABLE_EXTERNAL_RISK_REASON =
  'External risk data is currently unavailable. Your BTC decision has not been adjusted.';

export type ClassifiedNewsEvent = ProviderNewsItem & {
  normalizedHeadline: string;
  category: LunoBtcNewsCategory;
  relevanceScore: number;
  severity: LunoBtcNewsSeverity;
  sentimentDirection: LunoBtcNewsSentiment;
  btcSpecific: boolean;
  macroSpecific: boolean;
};

export type ClassifiedEconomicEvent = ProviderEconomicItem & {
  category: LunoBtcEconomicCategory;
};

export type NewsCluster = {
  items: ClassifiedNewsEvent[];
  normalizedHeadline: string;
  category: LunoBtcNewsCategory;
  severity: LunoBtcNewsSeverity;
  relevanceScore: number;
  independentSourceCount: number;
  latestPublishedAt: Date;
};

export type UpcomingMacroEvent = ClassifiedEconomicEvent & {
  hoursUntil: number;
};

export type ExternalRiskSnapshotInput = {
  now: Date;
  lastSuccessfulFetchAt: Date | null;
  sourceHealthy: boolean;
  news: ClassifiedNewsEvent[];
  economic: ClassifiedEconomicEvent[];
  market: MarketSnapshotView | null;
  lookaheadMs?: number;
};

export type ExternalRiskSnapshotView = {
  calculatedAt: Date;
  riskLevel: LunoBtcExternalRiskLevel;
  dominantCategory: LunoBtcNewsCategory;
  confidence: LunoBtcExternalRiskConfidence;
  relevantEventCount: number;
  highSeverityEventCount: number;
  upcomingMacroEventCount: number;
  independentSourceCount: number;
  marketReactionConfirmed: boolean;
  riskScore: string;
  reasons: string[];
  sourceHealth: LunoBtcNewsSourceHealth;
  newsDataStatus: LunoBtcNewsDataStatus;
  latestSourceEventAt: Date | null;
  lastSuccessfulFetchAt: Date | null;
};

const SEVERITY_POINTS: Record<LunoBtcNewsSeverity, number> = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 45,
  CRITICAL: 70,
};

const SEVERITY_RANK: Record<LunoBtcNewsSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const MAJOR_MACRO_COUNTRIES = new Set([
  'US',
  'EU',
  'GB',
  'UK',
  'CN',
  'JP',
  'DE',
]);

export function newsDataStatus(
  lastSuccessfulFetchAt: Date | null,
  now: Date,
): LunoBtcNewsDataStatus {
  if (!lastSuccessfulFetchAt) {
    return 'UNAVAILABLE';
  }
  const age = now.getTime() - lastSuccessfulFetchAt.getTime();
  if (age <= NEWS_FRESH_MAX_AGE_MS) {
    return 'FRESH';
  }
  if (age <= NEWS_STALE_MAX_AGE_MS) {
    return 'STALE';
  }
  return 'UNAVAILABLE';
}

export function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyNews(item: ProviderNewsItem): ClassifiedNewsEvent {
  const text = `${item.headline} ${item.summary ?? ''}`.toLowerCase();
  const category = classifyNewsCategory(text);
  const btcSpecific = /\b(bitcoin|btc|xbt)\b/.test(text);
  const macroSpecific = category === 'MACRO';
  const severity = classifyNewsSeverity(text, category);
  const relevanceScore = newsRelevance(text, category, btcSpecific);
  return {
    ...item,
    normalizedHeadline: normalizeHeadline(item.headline),
    category,
    relevanceScore,
    severity,
    sentimentDirection: classifySentiment(text),
    btcSpecific,
    macroSpecific,
  };
}

export function classifyEconomicEvent(
  item: ProviderEconomicItem,
): ClassifiedEconomicEvent {
  return {
    ...item,
    category: classifyEconomicCategory(item.eventName),
  };
}

export function clusterNews(
  items: ClassifiedNewsEvent[],
  windowMs = NEWS_DEDUPE_WINDOW_MS,
): NewsCluster[] {
  const relevant = items
    .filter((item) => item.normalizedHeadline && isRelevantNews(item))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const clusters: NewsCluster[] = [];
  for (const item of relevant) {
    const existing = clusters.find(
      (cluster) =>
        cluster.normalizedHeadline === item.normalizedHeadline &&
        Math.abs(
          cluster.latestPublishedAt.getTime() - item.publishedAt.getTime(),
        ) <= windowMs,
    );
    if (existing) {
      existing.items.push(item);
      if (item.publishedAt.getTime() > existing.latestPublishedAt.getTime()) {
        existing.latestPublishedAt = item.publishedAt;
      }
      if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = item.severity;
      }
      existing.relevanceScore = Math.max(
        existing.relevanceScore,
        item.relevanceScore,
      );
      existing.independentSourceCount = uniqueSources(existing.items);
      continue;
    }
    clusters.push({
      items: [item],
      normalizedHeadline: item.normalizedHeadline,
      category: item.category,
      severity: item.severity,
      relevanceScore: item.relevanceScore,
      independentSourceCount: 1,
      latestPublishedAt: item.publishedAt,
    });
  }
  return clusters;
}

export function upcomingHighImportanceMacros(
  events: ClassifiedEconomicEvent[],
  now: Date,
  lookaheadMs = DEFAULT_MACRO_LOOKAHEAD_MS,
): UpcomingMacroEvent[] {
  return events
    .filter((event) => isWatchableMacro(event, now, lookaheadMs))
    .map((event) => ({
      ...event,
      hoursUntil: Math.max(
        0,
        (event.scheduledAt.getTime() - now.getTime()) / (60 * 60 * 1000),
      ),
    }))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function marketReactionConfirmed(
  market: MarketSnapshotView | null,
  hasMaterialNews: boolean,
): boolean {
  if (!hasMaterialNews || !market || market.marketContextStatus !== 'FRESH') {
    return false;
  }
  const drawdownConfirmed =
    market.drawdownFromRecentHighPct != null &&
    compareDecimal(market.drawdownFromRecentHighPct, '-5') <= 0;
  return (
    market.stability === 'UNSTABLE' ||
    market.buyingCondition === 'RISKY' ||
    drawdownConfirmed
  );
}

export function calculateExternalRiskSnapshot(
  input: ExternalRiskSnapshotInput,
): ExternalRiskSnapshotView {
  const status = newsDataStatus(input.lastSuccessfulFetchAt, input.now);
  const sourceHealth: LunoBtcNewsSourceHealth = !input.sourceHealthy
    ? 'UNAVAILABLE'
    : status === 'FRESH'
      ? 'OK'
      : 'DEGRADED';
  const clusters = clusterNews(input.news);
  const upcoming = upcomingHighImportanceMacros(
    input.economic,
    input.now,
    input.lookaheadMs,
  );
  const relevantClusters = clusters.filter(
    (cluster) => cluster.relevanceScore >= NEWS_RELEVANCE_MIN,
  );
  const highSeverity = relevantClusters.filter(
    (cluster) => cluster.severity === 'HIGH' || cluster.severity === 'CRITICAL',
  );
  const independentSourceCount = relevantClusters.reduce(
    (max, cluster) => Math.max(max, cluster.independentSourceCount),
    0,
  );
  const material =
    highSeverity.length > 0 ||
    upcoming.length > 0 ||
    relevantClusters.some((cluster) => cluster.severity === 'CRITICAL');
  const reaction = marketReactionConfirmed(input.market, material);
  const latestSourceEventAt = latestEventAt(input.news, input.economic);
  const score = riskScore({
    clusters: relevantClusters,
    upcomingCount: upcoming.length,
    independentSourceCount,
    reaction,
    now: input.now,
  });
  const hasCritical = relevantClusters.some(
    (cluster) => cluster.severity === 'CRITICAL',
  );
  const confirmedHigh =
    score >= 70 && (reaction || independentSourceCount >= 2 || hasCritical);
  let riskLevel = resolveRiskLevel({
    score,
    upcomingCount: upcoming.length,
    confirmedHigh,
  });
  if (status === 'UNAVAILABLE') {
    riskLevel = 'NORMAL';
  }
  const dominantCategory = dominantCategoryOf(relevantClusters, upcoming);
  const reasons = buildReasons({
    status,
    riskLevel,
    upcoming,
    reaction,
    clusters: relevantClusters,
    sourceHealth,
  });
  return {
    calculatedAt: input.now,
    riskLevel,
    dominantCategory,
    confidence: resolveConfidence(
      status,
      relevantClusters.length,
      upcoming.length,
    ),
    relevantEventCount: relevantClusters.length,
    highSeverityEventCount: highSeverity.length,
    upcomingMacroEventCount: upcoming.length,
    independentSourceCount,
    marketReactionConfirmed: reaction,
    riskScore: String(score),
    reasons,
    sourceHealth,
    newsDataStatus: status,
    latestSourceEventAt,
    lastSuccessfulFetchAt: input.lastSuccessfulFetchAt,
  };
}

export function applyExternalRiskModifier(
  phase5: BuyDecision,
  risk: ExternalRiskSnapshotView | null,
): BuyDecision & { modifiedByExternalRisk: boolean } {
  if (
    !risk ||
    risk.newsDataStatus !== 'FRESH' ||
    phase5.action === 'STOP_BUYING_THIS_MONTH' ||
    phase5.action === 'BLOCKED' ||
    phase5.action === 'WAIT' ||
    phase5.action === 'HOLD'
  ) {
    return { ...phase5, modifiedByExternalRisk: false };
  }
  if (risk.riskLevel === 'LOW' || risk.riskLevel === 'NORMAL') {
    return { ...phase5, modifiedByExternalRisk: false };
  }
  if (phase5.action === 'BUY_MORE' && risk.riskLevel === 'ELEVATED') {
    return buySmallFromExternal(phase5, risk);
  }
  if (
    (phase5.action === 'BUY_MORE' && risk.riskLevel === 'HIGH') ||
    (phase5.action === 'BUY_SMALL' &&
      (risk.riskLevel === 'ELEVATED' || risk.riskLevel === 'HIGH'))
  ) {
    return waitFromExternal(phase5, risk);
  }
  return { ...phase5, modifiedByExternalRisk: false };
}

function buySmallFromExternal(
  base: BuyDecision,
  risk: ExternalRiskSnapshotView,
): BuyDecision & { modifiedByExternalRisk: boolean } {
  if (base.monthlyBudgetMyr == null || base.monthlyRemainingMyr == null) {
    return waitFromExternal(base, risk);
  }
  let suggested = capSuggestedAmount({
    monthlyBudgetMyr: base.monthlyBudgetMyr,
    fraction: FIRST_BUY_FRACTION,
    remainingMyr: base.monthlyRemainingMyr,
    maxAllowedNewSpendMyr: base.maxAllowedNewSpendMyr,
    sleeveMyr: null,
  });
  if (
    suggested != null &&
    base.suggestedAmountMyr != null &&
    compareDecimal(suggested, base.suggestedAmountMyr) > 0
  ) {
    suggested = base.suggestedAmountMyr;
  }
  if (suggested == null || compareDecimal(suggested, '0') <= 0) {
    return waitFromExternal(base, risk);
  }
  if (actionRiskRank('BUY_SMALL') > actionRiskRank(base.action)) {
    return { ...base, modifiedByExternalRisk: false };
  }
  const expected = subtractDecimalStrings(base.monthlyRemainingMyr, suggested);
  return {
    ...base,
    action: 'BUY_SMALL',
    displayAction: displayActionFor('BUY_SMALL'),
    suggestedAmountMyr: suggested,
    expectedRemainingAfterMyr: expected,
    topUpNeededMyr: topUpNeededMyr(suggested, base.lunoMyrAvailableMyr),
    reason: [...base.reason, externalWaitOrReduceReason(risk, 'reduce')],
    modifiedByExternalRisk: true,
  };
}

function waitFromExternal(
  base: BuyDecision,
  risk: ExternalRiskSnapshotView,
): BuyDecision & { modifiedByExternalRisk: boolean } {
  return {
    ...base,
    action: 'WAIT',
    displayAction: displayActionFor('WAIT'),
    suggestedAmountMyr: null,
    expectedRemainingAfterMyr: base.monthlyRemainingMyr,
    topUpNeededMyr: '0.00',
    source: null,
    reason: [...base.reason, externalWaitOrReduceReason(risk, 'wait')],
    modifiedByExternalRisk: true,
  };
}

function externalWaitOrReduceReason(
  risk: ExternalRiskSnapshotView,
  mode: 'wait' | 'reduce',
): string {
  if (risk.upcomingMacroEventCount > 0) {
    return mode === 'wait'
      ? 'A major economic event is due soon, so the app is waiting.'
      : 'A major economic event is due soon, so the suggested amount was reduced.';
  }
  if (risk.riskLevel === 'HIGH') {
    return 'External risk is high, so no buy is suggested now.';
  }
  return mode === 'wait'
    ? 'External risk is elevated, so no buy is suggested now.'
    : 'External risk is elevated, so the suggested amount was reduced.';
}

function classifyNewsCategory(text: string): LunoBtcNewsCategory {
  if (
    /\b(bank failure|bank collapse|svb|silicon valley bank|credit suisse|fdic|banking crisis|bank run)\b/.test(
      text,
    )
  ) {
    return 'BANKING';
  }
  if (
    /\b(war|invasion|sanction|sanctions|missile|geopolitical|conflict|election)\b/.test(
      text,
    )
  ) {
    return 'GEOPOLITICAL';
  }
  if (
    /\b(sec|cftc|esma|mas|ban|bans|lawsuit|regulation|regulatory|compliance|licensing)\b/.test(
      text,
    )
  ) {
    return 'REGULATION';
  }
  if (
    /\b(etf|blackrock|fidelity|microstrategy|institutional|grayscale)\b/.test(
      text,
    )
  ) {
    return 'INSTITUTIONAL';
  }
  if (
    /\b(war|invasion|sanction|sanctions|missile|geopolitical|conflict|election)\b/.test(
      text,
    )
  ) {
    return 'GEOPOLITICAL';
  }
  if (
    /\b(fed|fomc|ecb|boj|interest rate|rate hike|rate cut|inflation|cpi|pce|unemployment|nonfarm|payroll|gdp|central bank)\b/.test(
      text,
    )
  ) {
    return 'MACRO';
  }
  if (
    /\b(bitcoin|btc|crypto|cryptocurrency|exchange|binance|coinbase|luno|stablecoin)\b/.test(
      text,
    )
  ) {
    return 'CRYPTO';
  }
  return 'NONE';
}

function classifyNewsSeverity(
  text: string,
  category: LunoBtcNewsCategory,
): LunoBtcNewsSeverity {
  if (
    /\b(collapse|insolvent|insolvency|hack|hacked|bankruptcy|failed|failure|ban bitcoin|bitcoin ban)\b/.test(
      text,
    )
  ) {
    return 'CRITICAL';
  }
  if (
    category === 'REGULATION' ||
    category === 'BANKING' ||
    /\b(outage|halt|suspended|probe|investigation|emergency)\b/.test(text)
  ) {
    return 'HIGH';
  }
  if (category === 'NONE') {
    return 'LOW';
  }
  if (category === 'CRYPTO' || category === 'INSTITUTIONAL') {
    return 'LOW';
  }
  if (category === 'MACRO' || category === 'GEOPOLITICAL') {
    return 'MEDIUM';
  }
  return 'MEDIUM';
}

function newsRelevance(
  text: string,
  category: LunoBtcNewsCategory,
  btcSpecific: boolean,
): number {
  if (category === 'NONE' && !btcSpecific) {
    return 0;
  }
  let score = btcSpecific ? 55 : 30;
  if (
    category === 'CRYPTO' ||
    category === 'REGULATION' ||
    category === 'BANKING'
  ) {
    score += 20;
  }
  if (category === 'INSTITUTIONAL' || category === 'MACRO') {
    score += 15;
  }
  if (category === 'GEOPOLITICAL') {
    score += 10;
  }
  if (/\b(bitcoin|btc|etf|fed|cpi|exchange)\b/.test(text)) {
    score += 10;
  }
  return Math.min(100, score);
}

function classifySentiment(text: string): LunoBtcNewsSentiment {
  if (/\b(ban|hack|collapse|crash|lawsuit|failure|outage|probe)\b/.test(text)) {
    return 'NEGATIVE';
  }
  if (/\b(approval|approved|inflow|inflows|launch)\b/.test(text)) {
    return 'POSITIVE';
  }
  return 'NEUTRAL';
}

export function classifyEconomicCategory(
  eventName: string,
): LunoBtcEconomicCategory {
  const text = eventName.toLowerCase();
  if (/\bpce\b/.test(text)) {
    return 'PCE';
  }
  if (/\bcpi\b|consumer price|inflation/.test(text)) {
    return 'CPI';
  }
  if (/\bunemployment|nonfarm|non-farm|payroll|employment|nfp/.test(text)) {
    return 'EMPLOYMENT';
  }
  if (/\bgdp\b/.test(text)) {
    return 'GDP';
  }
  if (/\binterest rate|federal funds|rate decision|fomc/.test(text)) {
    return 'INTEREST_RATE';
  }
  if (/\bfed|ecb|boj|central bank|monetary policy/.test(text)) {
    return 'CENTRAL_BANK';
  }
  if (/\bbank/.test(text)) {
    return 'BANKING';
  }
  return 'OTHER';
}

function isRelevantNews(item: ClassifiedNewsEvent): boolean {
  return item.category !== 'NONE' && item.relevanceScore >= NEWS_RELEVANCE_MIN;
}

function uniqueSources(items: ClassifiedNewsEvent[]): number {
  return new Set(items.map((item) => item.sourceName.trim().toLowerCase()))
    .size;
}

function isWatchableMacro(
  event: ClassifiedEconomicEvent,
  now: Date,
  lookaheadMs: number,
): boolean {
  if (event.importance !== 'HIGH') {
    return false;
  }
  if (
    event.category !== 'CPI' &&
    event.category !== 'PCE' &&
    event.category !== 'EMPLOYMENT' &&
    event.category !== 'INTEREST_RATE' &&
    event.category !== 'CENTRAL_BANK'
  ) {
    return false;
  }
  const country = event.country?.toUpperCase() ?? '';
  if (country && !MAJOR_MACRO_COUNTRIES.has(country)) {
    return false;
  }
  const delta = event.scheduledAt.getTime() - now.getTime();
  return delta >= 0 && delta <= lookaheadMs;
}

function riskScore(input: {
  clusters: NewsCluster[];
  upcomingCount: number;
  independentSourceCount: number;
  reaction: boolean;
  now: Date;
}): number {
  let score = 0;
  const top = input.clusters.reduce<NewsCluster | null>((best, cluster) => {
    if (
      !best ||
      SEVERITY_RANK[cluster.severity] > SEVERITY_RANK[best.severity]
    ) {
      return cluster;
    }
    return best;
  }, null);
  if (top) {
    score += SEVERITY_POINTS[top.severity];
    if (top.relevanceScore >= NEWS_HIGH_RELEVANCE) {
      score += 10;
    } else if (top.relevanceScore >= NEWS_RELEVANCE_MIN) {
      score += 5;
    }
    const age = input.now.getTime() - top.latestPublishedAt.getTime();
    if (age <= NEWS_RECENCY_FRESH_MS) {
      score += 10;
    } else if (age <= NEWS_RECENCY_DAY_MS) {
      score += 5;
    }
  }
  if (input.independentSourceCount >= 3) {
    score += 15;
  } else if (input.independentSourceCount >= 2) {
    score += 10;
  }
  if (input.reaction) {
    score += 15;
  }
  if (input.upcomingCount > 0) {
    score += 25;
  }
  return Math.min(100, score);
}

function resolveRiskLevel(input: {
  score: number;
  upcomingCount: number;
  confirmedHigh: boolean;
}): LunoBtcExternalRiskLevel {
  if (input.confirmedHigh) {
    return 'HIGH';
  }
  if (input.score >= 40 || input.upcomingCount > 0 || input.score >= 70) {
    return 'ELEVATED';
  }
  if (input.score >= 20) {
    return 'NORMAL';
  }
  return 'LOW';
}

function resolveConfidence(
  status: LunoBtcNewsDataStatus,
  relevantCount: number,
  upcomingCount: number,
): LunoBtcExternalRiskConfidence {
  if (status !== 'FRESH') {
    return 'LOW';
  }
  if (relevantCount >= 2 || upcomingCount > 0) {
    return 'HIGH';
  }
  if (relevantCount === 1) {
    return 'MEDIUM';
  }
  return 'MEDIUM';
}

function dominantCategoryOf(
  clusters: NewsCluster[],
  upcoming: UpcomingMacroEvent[],
): LunoBtcNewsCategory {
  if (upcoming.length > 0 && clusters.length === 0) {
    return 'MACRO';
  }
  const counts = new Map<LunoBtcNewsCategory, number>();
  for (const cluster of clusters) {
    counts.set(cluster.category, (counts.get(cluster.category) ?? 0) + 1);
  }
  if (upcoming.length > 0) {
    counts.set('MACRO', (counts.get('MACRO') ?? 0) + upcoming.length);
  }
  let best: LunoBtcNewsCategory = 'NONE';
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

function latestEventAt(
  news: ClassifiedNewsEvent[],
  economic: ClassifiedEconomicEvent[],
): Date | null {
  const times = [
    ...news.map((item) => item.publishedAt.getTime()),
    ...economic.map((item) => item.scheduledAt.getTime()),
  ].filter((value) => Number.isFinite(value));
  if (times.length === 0) {
    return null;
  }
  return new Date(Math.max(...times));
}

function buildReasons(input: {
  status: LunoBtcNewsDataStatus;
  riskLevel: LunoBtcExternalRiskLevel;
  upcoming: UpcomingMacroEvent[];
  reaction: boolean;
  clusters: NewsCluster[];
  sourceHealth: LunoBtcNewsSourceHealth;
}): string[] {
  if (input.status === 'UNAVAILABLE' || input.sourceHealth === 'UNAVAILABLE') {
    return [UNAVAILABLE_EXTERNAL_RISK_REASON];
  }
  const reasons: string[] = [];
  if (input.upcoming.length > 0) {
    reasons.push('A major economic announcement is due soon.');
  }
  const top = input.clusters[0];
  if (top && (top.severity === 'HIGH' || top.severity === 'CRITICAL')) {
    reasons.push(categoryReason(top.category));
  }
  if (input.reaction) {
    reasons.push('BTC market movement currently confirms extra caution.');
  } else if (input.clusters.length > 0 || input.upcoming.length > 0) {
    reasons.push('BTC market movement is currently normal.');
  }
  if (reasons.length === 0) {
    if (input.riskLevel === 'LOW') {
      reasons.push('There is little meaningful BTC-relevant news right now.');
    } else {
      reasons.push('Ordinary market news flow. No strong external risk.');
    }
  }
  if (input.status === 'STALE') {
    reasons.push('Showing the latest available external-risk reading.');
  }
  return reasons;
}

function categoryReason(category: LunoBtcNewsCategory): string {
  if (category === 'REGULATION') {
    return 'A major crypto regulation update was reported.';
  }
  if (category === 'BANKING') {
    return 'A banking-stress event was reported.';
  }
  if (category === 'CRYPTO') {
    return 'A major crypto-market event was reported.';
  }
  if (category === 'INSTITUTIONAL') {
    return 'A major institutional crypto development was reported.';
  }
  if (category === 'GEOPOLITICAL') {
    return 'A geopolitical event created market uncertainty.';
  }
  if (category === 'MACRO') {
    return 'A major economic announcement is in the news.';
  }
  return 'Relevant external news was reported.';
}

export function refreshSnapshotFreshness(
  snapshot: ExternalRiskSnapshotView,
  now: Date,
): ExternalRiskSnapshotView {
  const status = newsDataStatus(snapshot.lastSuccessfulFetchAt, now);
  if (status === snapshot.newsDataStatus) {
    return snapshot;
  }
  return {
    ...snapshot,
    newsDataStatus: status,
    sourceHealth:
      status === 'FRESH'
        ? 'OK'
        : status === 'STALE'
          ? 'DEGRADED'
          : 'UNAVAILABLE',
    confidence: status === 'FRESH' ? snapshot.confidence : 'LOW',
    reasons:
      status === 'UNAVAILABLE'
        ? [UNAVAILABLE_EXTERNAL_RISK_REASON]
        : status === 'STALE' &&
            !snapshot.reasons.includes(
              'Showing the latest available external-risk reading.',
            )
          ? [
              ...snapshot.reasons,
              'Showing the latest available external-risk reading.',
            ]
          : snapshot.reasons,
  };
}

export function emptyExternalRisk(
  now: Date,
  lastSuccessfulFetchAt: Date | null = null,
): ExternalRiskSnapshotView {
  return {
    calculatedAt: now,
    riskLevel: 'NORMAL',
    dominantCategory: 'NONE',
    confidence: 'LOW',
    relevantEventCount: 0,
    highSeverityEventCount: 0,
    upcomingMacroEventCount: 0,
    independentSourceCount: 0,
    marketReactionConfirmed: false,
    riskScore: '0',
    reasons: [UNAVAILABLE_EXTERNAL_RISK_REASON],
    sourceHealth: 'UNAVAILABLE',
    newsDataStatus: 'UNAVAILABLE',
    latestSourceEventAt: null,
    lastSuccessfulFetchAt,
  };
}
