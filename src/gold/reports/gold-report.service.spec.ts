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
});
