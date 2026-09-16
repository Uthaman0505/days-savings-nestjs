import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LUNO_MARKET_PAIR } from './luno.constants';
import { LunoApiService } from './luno-api.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import {
  LunoBtcDecisionService,
  type LunoBtcDecisionView,
} from './luno-btc-decision.service';
import {
  LunoBtcMarketCandle,
  type LunoBtcMarketInterval,
} from './entities/luno-btc-market-candle.entity';
import { LunoBtcMarketSnapshot } from './entities/luno-btc-market-snapshot.entity';
import {
  applyMarketModifier,
  calculateMarketSnapshot,
  MARKET_DATA_SOURCE,
  marketContextStatus,
  type MarketSnapshotView,
} from './accounting/luno-btc-market';
import { roundMyr } from './accounting/luno-btc-formulas';
import { displayActionFor } from './accounting/luno-btc-decision';
import { divideDecimalStrings } from './luno-decimal';
import type { LunoCandle } from './luno.types';

const INTERVALS: {
  interval: LunoBtcMarketInterval;
  durationSeconds: number;
  lookbackMs: number;
}[] = [
  {
    interval: '1h',
    durationSeconds: 3600,
    lookbackMs: 60 * 24 * 60 * 60 * 1000,
  },
  {
    interval: '4h',
    durationSeconds: 14400,
    lookbackMs: 90 * 24 * 60 * 60 * 1000,
  },
  {
    interval: '1d',
    durationSeconds: 86400,
    lookbackMs: 120 * 24 * 60 * 60 * 1000,
  },
];

export type LunoBtcMarketContextView = MarketSnapshotView & {
  marketDataSource: typeof MARKET_DATA_SOURCE;
  reasons: string[];
  calculatedAt: string;
  latestMarketCandleAt: string | null;
  snapshotCalculatedAt: string;
};

export type LunoBtcFinalDecisionView = {
  baseDecision: {
    action: LunoBtcDecisionView['action'];
    displayAction: string;
    suggestedAmountMyr: string | null;
  };
  marketContext: LunoBtcMarketContextView | null;
  finalDecision: LunoBtcDecisionView & {
    modifiedByMarketContext: boolean;
  };
};

@Injectable()
export class LunoBtcMarketService {
  private readonly logger = new Logger(LunoBtcMarketService.name);

  constructor(
    @InjectRepository(LunoBtcMarketCandle)
    private readonly candles: Repository<LunoBtcMarketCandle>,
    @InjectRepository(LunoBtcMarketSnapshot)
    private readonly snapshots: Repository<LunoBtcMarketSnapshot>,
    private readonly api: LunoApiService,
    private readonly accounting: LunoBtcAccountingService,
    private readonly decision: LunoBtcDecisionService,
  ) {}

  @Cron('20 */30 * * * *')
  async scheduledMarketRefresh(): Promise<void> {
    try {
      await this.syncBtcMarketData();
      await this.calculateBtcMarketSnapshot();
    } catch (error) {
      this.logger.warn(
        `Market refresh skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async syncBtcMarketData(now = new Date()): Promise<{ upserted: number }> {
    let upserted = 0;
    for (const spec of INTERVALS) {
      const since = now.getTime() - spec.lookbackMs;
      const rows = await this.api.getXbtMyrCandles(spec.durationSeconds, since);
      upserted += await this.upsertCandles(spec.interval, rows);
    }
    return { upserted };
  }

  async calculateBtcMarketSnapshot(
    now = new Date(),
  ): Promise<MarketSnapshotView> {
    const spend = await this.accounting.getSpendContext();
    const [hourly, daily] = await Promise.all([
      this.candles.find({
        where: {
          pair: LUNO_MARKET_PAIR,
          interval: '1h',
          source: MARKET_DATA_SOURCE,
        },
        order: { candleTime: 'ASC' },
      }),
      this.candles.find({
        where: {
          pair: LUNO_MARKET_PAIR,
          interval: '1d',
          source: MARKET_DATA_SOURCE,
        },
        order: { candleTime: 'ASC' },
      }),
    ]);
    const snapshot = calculateMarketSnapshot({
      hourly: hourly.map(toInput),
      daily: daily.map(toInput),
      now,
      averageBuyPriceMyr: spend.averageBuyPriceMyr,
    });
    await this.snapshots.save(
      this.snapshots.create({
        calculatedAt: now,
        pair: LUNO_MARKET_PAIR,
        currentPriceMyr: snapshot.currentPriceMyr,
        direction: snapshot.direction,
        buyingCondition: snapshot.buyingCondition,
        stability: snapshot.stability,
        confidence: snapshot.confidence,
        shortTrendPct: snapshot.shortTrendPct,
        mediumTrendPct: snapshot.mediumTrendPct,
        drawdownFromRecentHighPct: snapshot.drawdownFromRecentHighPct,
        volatilityPct: snapshot.volatilityPct,
        momentumValue: snapshot.momentumValue,
        sma20Myr: snapshot.sma20Myr,
        sma50Myr: snapshot.sma50Myr,
        recentHighMyr: snapshot.recentHighMyr,
        recentLowMyr: snapshot.recentLowMyr,
        marketScore: snapshot.marketScore,
        reasonJson: snapshot.reason,
        source: snapshot.source,
        latestCandleAt: snapshot.latestCandleAt,
        marketDataAgeMinutes: snapshot.marketDataAgeMinutes,
        marketContextStatus: snapshot.marketContextStatus,
      }),
    );
    return snapshot;
  }

  async getLatestBtcMarketSnapshot(
    averageBuyPriceMyr?: string | null,
    now = new Date(),
  ): Promise<MarketSnapshotView | null> {
    const latest = await this.snapshots.find({
      where: { pair: LUNO_MARKET_PAIR },
      order: { calculatedAt: 'DESC' },
      take: 1,
    });
    if (latest[0]) {
      return fromRow(latest[0], now);
    }
    const [hourly, daily] = await Promise.all([
      this.candles.find({
        where: {
          pair: LUNO_MARKET_PAIR,
          interval: '1h',
          source: MARKET_DATA_SOURCE,
        },
        order: { candleTime: 'ASC' },
      }),
      this.candles.find({
        where: {
          pair: LUNO_MARKET_PAIR,
          interval: '1d',
          source: MARKET_DATA_SOURCE,
        },
        order: { candleTime: 'ASC' },
      }),
    ]);
    if (hourly.length === 0) {
      return null;
    }
    return calculateMarketSnapshot({
      hourly: hourly.map(toInput),
      daily: daily.map(toInput),
      now,
      averageBuyPriceMyr: averageBuyPriceMyr ?? null,
    });
  }

  toMarketContextView(
    snapshot: MarketSnapshotView | null,
    calculatedAt = new Date(),
  ): LunoBtcMarketContextView | null {
    if (!snapshot) {
      return null;
    }
    return {
      ...snapshot,
      currentPriceMyr: roundMyr(snapshot.currentPriceMyr),
      shortTrendPct: roundMyr(snapshot.shortTrendPct),
      mediumTrendPct: roundMyr(snapshot.mediumTrendPct),
      drawdownFromRecentHighPct: roundMyr(snapshot.drawdownFromRecentHighPct),
      volatilityPct: roundMyr(snapshot.volatilityPct),
      momentumValue: roundMyr(snapshot.momentumValue),
      sma20Myr: roundMyr(snapshot.sma20Myr),
      sma50Myr: roundMyr(snapshot.sma50Myr),
      recentHighMyr: roundMyr(snapshot.recentHighMyr),
      recentLowMyr: roundMyr(snapshot.recentLowMyr),
      marketScore: roundMyr(snapshot.marketScore),
      marketDataAgeMinutes: roundMyr(snapshot.marketDataAgeMinutes),
      marketDataSource: MARKET_DATA_SOURCE,
      reasons: snapshot.reason,
      calculatedAt: calculatedAt.toISOString(),
      snapshotCalculatedAt: calculatedAt.toISOString(),
      latestMarketCandleAt: snapshot.latestCandleAt?.toISOString() ?? null,
    };
  }

  async getMarketContext(
    _userId: string,
  ): Promise<LunoBtcMarketContextView | null> {
    const spend = await this.accounting.getSpendContext();
    const snapshot = await this.getLatestBtcMarketSnapshot(
      spend.averageBuyPriceMyr,
    );
    return this.toMarketContextView(snapshot);
  }

  async getFinalDecision(userId: string): Promise<LunoBtcFinalDecisionView> {
    const base = await this.decision.getCurrentDecision(userId);
    const snapshot = await this.getLatestBtcMarketSnapshot(
      base.averageBuyPriceMyr,
    );
    const modified = applyMarketModifier(base, snapshot);
    return {
      baseDecision: {
        action: base.action,
        displayAction: base.displayAction,
        suggestedAmountMyr: base.suggestedAmountMyr,
      },
      marketContext: this.toMarketContextView(snapshot),
      finalDecision: {
        ...base,
        ...modified,
        displayAction: displayActionFor(modified.action),
        modifiedByMarketContext: modified.modifiedByMarketContext,
      },
    };
  }

  private async upsertCandles(
    interval: LunoBtcMarketInterval,
    rows: LunoCandle[],
  ): Promise<number> {
    let count = 0;
    for (const row of rows) {
      if (!row.timestamp) {
        continue;
      }
      const candleTime = new Date(row.timestamp);
      const existing = await this.candles.findOne({
        where: {
          pair: LUNO_MARKET_PAIR,
          interval,
          candleTime,
          source: MARKET_DATA_SOURCE,
        },
      });
      if (existing) {
        existing.open = row.open;
        existing.high = row.high;
        existing.low = row.low;
        existing.close = row.close;
        existing.volume = row.volume;
        await this.candles.save(existing);
      } else {
        await this.candles.save(
          this.candles.create({
            pair: LUNO_MARKET_PAIR,
            interval,
            candleTime,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            source: MARKET_DATA_SOURCE,
          }),
        );
      }
      count += 1;
    }
    return count;
  }
}

function toInput(row: LunoBtcMarketCandle) {
  return {
    time: row.candleTime,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  };
}

function fromRow(
  row: LunoBtcMarketSnapshot,
  now = new Date(),
): MarketSnapshotView {
  const status = marketContextStatus(row.latestCandleAt, now);
  const ageMinutes = row.latestCandleAt
    ? divideDecimalStrings(
        String(Math.max(0, now.getTime() - row.latestCandleAt.getTime())),
        String(60_000),
        2,
      )
    : row.marketDataAgeMinutes;
  return {
    direction: row.direction,
    buyingCondition: row.buyingCondition,
    stability: row.stability,
    confidence: status === 'FRESH' ? row.confidence : 'LOW',
    currentPriceMyr: row.currentPriceMyr,
    shortTrendPct: row.shortTrendPct,
    mediumTrendPct: row.mediumTrendPct,
    drawdownFromRecentHighPct: row.drawdownFromRecentHighPct,
    volatilityPct: row.volatilityPct,
    momentumValue: row.momentumValue,
    sma20Myr: row.sma20Myr,
    sma50Myr: row.sma50Myr,
    recentHighMyr: row.recentHighMyr,
    recentLowMyr: row.recentLowMyr,
    marketScore: row.marketScore,
    reason: row.reasonJson ?? [],
    source: row.source,
    latestCandleAt: row.latestCandleAt,
    marketDataAgeMinutes: ageMinutes,
    marketContextStatus: status,
  };
}
