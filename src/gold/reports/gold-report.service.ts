import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(GoldReportService.name);

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
    return this.generatePdf('SNAPSHOT', userId, 'ALL', now);
  }

  async generateStrategyPdf(
    userId: string,
    range: GoldPriceHistoryRange = 'ALL',
    now = new Date(),
  ): Promise<GoldReportFile> {
    return this.generatePdf('STRATEGY', userId, range, now);
  }

  private async generatePdf(
    kind: 'SNAPSHOT' | 'STRATEGY',
    userId: string,
    range: GoldPriceHistoryRange,
    now: Date,
  ): Promise<GoldReportFile> {
    const traceId = randomUUID().slice(0, 8);
    let stage = 'start';
    try {
      stage = 'build';
      this.logger.log(
        `${kind.toLowerCase()} trace=${traceId} range=${range} stage=${stage}`,
      );
      const data =
        kind === 'SNAPSHOT'
          ? await this.buildSnapshotData(userId, now)
          : await this.buildStrategyData(userId, range, now);
      stage = 'render';
      this.logger.log(
        `${kind.toLowerCase()} trace=${traceId} range=${range} stage=${stage}`,
      );
      const buffer = await renderGoldReportPdf(data);
      if (!buffer.length || buffer.subarray(0, 4).toString() !== '%PDF') {
        throw new Error('PDF_RENDER_FAILED');
      }
      stage = 'done';
      this.logger.log(
        `${kind.toLowerCase()} trace=${traceId} range=${range} stage=${stage} bytes=${buffer.length}`,
      );
      return {
        buffer,
        filename: data.filename,
        contentType: 'application/pdf',
      };
    } catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `${kind.toLowerCase()} trace=${traceId} range=${range} stage=${stage} ${stack}`,
      );
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'PDF_RENDER_FAILED',
        message:
          kind === 'SNAPSHOT'
            ? 'Failed to generate Snapshot PDF'
            : 'Failed to generate Strategy PDF',
      });
    }
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
