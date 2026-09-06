import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GoldService } from '../gold.service';
import { GoldReportService } from './gold-report.service';
import {
  REPORT_NOW,
  SAMPLE_LATEST,
  SAMPLE_PRICES,
  SAMPLE_PURCHASES,
} from './gold-report-test.fixtures';
import {
  SNAPSHOT_SECTION_TITLES,
  STRATEGY_SECTION_TITLES,
} from './gold-report.types';

describe('GoldReportService', () => {
  let service: GoldReportService;
  const goldService = {
    getGoldAnalyticsSource: jest.fn(),
  };

  beforeEach(async () => {
    goldService.getGoldAnalyticsSource.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        GoldReportService,
        { provide: GoldService, useValue: goldService },
      ],
    }).compile();
    service = module.get(GoldReportService);
  });

  it('scopes analytics to the authenticated user', async () => {
    goldService.getGoldAnalyticsSource.mockImplementation(
      async (userId: string) => {
        if (userId !== 'user-a') {
          return {
            purchases: [],
            prices: [],
            latestPrice: null,
            todayPriceDate: '2026-09-05',
          };
        }
        return {
          purchases: SAMPLE_PURCHASES,
          prices: SAMPLE_PRICES,
          latestPrice: SAMPLE_LATEST,
          todayPriceDate: '2026-09-05',
        };
      },
    );

    const mine = await service.buildSnapshotData('user-a', REPORT_NOW);
    const other = await service.buildSnapshotData('user-b', REPORT_NOW);

    expect(goldService.getGoldAnalyticsSource).toHaveBeenCalledWith('user-a');
    expect(mine.totalGrams).toBe('1.5000');
    expect(mine.currentValueCents).toBe(85950);
    expect(other.hasHoldings).toBe(false);
    expect(other.totalInvestedCents).toBe(0);
  });

  it('returns a valid PDF file with the snapshot filename', async () => {
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      purchases: SAMPLE_PURCHASES,
      prices: SAMPLE_PRICES,
      latestPrice: SAMPLE_LATEST,
      todayPriceDate: '2026-09-05',
    });
    const file = await service.generateSnapshotPdf('user-a', REPORT_NOW);
    expect(file.contentType).toBe('application/pdf');
    expect(file.filename).toBe('Gold-Snapshot-2026-09-05.pdf');
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(file.buffer.length).toBeGreaterThan(500);
  });

  it('returns a valid strategy PDF and rejects custom ranges', async () => {
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      purchases: SAMPLE_PURCHASES,
      prices: SAMPLE_PRICES,
      latestPrice: SAMPLE_LATEST,
      todayPriceDate: '2026-09-05',
    });
    const file = await service.generateStrategyPdf('user-a', 'ALL', REPORT_NOW);
    expect(file.filename).toBe('Gold-Strategy-2026-09-05.pdf');
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(service.parseStrategyRange(undefined)).toBe('ALL');
    expect(service.parseStrategyRange('d7')).toBe('D7');
    expect(() => service.parseStrategyRange('CUSTOM')).toThrow(
      BadRequestException,
    );
  });

  it('produces different Snapshot and Strategy PDF hashes', async () => {
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      purchases: SAMPLE_PURCHASES,
      prices: SAMPLE_PRICES,
      latestPrice: SAMPLE_LATEST,
      todayPriceDate: '2026-09-05',
    });
    const snapshot = await service.generateSnapshotPdf('user-a', REPORT_NOW);
    const strategy = await service.generateStrategyPdf(
      'user-a',
      'ALL',
      REPORT_NOW,
    );
    const snapshotHash = createHash('sha256')
      .update(snapshot.buffer)
      .digest('hex');
    const strategyHash = createHash('sha256')
      .update(strategy.buffer)
      .digest('hex');
    expect(snapshot.filename.startsWith('Gold-Snapshot-')).toBe(true);
    expect(strategy.filename.startsWith('Gold-Strategy-')).toBe(true);
    expect(snapshot.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(strategy.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(snapshot.buffer.length).not.toBe(strategy.buffer.length);
    expect(snapshotHash).not.toBe(strategyHash);
    const snapshotText = pdfHexText(snapshot.buffer);
    const strategyText = pdfHexText(strategy.buffer);
    expect(snapshotText).toContain('Gold Investment Snapshot');
    expect(snapshotText).not.toContain('1. Executive Summary');
    expect(snapshotText).not.toContain('5. Portfolio Value History');
    expect(strategyText).toContain('4. Public Gold Price Analytics');
    expect(strategyText).toContain('5. Portfolio Value History');
    expect(strategyText).toContain('6. Holdings Growth');
    expect(strategyText).toContain('7. Purchase Performance');
    expect(strategyText).toContain('8. Price History');
    expect(strategyText).toContain('9. Data Quality & Assumptions');
    for (const title of SNAPSHOT_SECTION_TITLES) {
      expect(snapshotText).toContain(title);
    }
    for (const title of STRATEGY_SECTION_TITLES) {
      expect(strategyText).toContain(title);
    }
  });
});

function pdfHexText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((match) => {
      const bytes = match[1];
      let text = '';
      for (let i = 0; i < bytes.length; i += 2) {
        text += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
      }
      return text;
    })
    .join('');
}
