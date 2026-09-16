import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  applyExternalRiskModifier,
  calculateExternalRiskSnapshot,
  classifyEconomicEvent,
  classifyNews,
  emptyExternalRisk,
  refreshSnapshotFreshness,
  type ClassifiedEconomicEvent,
  type ClassifiedNewsEvent,
  type ExternalRiskSnapshotView,
} from './accounting/luno-btc-external-risk';
import { displayActionFor } from './accounting/luno-btc-decision';
import { roundMyr } from './accounting/luno-btc-formulas';
import type { LunoBtcFinalDecisionView } from './luno-btc-market.service';
import { LunoBtcMarketService } from './luno-btc-market.service';
import { LunoBtcNewsEvent } from './entities/luno-btc-news-event.entity';
import { LunoBtcEconomicEvent } from './entities/luno-btc-economic-event.entity';
import { LunoBtcNewsRiskSnapshot } from './entities/luno-btc-news-risk-snapshot.entity';
import {
  ECONOMIC_PROVIDER_TOKEN,
  NEWS_PROVIDER_TOKEN,
  DEFAULT_MACRO_LOOKAHEAD_MS,
  NEWS_RELEVANCE_MIN,
} from './luno-news.constants';
import { LunoNewsConfigService } from './luno-news-config.service';
import type {
  EconomicCalendarProvider,
  NewsProvider,
} from './news/news-provider';

export type LunoBtcExternalRiskView = {
  status: ExternalRiskSnapshotView['newsDataStatus'];
  riskLevel: ExternalRiskSnapshotView['riskLevel'];
  dominantCategory: ExternalRiskSnapshotView['dominantCategory'];
  confidence: ExternalRiskSnapshotView['confidence'];
  marketReactionConfirmed: boolean;
  reasons: string[];
  relevantEventCount: number;
  highSeverityEventCount: number;
  upcomingMacroEventCount: number;
  sourceHealth: ExternalRiskSnapshotView['sourceHealth'];
  latestSourceEventAt: string | null;
  lastSuccessfulFetchAt: string | null;
  calculatedAt: string;
};

export type LunoBtcExternalRiskEventView = {
  kind: 'NEWS' | 'ECONOMIC';
  headline: string;
  sourceName: string | null;
  sourceUrl: string | null;
  category: string;
  publishedOrDueAt: string;
  importanceOrSeverity: string;
  country: string | null;
};

export type LunoBtcCombinedDecisionView = LunoBtcFinalDecisionView & {
  marketAdjustedDecision: {
    action: LunoBtcFinalDecisionView['baseDecision']['action'];
    displayAction: string;
    suggestedAmountMyr: string | null;
    modifiedByMarketContext: boolean;
  };
  externalRisk: LunoBtcExternalRiskView;
  finalDecision: LunoBtcFinalDecisionView['finalDecision'] & {
    modifiedByExternalRisk: boolean;
  };
};

@Injectable()
export class LunoBtcExternalRiskService {
  private readonly logger = new Logger(LunoBtcExternalRiskService.name);

  constructor(
    @InjectRepository(LunoBtcNewsEvent)
    private readonly newsEvents: Repository<LunoBtcNewsEvent>,
    @InjectRepository(LunoBtcEconomicEvent)
    private readonly economicEvents: Repository<LunoBtcEconomicEvent>,
    @InjectRepository(LunoBtcNewsRiskSnapshot)
    private readonly snapshots: Repository<LunoBtcNewsRiskSnapshot>,
    @Inject(NEWS_PROVIDER_TOKEN)
    private readonly newsProvider: NewsProvider,
    @Inject(ECONOMIC_PROVIDER_TOKEN)
    private readonly economicProvider: EconomicCalendarProvider,
    private readonly newsConfig: LunoNewsConfigService,
    private readonly market: LunoBtcMarketService,
  ) {}

  private lastFetchAt: Date | null = null;

  @Cron('30 */45 * * * *')
  async scheduledNewsSync(): Promise<void> {
    try {
      await this.syncExternalRisk();
      await this.recalculateExternalRisk();
    } catch (error) {
      this.logger.warn(
        `News sync skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  @Cron('10 20 */3 * * *')
  async scheduledEconomicSync(): Promise<void> {
    try {
      await this.syncEconomicEvents();
      await this.recalculateExternalRisk();
    } catch (error) {
      this.logger.warn(
        `Economic calendar sync skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async syncExternalRisk(): Promise<{ news: number; economic: number }> {
    const news = await this.syncNewsEvents();
    const economic = await this.syncEconomicEvents();
    return { news, economic };
  }

  async syncNewsEvents(): Promise<number> {
    const rows = await this.newsProvider.fetchLatestNews(new Date());
    const fetchedAt = new Date();
    let upserted = 0;
    for (const row of rows) {
      const classified = classifyNews(row);
      if (
        classified.category === 'NONE' &&
        classified.relevanceScore < NEWS_RELEVANCE_MIN
      ) {
        continue;
      }
      await this.upsertNews(classified, fetchedAt);
      upserted += 1;
    }
    if (this.newsProvider.name !== 'NONE') {
      this.lastFetchAt = fetchedAt;
    }
    return upserted;
  }

  async syncEconomicEvents(): Promise<number> {
    const rows = await this.economicProvider.fetchEconomicEvents(new Date());
    const fetchedAt = new Date();
    let upserted = 0;
    for (const row of rows) {
      await this.upsertEconomic(classifyEconomicEvent(row), fetchedAt);
      upserted += 1;
    }
    if (this.economicProvider.name !== 'NONE') {
      this.lastFetchAt = fetchedAt;
    }
    return upserted;
  }

  async recalculateExternalRisk(
    now = new Date(),
  ): Promise<ExternalRiskSnapshotView> {
    const lastFetch = await this.resolveLastFetchAt();
    const sourceHealthy =
      lastFetch != null &&
      (this.newsProvider.name !== 'NONE' ||
        this.economicProvider.name !== 'NONE');
    const [newsRows, economicRows] = await Promise.all([
      this.newsEvents.find({
        order: { publishedAt: 'DESC' },
        take: 80,
      }),
      this.economicEvents.find({
        order: { scheduledAt: 'DESC' },
        take: 80,
      }),
    ]);
    const market = await this.market.getLatestBtcMarketSnapshot();
    const snapshot = calculateExternalRiskSnapshot({
      now,
      lastSuccessfulFetchAt: lastFetch,
      sourceHealthy: sourceHealthy || lastFetch != null,
      news: newsRows.map(fromNewsRow),
      economic: economicRows.map(fromEconomicRow),
      market,
      lookaheadMs: this.newsConfig.lookaheadHours * 60 * 60 * 1000,
    });
    await this.snapshots.save(
      this.snapshots.create({
        calculatedAt: snapshot.calculatedAt,
        riskLevel: snapshot.riskLevel,
        dominantCategory: snapshot.dominantCategory,
        confidence: snapshot.confidence,
        relevantEventCount: snapshot.relevantEventCount,
        highSeverityEventCount: snapshot.highSeverityEventCount,
        upcomingMacroEventCount: snapshot.upcomingMacroEventCount,
        independentSourceCount: snapshot.independentSourceCount,
        marketReactionConfirmed: snapshot.marketReactionConfirmed,
        riskScore: snapshot.riskScore,
        reasonJson: snapshot.reasons,
        sourceHealth: snapshot.sourceHealth,
        newsDataStatus: snapshot.newsDataStatus,
        latestSourceEventAt: snapshot.latestSourceEventAt,
        lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt,
      }),
    );
    return snapshot;
  }

  async getExternalRisk(now = new Date()): Promise<LunoBtcExternalRiskView> {
    const snapshot = await this.latestSnapshot(now);
    return this.toRiskView(snapshot);
  }

  async getExternalRiskEvents(
    now = new Date(),
  ): Promise<LunoBtcExternalRiskEventView[]> {
    const [newsRows, economicRows] = await Promise.all([
      this.newsEvents.find({
        order: { publishedAt: 'DESC' },
        take: 40,
      }),
      this.economicEvents.find({
        order: { scheduledAt: 'ASC' },
        take: 40,
      }),
    ]);
    const news = newsRows
      .map(fromNewsRow)
      .filter((row) => isRelevantNewsForDisplay(row, now))
      .slice(0, 8)
      .map((row) => ({
        kind: 'NEWS' as const,
        headline: row.headline,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        category: row.category,
        publishedOrDueAt: row.publishedAt.toISOString(),
        importanceOrSeverity: row.severity,
        country: row.countryOrRegion,
      }));
    const lookahead = this.newsConfig.lookaheadHours * 60 * 60 * 1000;
    const economic = economicRows
      .map(fromEconomicRow)
      .filter((row) => {
        const delta = row.scheduledAt.getTime() - now.getTime();
        return (
          row.importance === 'HIGH' &&
          delta >= -2 * 60 * 60 * 1000 &&
          delta <= Math.max(lookahead, DEFAULT_MACRO_LOOKAHEAD_MS)
        );
      })
      .slice(0, 6)
      .map((row) => ({
        kind: 'ECONOMIC' as const,
        headline: row.eventName,
        sourceName: row.country,
        sourceUrl: row.sourceUrl,
        category: row.category,
        publishedOrDueAt: row.scheduledAt.toISOString(),
        importanceOrSeverity: row.importance,
        country: row.country,
      }));
    return [...economic, ...news].slice(0, 12);
  }

  async getFinalDecision(userId: string): Promise<LunoBtcCombinedDecisionView> {
    const phase5 = await this.market.getFinalDecision(userId);
    const risk = await this.latestSnapshot();
    const modified = applyExternalRiskModifier(phase5.finalDecision, risk);
    return {
      ...phase5,
      marketAdjustedDecision: {
        action: phase5.finalDecision.action,
        displayAction: phase5.finalDecision.displayAction,
        suggestedAmountMyr: phase5.finalDecision.suggestedAmountMyr,
        modifiedByMarketContext: phase5.finalDecision.modifiedByMarketContext,
      },
      externalRisk: this.toRiskView(risk),
      finalDecision: {
        ...phase5.finalDecision,
        ...modified,
        displayAction: displayActionFor(modified.action),
        suggestedAmountMyr: roundMyr(modified.suggestedAmountMyr),
        modifiedByMarketContext: phase5.finalDecision.modifiedByMarketContext,
        modifiedByExternalRisk: modified.modifiedByExternalRisk,
      },
    };
  }

  toRiskView(snapshot: ExternalRiskSnapshotView): LunoBtcExternalRiskView {
    return {
      status: snapshot.newsDataStatus,
      riskLevel: snapshot.riskLevel,
      dominantCategory: snapshot.dominantCategory,
      confidence: snapshot.confidence,
      marketReactionConfirmed: snapshot.marketReactionConfirmed,
      reasons: snapshot.reasons,
      relevantEventCount: snapshot.relevantEventCount,
      highSeverityEventCount: snapshot.highSeverityEventCount,
      upcomingMacroEventCount: snapshot.upcomingMacroEventCount,
      sourceHealth: snapshot.sourceHealth,
      latestSourceEventAt: snapshot.latestSourceEventAt?.toISOString() ?? null,
      lastSuccessfulFetchAt:
        snapshot.lastSuccessfulFetchAt?.toISOString() ?? null,
      calculatedAt: snapshot.calculatedAt.toISOString(),
    };
  }

  private async latestSnapshot(
    now = new Date(),
  ): Promise<ExternalRiskSnapshotView> {
    const latest = await this.snapshots.find({
      order: { calculatedAt: 'DESC' },
      take: 1,
    });
    if (latest[0]) {
      return refreshSnapshotFreshness(fromSnapshotRow(latest[0]), now);
    }
    return emptyExternalRisk(now, await this.resolveLastFetchAt());
  }

  private async resolveLastFetchAt(): Promise<Date | null> {
    if (this.lastFetchAt) {
      return this.lastFetchAt;
    }
    const [news, economic] = await Promise.all([
      this.newsEvents.find({ order: { fetchedAt: 'DESC' }, take: 1 }),
      this.economicEvents.find({ order: { fetchedAt: 'DESC' }, take: 1 }),
    ]);
    const times = [news[0]?.fetchedAt, economic[0]?.fetchedAt].filter(
      (value): value is Date => value instanceof Date,
    );
    if (times.length === 0) {
      return null;
    }
    return times.sort((a, b) => b.getTime() - a.getTime())[0];
  }

  private async upsertNews(
    item: ClassifiedNewsEvent,
    fetchedAt: Date,
  ): Promise<void> {
    const existing = await this.newsEvents.findOne({
      where: { provider: item.provider, externalId: item.externalId },
    });
    const payload = {
      externalId: item.externalId,
      provider: item.provider,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      headline: item.headline,
      summary: item.summary,
      normalizedHeadline: item.normalizedHeadline,
      category: item.category,
      publishedAt: item.publishedAt,
      fetchedAt,
      relevanceScore: String(item.relevanceScore),
      severity: item.severity,
      sentimentDirection: item.sentimentDirection,
      btcSpecific: item.btcSpecific,
      macroSpecific: item.macroSpecific,
      countryOrRegion: item.countryOrRegion,
      rawMetadataJson: item.raw,
    };
    if (existing) {
      Object.assign(existing, payload);
      await this.newsEvents.save(existing);
      return;
    }
    await this.newsEvents.save(this.newsEvents.create(payload));
  }

  private async upsertEconomic(
    item: ClassifiedEconomicEvent,
    fetchedAt: Date,
  ): Promise<void> {
    const existing = await this.economicEvents.findOne({
      where: { provider: item.provider, externalId: item.externalId },
    });
    const payload = {
      externalId: item.externalId,
      provider: item.provider,
      eventName: item.eventName,
      country: item.country,
      category: item.category,
      scheduledAt: item.scheduledAt,
      actualValue: item.actualValue,
      forecastValue: item.forecastValue,
      previousValue: item.previousValue,
      importance: item.importance,
      status: item.status,
      sourceUrl: item.sourceUrl,
      fetchedAt,
    };
    if (existing) {
      Object.assign(existing, payload);
      await this.economicEvents.save(existing);
      return;
    }
    await this.economicEvents.save(this.economicEvents.create(payload));
  }
}

function fromNewsRow(row: LunoBtcNewsEvent): ClassifiedNewsEvent {
  return {
    externalId: row.externalId,
    provider: row.provider,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    headline: row.headline,
    summary: row.summary,
    publishedAt: row.publishedAt,
    countryOrRegion: row.countryOrRegion,
    raw: row.rawMetadataJson ?? {},
    normalizedHeadline: row.normalizedHeadline,
    category: row.category,
    relevanceScore: Number(row.relevanceScore),
    severity: row.severity,
    sentimentDirection: row.sentimentDirection,
    btcSpecific: row.btcSpecific,
    macroSpecific: row.macroSpecific,
  };
}

function fromEconomicRow(row: LunoBtcEconomicEvent): ClassifiedEconomicEvent {
  return {
    externalId: row.externalId,
    provider: row.provider,
    eventName: row.eventName,
    country: row.country,
    scheduledAt: row.scheduledAt,
    actualValue: row.actualValue,
    forecastValue: row.forecastValue,
    previousValue: row.previousValue,
    importance: row.importance,
    status: row.status,
    sourceUrl: row.sourceUrl,
    category: row.category,
  };
}

function fromSnapshotRow(
  row: LunoBtcNewsRiskSnapshot,
): ExternalRiskSnapshotView {
  return {
    calculatedAt: row.calculatedAt,
    riskLevel: row.riskLevel,
    dominantCategory: row.dominantCategory,
    confidence: row.confidence,
    relevantEventCount: row.relevantEventCount,
    highSeverityEventCount: row.highSeverityEventCount,
    upcomingMacroEventCount: row.upcomingMacroEventCount,
    independentSourceCount: row.independentSourceCount,
    marketReactionConfirmed: row.marketReactionConfirmed,
    riskScore: row.riskScore,
    reasons: row.reasonJson ?? [],
    sourceHealth: row.sourceHealth,
    newsDataStatus: row.newsDataStatus,
    latestSourceEventAt: row.latestSourceEventAt,
    lastSuccessfulFetchAt: row.lastSuccessfulFetchAt,
  };
}

export function isRelevantNewsForDisplay(
  row: ClassifiedNewsEvent,
  now: Date,
): boolean {
  if (row.category === 'NONE' || row.relevanceScore < NEWS_RELEVANCE_MIN) {
    return false;
  }
  return now.getTime() - row.publishedAt.getTime() <= 48 * 60 * 60 * 1000;
}
