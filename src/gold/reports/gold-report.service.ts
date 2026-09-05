import { BadRequestException, Injectable } from '@nestjs/common';
import { computeGoldPriceAnalytics } from '../gold-price-analytics';
import type { GoldPriceHistoryRange } from '../gold-price-analytics';
import { computeGoldPortfolioAnalytics } from '../gold-portfolio-analytics';
import { GoldService } from '../gold.service';
import {
  buildGoldSnapshotReportData,
  buildGoldStrategyReportData,
} from './gold-report-data';
import { renderGoldReportPdf } from './gold-report-pdf';
import type {
  GoldSnapshotReportData,
  GoldStrategyReportData,
} from './gold-report.types';

export type GoldReportFile = {
  buffer: Buffer;
  filename: string;
  contentType: 'application/pdf';
};

@Injectable()
export class GoldReportService {
  constructor(private readonly goldService: GoldService) {}

  async buildSnapshotData(
    userId: string,
    now = new Date(),
  ): Promise<GoldSnapshotReportData> {
    const source = await this.goldService.getGoldAnalyticsSource(userId);
    const portfolio = computeGoldPortfolioAnalytics(
      source.purchases,
      source.prices,
      {
        range: 'ALL',
        now,
        todayPriceDate: source.todayPriceDate,
        latestPrice: source.latestPrice,
      },
    );
    const priceD7 = computeGoldPriceAnalytics(source.prices, {
      range: 'D7',
      now,
      todayPriceDate: source.todayPriceDate,
    });
    return buildGoldSnapshotReportData({
      generatedAt: now,
      portfolio,
      priceD7,
    });
  }

  async buildStrategyData(
    userId: string,
    range: GoldPriceHistoryRange = 'ALL',
    now = new Date(),
  ): Promise<GoldStrategyReportData> {
    const source = await this.goldService.getGoldAnalyticsSource(userId);
    const portfolio = computeGoldPortfolioAnalytics(
      source.purchases,
      source.prices,
      {
        range,
        now,
        todayPriceDate: source.todayPriceDate,
        latestPrice: source.latestPrice,
      },
    );
    const priceInput = { now, todayPriceDate: source.todayPriceDate };
    return buildGoldStrategyReportData({
      generatedAt: now,
      requestedRange: range,
      portfolio,
      priceD7: computeGoldPriceAnalytics(source.prices, {
        range: 'D7',
        ...priceInput,
      }),
      priceD30: computeGoldPriceAnalytics(source.prices, {
        range: 'D30',
        ...priceInput,
      }),
      priceD90: computeGoldPriceAnalytics(source.prices, {
        range: 'D90',
        ...priceInput,
      }),
      priceAll: computeGoldPriceAnalytics(source.prices, {
        range: 'ALL',
        ...priceInput,
      }),
    });
  }

  async generateSnapshotPdf(
    userId: string,
    now = new Date(),
  ): Promise<GoldReportFile> {
    const data = await this.buildSnapshotData(userId, now);
    const buffer = await renderGoldReportPdf(data);
    return {
      buffer,
      filename: data.filename,
      contentType: 'application/pdf',
    };
  }

  async generateStrategyPdf(
    userId: string,
    range: GoldPriceHistoryRange = 'ALL',
    now = new Date(),
  ): Promise<GoldReportFile> {
    const data = await this.buildStrategyData(userId, range, now);
    const buffer = await renderGoldReportPdf(data);
    return {
      buffer,
      filename: data.filename,
      contentType: 'application/pdf',
    };
  }

  parseStrategyRange(raw?: string): Exclude<GoldPriceHistoryRange, 'CUSTOM'> {
    const range = (raw ?? 'ALL').trim().toUpperCase();
    if (
      range === 'D7' ||
      range === 'D30' ||
      range === 'D90' ||
      range === 'ALL'
    ) {
      return range;
    }
    throw new BadRequestException('range must be D7, D30, D90, or ALL.');
  }
}
